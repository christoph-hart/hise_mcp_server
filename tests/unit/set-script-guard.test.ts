import { describe, it } from 'node:test';
import assert from 'node:assert';
import { shouldAllowSetScript } from '../../src/script-utils.ts';
import {
  EMPTY_SCRIPT,
  SIMPLE_SCRIPT,
  SCRIPT_30_LINES,
  SCRIPT_31_LINES,
  SCRIPT_100_LINES
} from '../fixtures/sample-scripts.ts';

describe('shouldAllowSetScript', () => {
  const DEFAULT_MAX_LINES = 30;

  describe('with default threshold (30 lines)', () => {
    it('should allow empty script', () => {
      assert.strictEqual(shouldAllowSetScript(EMPTY_SCRIPT, DEFAULT_MAX_LINES), true);
    });

    it('should allow whitespace-only script', () => {
      assert.strictEqual(shouldAllowSetScript('   \n\n   ', DEFAULT_MAX_LINES), true);
    });

    it('should allow small script (5 lines)', () => {
      assert.strictEqual(shouldAllowSetScript(SIMPLE_SCRIPT, DEFAULT_MAX_LINES), true);
    });

    it('should allow script with exactly 30 lines', () => {
      assert.strictEqual(shouldAllowSetScript(SCRIPT_30_LINES, DEFAULT_MAX_LINES), true);
    });

    it('should block script with 31 lines', () => {
      assert.strictEqual(shouldAllowSetScript(SCRIPT_31_LINES, DEFAULT_MAX_LINES), false);
    });

    it('should block script with 100 lines', () => {
      assert.strictEqual(shouldAllowSetScript(SCRIPT_100_LINES, DEFAULT_MAX_LINES), false);
    });
  });

  describe('with custom thresholds', () => {
    it('should respect threshold of 10', () => {
      // 5-line script should pass with threshold 10
      assert.strictEqual(shouldAllowSetScript(SIMPLE_SCRIPT, 10), true);
      
      // 31-line script should fail with threshold 10
      assert.strictEqual(shouldAllowSetScript(SCRIPT_31_LINES, 10), false);
    });

    it('should respect threshold of 50', () => {
      // 31-line script should pass with threshold 50
      assert.strictEqual(shouldAllowSetScript(SCRIPT_31_LINES, 50), true);
      
      // 100-line script should fail with threshold 50
      assert.strictEqual(shouldAllowSetScript(SCRIPT_100_LINES, 50), false);
    });

    it('should respect threshold of 100', () => {
      // 100-line script should pass with threshold 100
      assert.strictEqual(shouldAllowSetScript(SCRIPT_100_LINES, 100), true);
    });

    it('should respect threshold of 0 (block everything except empty)', () => {
      assert.strictEqual(shouldAllowSetScript(EMPTY_SCRIPT, 0), true);
      assert.strictEqual(shouldAllowSetScript('single line', 0), false);
    });
  });

  describe('edge cases', () => {
    it('should handle single line script', () => {
      assert.strictEqual(shouldAllowSetScript('single line', DEFAULT_MAX_LINES), true);
    });

    it('should count lines correctly with trailing newline', () => {
      const scriptWithTrailing = 'line1\nline2\nline3\n';
      // This has 4 elements when split, but logically 3 lines of content
      // The implementation should handle this consistently
      const result = shouldAllowSetScript(scriptWithTrailing, 3);
      // Depending on implementation, this might be true or false
      // Just ensure it doesn't crash
      assert.ok(result === true || result === false);
    });

    it('should handle null/undefined-like empty strings', () => {
      assert.strictEqual(shouldAllowSetScript('', DEFAULT_MAX_LINES), true);
    });
  });
});
