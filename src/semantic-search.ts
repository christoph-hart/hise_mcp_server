import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from './log.js';
import { SearchIndex, type MetadataFilter, type SearchOptions } from './search-index.js';
export { SearchIndex } from './search-index.js';
export type { ChunkMetadata, MetadataFilter, SearchOptions, SemanticSearchResult } from './search-index.js';
import type { ChunkMetadata, SemanticSearchResult } from './search-index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

// ============================================================================
// Shared embedding model (singleton)
// ============================================================================

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

// Where the model weights live. transformers v4 hard-codes its cache to a dir
// inside node_modules, which is root-owned (and effectively read-only) in the
// production image — writing there throws EACCES, warmup dies, and every search
// 503s forever. Pin it to a writable, image-baked path instead. The Dockerfile
// prefetches the model into this same path at build time (see scripts/prefetch-model.mjs).
const MODEL_CACHE_DIR = process.env.HISE_MODEL_CACHE_DIR || join(__dirname, '..', '.model-cache');

let embedder: any = null;
let embeddingsReady = false;
let warmupPromise: Promise<void> | null = null;

async function ensureEmbedderLoaded(): Promise<void> {
  if (embedder) return;

  log.info(`[semantic-search] Loading embedding model from ${MODEL_CACHE_DIR} (downloads ~80MB if not cached)...`);
  const { pipeline, env } = await import('@huggingface/transformers');
  env.cacheDir = MODEL_CACHE_DIR;
  embedder = await pipeline('feature-extraction', MODEL_NAME);
  log.info('[semantic-search] Embedding model ready');
}

export function isEmbeddingsReady(): boolean {
  return embeddingsReady;
}

/**
 * Load the embedding model + all available index files.
 *
 * Idempotent and concurrency-safe: parallel callers share one in-flight
 * promise. `embeddingsReady` flips only on full success, so /ready and the
 * REST search endpoints can gate on it. On failure the cached promise is
 * cleared so a later call (startup retry, on-demand request, MCP tool) can
 * try again — a single failed warmup no longer wedges the server at 503.
 */
export function warmupSearch(): Promise<void> {
  if (embeddingsReady) return Promise.resolve();
  if (warmupPromise) return warmupPromise;

  warmupPromise = (async () => {
    await ensureEmbedderLoaded();
    if (docIndex.isAvailable()) docIndex.ensureLoaded();
    if (exampleIndex.isAvailable()) exampleIndex.ensureLoaded();
    if (videoIndex.isAvailable()) videoIndex.ensureLoaded();
    embeddingsReady = true;
  })();
  // Allow retry after a failed warmup without unhandled-rejection noise here;
  // the original promise still rejects for whoever awaited it.
  warmupPromise.catch(() => { warmupPromise = null; });
  return warmupPromise;
}

// ============================================================================
// Index instances
// ============================================================================

const docIndex = new SearchIndex(
  'doc-search',
  'doc_chunks.json',
  'embeddings.json',
  'graph.json',
  DATA_DIR,
  warmupSearch
);

const exampleIndex = new SearchIndex(
  'example-search',
  'example_chunks.json',
  'example_embeddings.json',
  'example_graph.json',
  DATA_DIR,
  warmupSearch
);

const videoIndex = new SearchIndex(
  'video-search',
  'video_chunks.json',
  'video_embeddings.json',
  'video_graph.json',
  DATA_DIR,
  warmupSearch
);

async function embedQuery(query: string): Promise<number[]> {
  const output = await embedder(query, { pooling: 'mean', normalize: true });
  return Array.from(output[0].data) as number[];
}

// ============================================================================
// Public API — backward-compatible doc search
// ============================================================================

export async function semanticSearch(
  query: string,
  options?: SearchOptions
): Promise<SemanticSearchResult[]> {
  return docIndex.search(query, embedQuery, options);
}

export function getDocContent(url: string): { body: string; metadata: ChunkMetadata } | null {
  return docIndex.getChunkByUrl(url);
}

export function getDocContentById(id: string): { body: string; metadata: ChunkMetadata } | null {
  return docIndex.getChunkById(id);
}

export function isAvailable(): boolean {
  return docIndex.isAvailable();
}

// ============================================================================
// Public API — example search
// ============================================================================

export async function searchExamples(
  query: string,
  options?: SearchOptions
): Promise<SemanticSearchResult[]> {
  return exampleIndex.search(query, embedQuery, options);
}

export function getExampleById(id: string): { body: string; metadata: ChunkMetadata } | null {
  return exampleIndex.getChunkById(id);
}

export function listAllExamples(filter?: MetadataFilter): SemanticSearchResult[] {
  return exampleIndex.listAll(filter);
}

export function isExamplesAvailable(): boolean {
  return exampleIndex.isAvailable();
}

// ============================================================================
// Public API — video tutorial search
// ============================================================================

export async function searchTutorials(
  query: string,
  options?: SearchOptions
): Promise<SemanticSearchResult[]> {
  return videoIndex.search(query, embedQuery, options);
}

export function getTutorialById(id: string): { body: string; metadata: ChunkMetadata } | null {
  return videoIndex.getChunkById(id);
}

export function isTutorialsAvailable(): boolean {
  return videoIndex.isAvailable();
}
