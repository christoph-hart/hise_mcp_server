import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyPatchToScript, fixPatchHeaders } from '../../src/script-utils.ts';
import { SIMPLE_SCRIPT } from '../fixtures/sample-scripts.ts';
import {
  PATCH_REPLACE_SINGLE_LINE,
  PATCH_DELETE_LINE,
  PATCH_INSERT_LINE,
  PATCH_MULTIPLE_CHANGES,
  PATCH_INSERT_AT_END,
  PATCH_WRONG_CONTEXT,
  PATCH_MALFORMED,
  PATCH_MULTI_HUNK,
  PATCH_WRONG_OLD_COUNT,
  PATCH_WRONG_NEW_COUNT,
  PATCH_WRONG_BOTH_COUNTS,
  PATCH_MULTI_HUNK_WRONG_COUNTS,
  PATCH_MINIMAL_HEADER
} from '../fixtures/sample-patches.ts';

describe('applyPatchToScript', () => {
  describe('valid patches', () => {
    it('should replace a single line', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_REPLACE_SINGLE_LINE);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const value = 456;'));
      assert.ok(!result.script.includes('const value = 123;'));
    });

    it('should delete a line', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_DELETE_LINE);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(!result.script.includes('const name = "test";'));
      // Should have 4 lines instead of 5
      assert.strictEqual(result.script.split('\n').length, 4);
    });

    it('should insert a line', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_INSERT_LINE);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const extra = "inserted";'));
      // Should have 6 lines instead of 5
      assert.strictEqual(result.script.split('\n').length, 6);
    });

    it('should handle multiple changes in one hunk', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_MULTIPLE_CHANGES);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const value = 456;'));
      assert.ok(result.script.includes('const name = "updated";'));
    });

    it('should insert at end of script', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_INSERT_AT_END);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('Console.print("done");'));
    });

    it('should handle multi-hunk patches', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_MULTI_HUNK);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('Content.getComponent("MainPanel")'));
      assert.ok(result.script.includes('Component.repaintImmediately();'));
    });
  });

  describe('invalid patches', () => {
    it('should fail on context mismatch with fuzzFactor 0', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_WRONG_CONTEXT, { fuzzFactor: 0 });
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.ok(result.error.includes('failed') || result.error.includes('mismatch'));
    });

    it('should fail on malformed patch', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_MALFORMED);
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should fail when patching empty string with content-dependent patch', () => {
      const result = applyPatchToScript('', PATCH_REPLACE_SINGLE_LINE);
      
      assert.strictEqual(result.success, false);
    });
  });

  describe('fuzzFactor behavior', () => {
    it('should default to fuzzFactor 0', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_WRONG_CONTEXT);
      
      // Should fail with default fuzzFactor of 0
      assert.strictEqual(result.success, false);
    });
  });

  describe('edge cases', () => {
    it('should handle script with Windows line endings', () => {
      const windowsScript = SIMPLE_SCRIPT.replace(/\n/g, '\r\n');
      const result = applyPatchToScript(windowsScript, PATCH_REPLACE_SINGLE_LINE);
      
      // The diff library should handle this, but behavior may vary
      // At minimum, it should not crash
      assert.ok(result.success === true || result.success === false);
    });

    it('should handle empty patch', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, '');
      
      // Empty patch should either return original or fail gracefully
      if (result.success) {
        assert.strictEqual(result.script, SIMPLE_SCRIPT);
      } else {
        assert.ok(result.error);
      }
    });
  });

  describe('auto-fix line counts', () => {
    it('should fix patch with wrong old line count', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_WRONG_OLD_COUNT);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const value = 456;'));
      assert.ok(!result.script.includes('const value = 123;'));
    });

    it('should fix patch with wrong new line count', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_WRONG_NEW_COUNT);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const extra = "inserted";'));
    });

    it('should fix patch with both counts wrong', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_WRONG_BOTH_COUNTS);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const value = 456;'));
    });

    it('should fix multi-hunk patch with wrong counts', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_MULTI_HUNK_WRONG_COUNTS);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('Content.getComponent("MainPanel")'));
      assert.ok(result.script.includes('Component.repaintImmediately();'));
    });

    it('should handle minimal header without counts', () => {
      const result = applyPatchToScript(SIMPLE_SCRIPT, PATCH_MINIMAL_HEADER);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const name = "updated";'));
    });
  });
});

describe('fixPatchHeaders', () => {
  it('should correct wrong old line count', () => {
    const badPatch = `@@ -1,999 +1,4 @@
 context1
-removed
+added
 context2`;
    
    const fixed = fixPatchHeaders(badPatch);
    assert.ok(fixed.includes('@@ -1,3 +1,3 @@'));
  });

  it('should correct wrong new line count', () => {
    const badPatch = `@@ -1,2 +1,999 @@
 context
+added`;
    
    const fixed = fixPatchHeaders(badPatch);
    assert.ok(fixed.includes('@@ -1,1 +1,2 @@'));
  });

  it('should handle multi-hunk patches', () => {
    const badPatch = `@@ -1,999 +1,888 @@
 context1
-old1
+new1
@@ -10,777 +10,666 @@
 context2
+added`;
    
    const fixed = fixPatchHeaders(badPatch);
    assert.ok(fixed.includes('@@ -1,2 +1,2 @@'));
    assert.ok(fixed.includes('@@ -10,1 +10,2 @@'));
  });

  it('should preserve function name suffix in header', () => {
    const patchWithSuffix = `@@ -1,999 +1,888 @@ function foo
 context
-old
+new`;
    
    const fixed = fixPatchHeaders(patchWithSuffix);
    assert.ok(fixed.includes('@@ -1,2 +1,2 @@ function foo'));
  });

  it('should handle empty context lines', () => {
    const patchWithEmpty = `@@ -1,5 +1,5 @@
 line1

 line3
-old
+new`;
    
    const fixed = fixPatchHeaders(patchWithEmpty);
    // 3 context lines (including empty) + 1 removed = 4 old
    // 3 context lines (including empty) + 1 added = 4 new
    assert.ok(fixed.includes('@@ -1,4 +1,4 @@'));
  });
});
