/**
 * HISE REST API Client
 * 
 * Provides typed wrappers for HISE REST API endpoints.
 * Used by the MCP server to bridge to a running HISE instance.
 * 
 * @see ADDING_RUNTIME_BRIDGES.md for documentation on adding new bridge tools
 */

import {
  HiseStatusResponse,
  HiseScriptResponse,
  HiseCompileResponse,
  HiseScreenshotResponse,
  SetScriptParams,
  ScreenshotParams,
  HiseListComponentsResponse,
  HiseGetComponentPropertiesResponse,
  HiseSetComponentPropertiesResponse,
  HiseGetComponentValueResponse,
  HiseSetComponentValueResponse,
  HiseGetSelectedComponentsResponse,
  SetComponentPropertiesParams,
  SetComponentValueParams,
  GetScriptOptions,
  GetComponentPropertiesOptions,
  HiseError,
  ErrorCodeContext,
} from './types.js';

// ============================================================================
// Callstack Parsing Utilities
// ============================================================================

/**
 * Parsed callstack entry with location info
 */
export interface ParsedCallstack {
  callback: string;
  moduleId: string;
  line: number;
  column: number;
}

/**
 * Parse HISE callstack entry to extract location info
 * Format: "onInit() at Interface.js:57:16"
 */
export function parseCallstackEntry(entry: string): ParsedCallstack | null {
  const match = entry.match(/^(\w+)\(\) at (\w+)\.js:(\d+):(\d+)$/);
  if (!match) return null;
  return {
    callback: match[1],
    moduleId: match[2],
    line: parseInt(match[3], 10),
    column: parseInt(match[4], 10),
  };
}

/**
 * Format code lines with line numbers
 */
export function formatCodeWithLineNumbers(code: string, startLine: number): string {
  return code
    .split('\n')
    .map((line, i) => `${startLine + i}: ${line}`)
    .join('\n');
}

/**
 * Configuration for the HISE client
 */
export interface HiseClientConfig {
  baseUrl: string;
  timeouts: {
    status: number;      // For status/connectivity checks
    script: number;      // For script compilation (can be slow)
    screenshot: number;  // For screenshot capture
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: HiseClientConfig = {
  baseUrl: process.env.HISE_API_URL || 'http://localhost:1900',
  timeouts: {
    status: 3000,      // 3 seconds
    script: 30000,     // 30 seconds (compilation can be slow)
    screenshot: 10000, // 10 seconds
  },
};

/**
 * HISE REST API Client
 * 
 * Provides methods to interact with a running HISE instance via its REST API.
 * All methods handle errors gracefully and return structured responses.
 */
export class HiseClient {
  private config: HiseClientConfig;
  private cachedCompileTimeout: number | null = null;

  constructor(config?: Partial<HiseClientConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      timeouts: {
        ...DEFAULT_CONFIG.timeouts,
        ...config?.timeouts,
      },
    };
  }

  /**
   * Get the compile timeout - uses cached value from HISE status if available
   */
  private getCompileTimeout(): number {
    return this.cachedCompileTimeout ?? this.config.timeouts.script;
  }

  /**
   * Get the configured base URL
   */
  getBaseUrl(): string {
    return this.config.baseUrl;
  }

  /**
   * Check if HISE is available and responding
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeouts.status);

      const response = await fetch(`${this.config.baseUrl}/api/status`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get HISE status including project info and script processors.
   * Also caches the compileTimeout for use in subsequent script operations.
   */
  async getStatus(): Promise<HiseStatusResponse> {
    const status = await this.fetchWithTimeout<HiseStatusResponse>(
      '/api/status',
      'GET',
      undefined,
      this.config.timeouts.status
    );

    // Cache the compile timeout from HISE (convert from seconds to milliseconds)
    if (status.success && status.server?.compileTimeout) {
      const timeoutSeconds = parseInt(status.server.compileTimeout, 10);
      if (!isNaN(timeoutSeconds) && timeoutSeconds > 0) {
        this.cachedCompileTimeout = timeoutSeconds * 1000;
      }
    }

    return status;
  }

  /**
   * Get script content from a processor
   * 
   * @param moduleId - The script processor's module ID (e.g., "Interface")
   * @param callback - Optional: specific callback name (e.g., "onInit")
   * @param options - Optional: line range filtering options
   */
  async getScript(moduleId: string, callback?: string, options?: GetScriptOptions): Promise<HiseScriptResponse> {
    const params = new URLSearchParams({ moduleId });
    if (callback) {
      params.append('callback', callback);
    }

    const result = await this.fetchWithTimeout<HiseScriptResponse>(
      `/api/get_script?${params.toString()}`,
      'GET',
      undefined,
      this.getCompileTimeout()
    );

    // Apply line range filtering if requested
    if (result.success && result.script && options?.startLine !== undefined) {
      const lines = result.script.split('\n');
      const totalLines = lines.length;
      
      // Convert to 0-based index, clamp to valid range
      const startIdx = Math.max(0, Math.min(options.startLine - 1, totalLines - 1));
      const endIdx = options.endLine !== undefined 
        ? Math.min(totalLines, options.endLine)
        : totalLines;
      
      // Ensure end is not before start
      const actualEndIdx = Math.max(startIdx + 1, endIdx);
      
      // Extract the requested lines
      result.script = lines.slice(startIdx, actualEndIdx).join('\n');
      
      // Add metadata about the line range
      result.lineRange = {
        start: startIdx + 1,  // Back to 1-based
        end: Math.min(actualEndIdx, totalLines),  // 1-based, clamped to actual lines
        total: totalLines,
      };
    }

    return result;
  }

  /**
   * Set script content and optionally compile
   * 
   * @param params - Script parameters including moduleId, script, callback, and compile flag
   * @param errorContextLines - Lines of context around errors (default: 1)
   */
  async setScript(params: SetScriptParams, errorContextLines: number = 1): Promise<HiseCompileResponse> {
    const result = await this.fetchWithTimeout<HiseCompileResponse>(
      '/api/set_script',
      'POST',
      {
        moduleId: params.moduleId,
        script: params.script,
        callback: params.callback,
        compile: params.compile ?? true,
      },
      this.getCompileTimeout()
    );

    // Enrich errors with code context if compilation failed
    if (!result.success && result.errors?.length && errorContextLines > 0) {
      await this.enrichErrorsWithCodeContext(params.moduleId, result.errors, errorContextLines);
    }

    return result;
  }

  /**
   * Recompile a processor without changing its script
   * 
   * @param moduleId - The script processor's module ID
   * @param errorContextLines - Lines of context around errors (default: 1)
   */
  async recompile(moduleId: string, errorContextLines: number = 1): Promise<HiseCompileResponse> {
    const result = await this.fetchWithTimeout<HiseCompileResponse>(
      '/api/recompile',
      'POST',
      { moduleId },
      this.getCompileTimeout()
    );

    // Enrich errors with code context if compilation failed
    if (!result.success && result.errors?.length && errorContextLines > 0) {
      await this.enrichErrorsWithCodeContext(moduleId, result.errors, errorContextLines);
    }

    return result;
  }

  /**
   * Enrich errors with code context from the script
   * 
   * @param moduleId - The script processor's module ID
   * @param errors - Array of errors to enrich
   * @param contextLines - Number of lines before/after the error line
   */
  private async enrichErrorsWithCodeContext(
    moduleId: string,
    errors: HiseError[],
    contextLines: number
  ): Promise<void> {
    for (const error of errors) {
      if (!error.callstack?.length) continue;

      // Parse the first callstack entry
      const location = parseCallstackEntry(error.callstack[0]);
      if (!location || location.moduleId !== moduleId) continue;

      try {
        // Fetch lines around the error
        const startLine = Math.max(1, location.line - contextLines);
        const endLine = location.line + contextLines;

        // For anonymous functions (callback === "function"), fetch without specifying callback
        // This gets the merged script where we can find the line
        const callbackToFetch = location.callback === 'function' ? undefined : location.callback;
        const script = await this.getScript(moduleId, callbackToFetch, { startLine, endLine });

        if (script.success && script.script && script.lineRange) {
          const codeContext: ErrorCodeContext = {
            callback: location.callback,
            line: location.line,
            column: location.column,
            code: formatCodeWithLineNumbers(script.script, script.lineRange.start),
          };
          error.codeContext = codeContext;
        }
      } catch {
        // If fetching context fails, just continue without it
      }
    }
  }

  /**
   * Capture a screenshot of the interface or a specific component
   * 
   * @param params - Screenshot parameters including moduleId, id, scale, and outputPath
   */
  async screenshot(params: ScreenshotParams): Promise<HiseScreenshotResponse> {
    const urlParams = new URLSearchParams();
    
    if (params.moduleId) {
      urlParams.append('moduleId', params.moduleId);
    }
    if (params.id) {
      urlParams.append('id', params.id);
    }
    if (params.scale !== undefined) {
      urlParams.append('scale', params.scale.toString());
    }
    if (params.outputPath) {
      urlParams.append('outputPath', params.outputPath);
    }

    const queryString = urlParams.toString();
    const url = queryString ? `/api/screenshot?${queryString}` : '/api/screenshot';

    return this.fetchWithTimeout<HiseScreenshotResponse>(
      url,
      'GET',
      undefined,
      this.config.timeouts.screenshot
    );
  }

  // ==========================================================================
  // Component Methods
  // ==========================================================================

  /**
   * List all UI components in a script processor
   * 
   * @param moduleId - The script processor's module ID
   * @param hierarchy - If true, returns nested tree with layout properties
   */
  async listComponents(moduleId: string, hierarchy?: boolean): Promise<HiseListComponentsResponse> {
    const params = new URLSearchParams({ moduleId });
    if (hierarchy) {
      params.append('hierarchy', 'true');
    }

    return this.fetchWithTimeout<HiseListComponentsResponse>(
      `/api/list_components?${params.toString()}`,
      'GET',
      undefined,
      this.config.timeouts.status
    );
  }

  /**
   * Get properties for a specific UI component
   * 
   * @param moduleId - The script processor's module ID
   * @param id - The component's ID (e.g., "Button1")
   * @param options - Optional: filtering options (compact mode, specific properties)
   */
  async getComponentProperties(
    moduleId: string, 
    id: string,
    options?: GetComponentPropertiesOptions
  ): Promise<HiseGetComponentPropertiesResponse> {
    const params = new URLSearchParams({ moduleId, id });

    const result = await this.fetchWithTimeout<HiseGetComponentPropertiesResponse>(
      `/api/get_component_properties?${params.toString()}`,
      'GET',
      undefined,
      this.config.timeouts.status
    );

    // Apply filtering if successful and properties exist
    if (result.success && result.properties) {
      // If specific properties requested, filter to only those
      if (options?.properties?.length) {
        const requestedProps = new Set(options.properties.map(p => p.toLowerCase()));
        result.properties = result.properties.filter(p => 
          requestedProps.has(p.id.toLowerCase())
        );
      }
      // Default behavior (compact=true): only return non-default properties
      else if (options?.compact !== false) {
        const nonDefaultProps = result.properties.filter(p => !p.isDefault);
        
        // If all properties are default, omit the properties field entirely
        if (nonDefaultProps.length === 0) {
          delete result.properties;
        } else {
          result.properties = nonDefaultProps;
        }
      }
      // compact=false: return all properties (no filtering)
    }

    return result;
  }

  /**
   * Set properties on one or more UI components
   * 
   * @param params - Parameters including moduleId, changes array, and optional force flag
   */
  async setComponentProperties(params: SetComponentPropertiesParams): Promise<HiseSetComponentPropertiesResponse> {
    return this.fetchWithTimeout<HiseSetComponentPropertiesResponse>(
      '/api/set_component_properties',
      'POST',
      {
        moduleId: params.moduleId,
        changes: params.changes,
        force: params.force ?? false,
      },
      this.config.timeouts.status
    );
  }

  /**
   * Get the current runtime value of a UI component
   * 
   * @param moduleId - The script processor's module ID
   * @param id - The component's ID
   */
  async getComponentValue(moduleId: string, id: string): Promise<HiseGetComponentValueResponse> {
    const params = new URLSearchParams({ moduleId, id });

    return this.fetchWithTimeout<HiseGetComponentValueResponse>(
      `/api/get_component_value?${params.toString()}`,
      'GET',
      undefined,
      this.config.timeouts.status
    );
  }

  /**
   * Set the runtime value of a UI component (triggers control callback)
   * 
   * @param params - Parameters including moduleId, id, value, and optional validateRange
   */
  async setComponentValue(params: SetComponentValueParams): Promise<HiseSetComponentValueResponse> {
    return this.fetchWithTimeout<HiseSetComponentValueResponse>(
      '/api/set_component_value',
      'POST',
      {
        moduleId: params.moduleId,
        id: params.id,
        value: params.value,
        validateRange: params.validateRange ?? false,
      },
      this.getCompileTimeout()  // Uses compile timeout since callbacks may run
    );
  }

  /**
   * Get the currently selected UI components from the Interface Designer
   * 
   * @param moduleId - The script processor's module ID (default: "Interface")
   */
  async getSelectedComponents(moduleId?: string): Promise<HiseGetSelectedComponentsResponse> {
    const params = new URLSearchParams();
    if (moduleId) {
      params.append('moduleId', moduleId);
    }

    const queryString = params.toString();
    const url = queryString ? `/api/get_selected_components?${queryString}` : '/api/get_selected_components';

    return this.fetchWithTimeout<HiseGetSelectedComponentsResponse>(
      url,
      'GET',
      undefined,
      this.config.timeouts.status
    );
  }

  /**
   * Internal helper to make fetch requests with timeout
   */
  private async fetchWithTimeout<T>(
    path: string,
    method: 'GET' | 'POST',
    body?: Record<string, unknown>,
    timeout: number = this.config.timeouts.status
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const options: RequestInit = {
        method,
        signal: controller.signal,
        headers: {},
      };

      if (body) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${this.config.baseUrl}${path}`, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HISE API error (${response.status}): ${errorText}`);
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`HISE API timeout after ${timeout}ms`);
        }
        if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
          throw new Error(
            `Cannot connect to HISE at ${this.config.baseUrl}. ` +
            `Ensure HISE is running with the REST API enabled.`
          );
        }
        throw error;
      }
      throw new Error(`Unknown error connecting to HISE: ${error}`);
    }
  }
}

// Singleton instance
let hiseClientInstance: HiseClient | null = null;

/**
 * Get the shared HISE client instance
 * 
 * Uses HISE_API_URL environment variable or defaults to http://localhost:1900
 */
export function getHiseClient(): HiseClient {
  if (!hiseClientInstance) {
    hiseClientInstance = new HiseClient();
  }
  return hiseClientInstance;
}

/**
 * Reset the shared HISE client instance (useful for testing)
 */
export function resetHiseClient(): void {
  hiseClientInstance = null;
}
