import assert from 'node:assert/strict';
import { test } from 'node:test';

import { collectScriptnodeExampleChunks } from '../../scripts/build-example-chunks.mjs';


function example(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dynamics.gate.noise-layer-gate',
    node: 'dynamics.gate',
    factory: 'dynamics',
    slug: 'gate',
    title: 'Noise layer gate',
    summary: 'Opens a separate texture layer.',
    text: 'Noise layer gate\nPrimary node: dynamics.gate.',
    llmRef: 'scriptnode example: dynamics.gate\n\nFull reference.',
    category: 'dsp-network',
    tags: ['gate'],
    relatedNodes: ['dynamics.gate', 'core.gain'],
    difficulty: 'intermediate',
    moduleType: 'ScriptFX',
    ...overrides,
  };
}

test('normalizes Scriptnode examples for semantic search', () => {
  const result = collectScriptnodeExampleChunks({
    schemaVersion: 1,
    examples: { 'dynamics.gate': example() },
  });

  assert.equal(result.chunks.length, 1);
  assert.deepEqual(result.graph, { 'scriptnode:dynamics.gate.noise-layer-gate': [] });
  assert.deepEqual(result.chunks[0], {
    id: 'scriptnode:dynamics.gate.noise-layer-gate',
    text: 'Noise layer gate\nPrimary node: dynamics.gate.',
    body: 'scriptnode example: dynamics.gate\n\nFull reference.',
    metadata: {
      source: 'scriptnode',
      type: 'scriptnode-example',
      title: 'Noise layer gate',
      description: 'Opens a separate texture layer.',
      category: 'dsp-network',
      tags: ['gate'],
      domain: 'scriptnode',
      node: 'dynamics.gate',
      relatedNodes: ['dynamics.gate', 'core.gain'],
      difficulty: 'intermediate',
      moduleType: 'ScriptFX',
      url: '/v2/scriptnode/list/dynamics/gate',
    },
  });
});

test('rejects mismatched nodes and duplicate authored IDs', () => {
  assert.throws(
    () => collectScriptnodeExampleChunks({
      schemaVersion: 1,
      examples: { 'dynamics.gate': example({ node: 'dynamics.comp' }) },
    }),
    /payload node/,
  );

  assert.throws(
    () => collectScriptnodeExampleChunks({
      schemaVersion: 1,
      examples: {
        'dynamics.gate': example(),
        'routing.selector': example({ node: 'routing.selector' }),
      },
    }),
    /Duplicate Scriptnode example chunk id/,
  );
});
