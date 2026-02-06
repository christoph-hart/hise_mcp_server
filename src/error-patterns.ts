/**
 * Error Pattern Definitions for HISE Compile Errors
 * 
 * These patterns match common HiseScript errors and provide helpful suggestions.
 * Especially useful for LLMs that are trained on JavaScript but writing HiseScript.
 * 
 * To add new patterns:
 * 1. Observe the exact error message from HISE
 * 2. Create a pattern that matches it
 * 3. Optionally add a codePattern to match the actual code
 * 4. Write a clear, actionable suggestion
 */

export interface ErrorPattern {
  /** Unique identifier for tracking/analytics */
  id: string;
  /** Regex to match against errorMessage */
  pattern: RegExp;
  /** Optional: also match against the code context */
  codePattern: RegExp | null;
  /** Human-readable fix suggestion */
  suggestion: string;
}

export const ERROR_PATTERNS: ErrorPattern[] = [
  // Graphics methods expect arrays, not separate arguments
  {
    id: "graphics-array-args",
    pattern: /argument amount mismatch.*Expected:\s*1/i,
    codePattern: /\.(fillRect|drawRect|drawRoundedRectangle|fillRoundedRectangle|drawEllipse|fillEllipse|drawLine|drawHorizontalLine|drawDropShadow)\s*\(\s*[\d.-]+\s*,/,
    suggestion: "Graphics methods expect arrays: g.fillRect([x, y, w, h]) not g.fillRect(x, y, w, h)"
  },

  // Console.assertTrue only takes one argument
  {
    id: "assert-with-message",
    pattern: /Too many arguments in API call Console\.assertTrue\(\)\. Expected: 1/i,
    codePattern: /Console\.assertTrue\s*\([^,]+,/,
    suggestion: "Console.assertTrue(condition) only takes one argument. Use Console.assertWithMessage(condition, \"message\") for a custom error message"
  },

  // Can't use 'var' inside inline functions - use 'local'
  {
    id: "var-in-inline",
    pattern: /Can't declare var statement in inline function/i,
    codePattern: null,
    suggestion: "Use 'local' instead of 'var' inside inline functions: local x = 90;"
  },

  // Can't use 'const' inside inline functions - must be global
  {
    id: "const-in-inline",
    pattern: /const var declaration must be on global level/i,
    codePattern: null,
    suggestion: "const/reg/global can only be declared at the top level. Inside inline functions, use 'local' instead"
  },

  // Can't use 'var' initializer in for loops inside inline functions
  {
    id: "var-in-for-loop",
    pattern: /Can't use var initialiser inside inline function/i,
    codePattern: /for\s*\(\s*var\s+/,
    suggestion: "Omit 'var' in for loops inside inline functions: for(i = 0; i < 100; i++) not for(var i = 0; ...)"
  },
];

/**
 * Find matching error pattern for an error message
 * 
 * @param errorMessage - The error message from HISE
 * @param code - Optional code context to match against codePattern
 * @returns The matching pattern's suggestion, or null if no match
 */
export function findPatternMatch(errorMessage: string, code?: string): string | null {
  for (const pattern of ERROR_PATTERNS) {
    // Check if error message matches
    if (!pattern.pattern.test(errorMessage)) {
      continue;
    }

    // If there's a code pattern, check that too
    if (pattern.codePattern && code) {
      if (!pattern.codePattern.test(code)) {
        continue;
      }
    }

    return pattern.suggestion;
  }

  return null;
}
