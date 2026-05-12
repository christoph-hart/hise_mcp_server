#!/usr/bin/env node
/**
 * Download the sentence-embedding model weights into the model cache so the
 * running server never has to reach huggingface.co.
 *
 * Run at image build time (see deploy/mcp/Dockerfile). Honors
 * HISE_MODEL_CACHE_DIR — must point at the same dir semantic-search.ts uses.
 *
 * Usage:
 *   HISE_MODEL_CACHE_DIR=/app/.model-cache node scripts/prefetch-model.mjs
 */
import { pipeline, env } from '@huggingface/transformers';

const MODEL = 'Xenova/all-MiniLM-L6-v2';

const cacheDir = process.env.HISE_MODEL_CACHE_DIR;
if (cacheDir) env.cacheDir = cacheDir;

console.log(`[prefetch-model] caching ${MODEL} into ${env.cacheDir} ...`);
await pipeline('feature-extraction', MODEL);
console.log('[prefetch-model] done');
