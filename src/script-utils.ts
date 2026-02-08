/**
 * Pure utility functions for script manipulation
 * These functions have no side effects and are easily testable
 */

/**
 * Result of editing a string in a script
 */
export interface EditResult {
  success: boolean;
  script?: string;
  error?: string;
}

/**
 * Replace a string in a script (works like the native mcp_edit tool)
 * 
 * @param script - The original script content
 * @param oldString - The exact string to find and replace
 * @param newString - The replacement string
 * @param replaceAll - If true, replace all occurrences; if false, fail on multiple matches
 * @returns EditResult with success status and either new script or error
 */
export function editStringInScript(
  script: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false
): EditResult {
  // Check if oldString exists in script
  if (!script.includes(oldString)) {
    return {
      success: false,
      error: 'oldString not found in script'
    };
  }

  // Count occurrences
  const occurrences = script.split(oldString).length - 1;

  // If multiple occurrences and not replaceAll, fail
  if (occurrences > 1 && !replaceAll) {
    return {
      success: false,
      error: `oldString found ${occurrences} times - use replaceAll to replace all occurrences, or provide more context to make it unique`
    };
  }

  // Perform the replacement
  const newScript = replaceAll 
    ? script.split(oldString).join(newString)
    : script.replace(oldString, newString);

  return {
    success: true,
    script: newScript
  };
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
 * @returns The maximum line count threshold (default: 50)
 */
export function getSetScriptMaxLines(): number {
  const envValue = process.env.HISE_SET_SCRIPT_MAX_LINES;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return 50; // Default
}
