#!/usr/bin/env node
/**
 * Generate embeddings for a chunks JSON file using all-MiniLM-L6-v2.
 *
 * Usage:
 *   node scripts/build-embeddings.mjs --input <chunks.json> --output <embeddings.json>
 *
 * Defaults (when run from the MCP server root):
 *   --input  data/doc_chunks.json
 *   --output data/embeddings.json
 *
 * Examples:
 *   # Doc embeddings
 *   node scripts/build-embeddings.mjs --input data/doc_chunks.json --output data/embeddings.json
 *
 *   # Example embeddings
 *   node scripts/build-embeddings.mjs --input data/example_chunks.json --output data/example_embeddings.json
 */
import { pipeline } from '@huggingface/transformers';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const SCRIPT_DIR = import.meta.dirname;
const DATA_DIR = join(SCRIPT_DIR, '..', 'data');

const args = process.argv.slice(2);
function getArg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const CHUNKS_IN = join(DATA_DIR, getArg('input', 'doc_chunks.json'));
const EMBEDDINGS_OUT = join(DATA_DIR, getArg('output', 'embeddings.json'));
const BATCH_SIZE = 64;

async function main() {
  console.log(`Reading ${CHUNKS_IN}...`);
  const chunks = JSON.parse(readFileSync(CHUNKS_IN, 'utf-8'));
  console.log(`Loaded ${chunks.length} chunks`);

  console.log('Loading embedding model (first run downloads ~80MB)...');
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  console.log('Generating embeddings...');
  const results = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.text.slice(0, 2000));

    const output = await embedder(texts, { pooling: 'mean', normalize: true });

    for (let j = 0; j < batch.length; j++) {
      results.push({
        id: batch[j].id,
        embedding: Array.from(output[j].data)
      });
    }

    process.stdout.write(`\r  ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks embedded`);
  }

  console.log(`\nSaving ${EMBEDDINGS_OUT}...`);
  writeFileSync(EMBEDDINGS_OUT, JSON.stringify(results));

  const sizeMB = (Buffer.byteLength(JSON.stringify(results)) / 1024 / 1024).toFixed(1);
  console.log(`Done! ${results.length} embeddings (${sizeMB}MB)`);
}

main().catch(console.error);
