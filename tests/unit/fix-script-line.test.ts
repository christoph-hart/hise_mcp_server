import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fixLineInScript } from '../../src/script-utils.ts';
import { SIMPLE_SCRIPT, SINGLE_LINE_SCRIPT } from '../fixtures/sample-scripts.ts';

describe('fixLineInScript', () => {
  describe('valid line replacements', () => {
    it('should replace a middle line', () => {
      const result = fixLineInScript(SIMPLE_SCRIPT, 2, 'const value = 999;');
      
      const lines = result.split('\n');
      assert.strictEqual(lines[1], 'const value = 999;');
      assert.strictEqual(lines.length, 5); // Same number of lines
    });

    it('should replace the first line', () => {
      const result = fixLineInScript(SIMPLE_SCRIPT, 1, 'const Panel = Content.getComponent("Main");');
      
      const lines = result.split('\n');
      assert.strictEqual(lines[0], 'const Panel = Content.getComponent("Main");');
    });

    it('should replace the last line', () => {
      const result = fixLineInScript(SIMPLE_SCRIPT, 5, 'Panel.repaintImmediately();');
      
      const lines = result.split('\n');
      assert.strictEqual(lines[4], 'Panel.repaintImmediately();');
    });

    it('should handle single-line script', () => {
      const result = fixLineInScript(SINGLE_LINE_SCRIPT, 1, 'Console.print("Goodbye");');
      
      assert.strictEqual(result, 'Console.print("Goodbye");');
    });

    it('should allow empty replacement content', () => {
      const result = fixLineInScript(SIMPLE_SCRIPT, 2, '');
      
      const lines = result.split('\n');
      assert.strictEqual(lines[1], '');
      assert.strictEqual(lines.length, 5);
    });

    it('should preserve other lines unchanged', () => {
      const result = fixLineInScript(SIMPLE_SCRIPT, 3, 'CHANGED');
      
      const lines = result.split('\n');
      assert.strictEqual(lines[0], 'const Component = Content.getComponent("Panel");');
      assert.strictEqual(lines[1], 'const value = 123;');
      assert.strictEqual(lines[2], 'CHANGED');
      assert.strictEqual(lines[3], 'Component.setValue(value);');
      assert.strictEqual(lines[4], 'Component.repaint();');
    });
  });

  describe('invalid line numbers', () => {
    it('should throw on line 0', () => {
      assert.throws(
        () => fixLineInScript(SIMPLE_SCRIPT, 0, 'anything'),
        /out of range/
      );
    });

    it('should throw on negative line', () => {
      assert.throws(
        () => fixLineInScript(SIMPLE_SCRIPT, -1, 'anything'),
        /out of range/
      );
    });

    it('should throw on line beyond script length', () => {
      assert.throws(
        () => fixLineInScript(SIMPLE_SCRIPT, 6, 'anything'),
        /out of range/
      );
    });

    it('should throw on line far beyond script length', () => {
      assert.throws(
        () => fixLineInScript(SIMPLE_SCRIPT, 100, 'anything'),
        /out of range/
      );
    });
  });

  describe('edge cases', () => {
    it('should handle script with empty lines', () => {
      const scriptWithEmpty = 'line1\n\nline3';
      const result = fixLineInScript(scriptWithEmpty, 2, 'filled');
      
      assert.strictEqual(result, 'line1\nfilled\nline3');
    });

    it('should handle content with special characters', () => {
      const result = fixLineInScript(SIMPLE_SCRIPT, 2, 'const regex = /test\\n\\t/g;');
      
      const lines = result.split('\n');
      assert.strictEqual(lines[1], 'const regex = /test\\n\\t/g;');
    });
  });
});
