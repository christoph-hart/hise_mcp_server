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
  appliedPatch?: string;  // The (header-fixed) patch that was applied
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
 * Fix line counts in unified diff hunk headers.
 * 
 * LLMs frequently miscalculate the line counts in headers like @@ -X,Y +X,Z @@.
 * This function parses the patch content and recalculates the correct counts
 * based on the actual number of context, added, and removed lines.
 * 
 * @param patch - The unified diff patch (possibly with incorrect line counts)
 * @returns The patch with corrected hunk headers
 */
export function fixPatchHeaders(patch: string): string {
  const lines = patch.split('\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match hunk header: @@ -oldStart[,oldCount] +newStart[,newCount] @@[suffix]
    const headerMatch = line.match(/^@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@(.*)$/);
    
    if (headerMatch) {
      const oldStart = parseInt(headerMatch[1]);
      const newStart = parseInt(headerMatch[2]);
      const suffix = headerMatch[3] || '';
      
      // Count actual lines in this hunk until next header or end
      let oldLines = 0;
      let newLines = 0;
      let j = i + 1;
      
      while (j < lines.length && !lines[j].startsWith('@@')) {
        const l = lines[j];
        if (l.startsWith('-')) {
          // Removed line - only counts for old side
          oldLines++;
        } else if (l.startsWith('+')) {
          // Added line - only counts for new side
          newLines++;
        } else if (l.startsWith(' ') || l === '') {
          // Context line - counts for both sides
          oldLines++;
          newLines++;
        }
        j++;
      }
      
      // Emit corrected header
      result.push(`@@ -${oldStart},${oldLines} +${newStart},${newLines} @@${suffix}`);
    } else {
      result.push(line);
    }
  }
  
  return result.join('\n');
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
  const { fuzzFactor = 2 } = options;

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

  // Fix line counts in hunk headers (LLMs often get these wrong)
  const fixedPatch = fixPatchHeaders(patch);

  try {
    const result = applyPatch(script, fixedPatch, {
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
      script: result,
      appliedPatch: fixedPatch
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
 * Result of editing a string in a script
 */
export interface EditResult {
  success: boolean;
  script?: string;
  error?: string;
}

/**
 * Replace a string in a script (similar to mcp_edit's oldString/newString approach)
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
