/**
 * Pure utility functions for script manipulation
 * These functions have no side effects and are easily testable
 */

import { applyPatch } from 'diff';

/**
 * Result of applying a patch to a script
 */
export interface PatchResult {
  success: boolean;
  script?: string;
  error?: string;
  details?: {
    reason: string;
    suggestion?: string;
  };
}

/**
 * Options for applying a patch
 */
export interface PatchOptions {
  fuzzFactor?: number;
}

/**
 * Apply a unified diff patch to a script
 * 
 * @param script - The original script content
 * @param patch - Unified diff format patch
 * @param options - Patch options (fuzzFactor, etc.)
 * @returns PatchResult with success status and either new script or error
 */
export function applyPatchToScript(
  script: string,
  patch: string,
  options: PatchOptions = {}
): PatchResult {
  const { fuzzFactor = 0 } = options;

  // Handle empty patch
  if (!patch || patch.trim() === '') {
    return {
      success: false,
      error: 'Empty patch provided',
      details: {
        reason: 'The patch string is empty',
        suggestion: 'Provide a valid unified diff patch'
      }
    };
  }

  // Check for basic patch format (should contain @@ markers)
  if (!patch.includes('@@')) {
    return {
      success: false,
      error: 'Invalid patch format',
      details: {
        reason: 'Patch does not contain unified diff hunk headers (@@)',
        suggestion: 'Ensure the patch is in unified diff format with @@ markers'
      }
    };
  }

  try {
    const result = applyPatch(script, patch, {
      fuzzFactor
    });

    if (result === false) {
      return {
        success: false,
        error: 'Patch failed to apply',
        details: {
          reason: 'Context mismatch - the script content does not match the patch context',
          suggestion: 'Re-read the script with get_script and regenerate the patch, or increase fuzzFactor'
        }
      };
    }

    return {
      success: true,
      script: result
    };
  } catch (err) {
    return {
      success: false,
      error: `Patch error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      details: {
        reason: 'An exception occurred while applying the patch',
        suggestion: 'Check the patch format and try again'
      }
    };
  }
}

/**
 * Replace a single line in a script
 * 
 * @param script - The original script content
 * @param line - Line number to replace (1-based)
 * @param content - New content for the line
 * @returns The modified script
 * @throws Error if line number is out of range
 */
export function fixLineInScript(
  script: string,
  line: number,
  content: string
): string {
  const lines = script.split('\n');
  
  if (line < 1 || line > lines.length) {
    throw new Error(`Line ${line} out of range (valid: 1-${lines.length})`);
  }
  
  lines[line - 1] = content;
  return lines.join('\n');
}

/**
 * Check if set_script should be allowed for an existing callback
 * 
 * @param existingScript - Current content of the callback
 * @param maxLines - Maximum allowed lines for full replacement
 * @returns true if set_script should be allowed
 */
export function shouldAllowSetScript(
  existingScript: string,
  maxLines: number
): boolean {
  // Allow if script is empty or whitespace-only
  if (!existingScript || existingScript.trim() === '') {
    return true;
  }
  
  const lineCount = existingScript.split('\n').length;
  return lineCount <= maxLines;
}

/**
 * Get the configured maximum lines for set_script
 * Reads from HISE_SET_SCRIPT_MAX_LINES environment variable
 * 
 * @returns The maximum line count threshold
 */
export function getSetScriptMaxLines(): number {
  const envValue = process.env.HISE_SET_SCRIPT_MAX_LINES;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 30; // Default
}
