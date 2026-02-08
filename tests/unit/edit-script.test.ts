import { describe, it } from 'node:test';
import assert from 'node:assert';
import { editStringInScript } from '../../src/script-utils.ts';
import { SIMPLE_SCRIPT, REPETITIVE_SCRIPT } from '../fixtures/sample-scripts.ts';

describe('editStringInScript', () => {
  describe('single replacement (default)', () => {
    it('should replace a unique string', () => {
      const result = editStringInScript(SIMPLE_SCRIPT, 'const value = 123;', 'const value = 456;');
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const value = 456;'));
      assert.ok(!result.script.includes('const value = 123;'));
    });

    it('should replace a multi-line block', () => {
      const oldBlock = `const value = 123;
const name = "test";`;
      const newBlock = `const value = 456;
const name = "updated";`;
      
      const result = editStringInScript(SIMPLE_SCRIPT, oldBlock, newBlock);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const value = 456;'));
      assert.ok(result.script.includes('const name = "updated";'));
    });

    it('should fail when oldString not found', () => {
      const result = editStringInScript(SIMPLE_SCRIPT, 'nonexistent string', 'replacement');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.ok(result.error.includes('not found'));
    });

    it('should fail when multiple occurrences exist without replaceAll', () => {
      // REPETITIVE_SCRIPT has multiple '.set("text"' occurrences
      const result = editStringInScript(REPETITIVE_SCRIPT, '.set("text"', '.set("label"');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.ok(result.error.includes('times'));
    });
  });

  describe('replaceAll mode', () => {
    it('should replace all occurrences when replaceAll is true', () => {
      // REPETITIVE_SCRIPT has 3 occurrences of '.set("max", 100)'
      const result = editStringInScript(REPETITIVE_SCRIPT, '.set("max", 100)', '.set("max", 200)', true);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      
      // Count occurrences of new string
      const newCount = (result.script.match(/\.set\("max", 200\)/g) || []).length;
      assert.ok(newCount >= 2, 'Should have replaced multiple occurrences');
      
      // Old string should be gone
      assert.ok(!result.script.includes('.set("max", 100)'));
    });

    it('should work with replaceAll on single occurrence', () => {
      const result = editStringInScript(SIMPLE_SCRIPT, 'const value = 123;', 'const value = 456;', true);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const value = 456;'));
    });
  });

  describe('edge cases', () => {
    it('should handle empty replacement (deletion)', () => {
      const result = editStringInScript(SIMPLE_SCRIPT, 'const name = "test";\n', '');
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(!result.script.includes('const name'));
    });

    it('should handle replacement with special characters', () => {
      const result = editStringInScript(SIMPLE_SCRIPT, '"Panel"', '"Main\\nPanel"');
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('"Main\\nPanel"'));
    });

    it('should preserve indentation and whitespace', () => {
      const scriptWithIndent = '  const x = 1;\n  const y = 2;';
      const result = editStringInScript(scriptWithIndent, '  const x = 1;', '    const x = 1;');
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.startsWith('    const x = 1;'));
    });

    it('should fail on partial matches that appear multiple times', () => {
      // 'value' appears in both 'const value' and 'setValue(value)'
      const result = editStringInScript(SIMPLE_SCRIPT, 'value', 'amount');
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.ok(result.error.includes('times'));
    });

    it('should replace partial matches with replaceAll', () => {
      // Use replaceAll to replace all occurrences of 'value'
      const result = editStringInScript(SIMPLE_SCRIPT, 'value', 'amount', true);
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const amount = 123;'));
      assert.ok(result.script.includes('Component.setValue(amount);'));
    });
  });

  describe('provides context for uniqueness', () => {
    it('should succeed with more context when base string is ambiguous', () => {
      // 'const' appears multiple times, but with context it's unique
      const result = editStringInScript(
        SIMPLE_SCRIPT,
        'const value = 123;\nconst name = "test";',
        'const value = 999;\nconst name = "updated";'
      );
      
      assert.strictEqual(result.success, true);
      assert.ok(result.script);
      assert.ok(result.script.includes('const value = 999;'));
    });
  });
});
