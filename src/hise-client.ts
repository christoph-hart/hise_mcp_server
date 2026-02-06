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
} from './types.js';

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
   */
  async getScript(moduleId: string, callback?: string): Promise<HiseScriptResponse> {
    const params = new URLSearchParams({ moduleId });
    if (callback) {
      params.append('callback', callback);
    }

    return this.fetchWithTimeout<HiseScriptResponse>(
      `/api/get_script?${params.toString()}`,
      'GET',
      undefined,
      this.getCompileTimeout()
    );
  }

  /**
   * Set script content and optionally compile
   * 
   * @param params - Script parameters including moduleId, script, callback, and compile flag
   */
  async setScript(params: SetScriptParams): Promise<HiseCompileResponse> {
    return this.fetchWithTimeout<HiseCompileResponse>(
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
  }

  /**
   * Recompile a processor without changing its script
   * 
   * @param moduleId - The script processor's module ID
   */
  async recompile(moduleId: string): Promise<HiseCompileResponse> {
    return this.fetchWithTimeout<HiseCompileResponse>(
      '/api/recompile',
      'POST',
      { moduleId },
      this.getCompileTimeout()
    );
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
