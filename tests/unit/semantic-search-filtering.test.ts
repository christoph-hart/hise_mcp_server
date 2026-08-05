import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { SearchIndex } from '../../src/search-index.ts';


test('filters candidates before top-K and during graph expansion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hise-search-'));
  try {
    const chunks = [
      {
        id: 'forum:global-best',
        text: 'forum',
        body: 'forum',
        metadata: { source: 'forum', type: 'forum', domain: 'scripting', url: '/forum' },
      },
      {
        id: 'scriptnode:best-match',
        text: 'scriptnode',
        body: 'scriptnode',
        metadata: { source: 'scriptnode', type: 'scriptnode-example', domain: 'scriptnode', url: '/scriptnode' },
      },
    ];
    const embeddings = [
      { id: 'forum:global-best', embedding: [1, 0] },
      { id: 'scriptnode:best-match', embedding: [0.8, 0.2] },
    ];
    const graph = {
      'forum:global-best': [],
      'scriptnode:best-match': ['forum:global-best'],
    };
    writeFileSync(join(dir, 'chunks.json'), JSON.stringify(chunks));
    writeFileSync(join(dir, 'embeddings.json'), JSON.stringify(embeddings));
    writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph));

    const index = new SearchIndex('test', 'chunks.json', 'embeddings.json', 'graph.json', dir, async () => {});
    index.ensureLoaded();
    const filter = (metadata: { source: string }) => metadata.source === 'scriptnode';
    const vector = index.vectorSearch([1, 0], 1, filter);
    assert.deepEqual(vector.map(result => result.id), ['scriptnode:best-match']);

    const expanded = index.graphExpand(vector, filter);
    assert.deepEqual(expanded.map(result => result.id), ['scriptnode:best-match']);
    assert.deepEqual(index.listAll(filter).map(result => result.id), ['scriptnode:best-match']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
