import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const GRAPH_HOPS = 2;
const GRAPH_DECAY = 0.6;

// ============================================================================
// Types
// ============================================================================

interface ChunkMetadata {
  source: string;
  type: string;
  class?: string;
  method?: string;
  title?: string;
  pageTitle?: string;
  description?: string;
  domain?: string;
  url: string;
}

interface DocChunk {
  id: string;
  text: string;
  body: string;
  metadata: ChunkMetadata;
}

interface EmbeddingEntry {
  id: string;
  embedding: number[];
}

export interface SemanticSearchResult {
  id: string;
  score: number;
  metadata: ChunkMetadata;
  via: string;
}

// ============================================================================
// Lazy-loaded state
// ============================================================================

let chunks: DocChunk[] | null = null;
let embeddings: EmbeddingEntry[] | null = null;
let graph: Record<string, string[]> | null = null;
let idToChunkIndex: Map<string, number> | null = null;
let embedder: any = null; // HuggingFace pipeline instance

function ensureDataLoaded(): void {
  if (chunks && embeddings && graph) return;

  console.error('[semantic-search] Loading data files...');

  chunks = JSON.parse(readFileSync(join(DATA_DIR, 'doc_chunks.json'), 'utf-8'));
  embeddings = JSON.parse(readFileSync(join(DATA_DIR, 'embeddings.json'), 'utf-8'));
  graph = JSON.parse(readFileSync(join(DATA_DIR, 'graph.json'), 'utf-8'));

  idToChunkIndex = new Map();
  for (let i = 0; i < chunks!.length; i++) {
    idToChunkIndex.set(chunks![i].id, i);
  }

  console.error(`[semantic-search] Loaded ${chunks!.length} chunks, ${embeddings!.length} embeddings, ${Object.keys(graph!).length} graph nodes`);
}

async function ensureEmbedderLoaded(): Promise<void> {
  if (embedder) return;

  console.error('[semantic-search] Loading embedding model (first time may download ~80MB)...');
  const { pipeline } = await import('@huggingface/transformers');
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.error('[semantic-search] Embedding model ready');
}

// ============================================================================
// Core search functions
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function vectorSearch(queryEmbedding: number[], topK: number): SemanticSearchResult[] {
  const scored = embeddings!.map((item) => ({
    score: cosineSimilarity(queryEmbedding, item.embedding),
    id: item.id
  }));
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, topK).map(s => {
    const ci = idToChunkIndex!.get(s.id);
    return {
      score: s.score,
      id: s.id,
      metadata: ci !== undefined ? chunks![ci].metadata : {} as ChunkMetadata,
      via: 'vector'
    };
  });
}

function graphExpand(vectorResults: SemanticSearchResult[]): SemanticSearchResult[] {
  const resultMap = new Map<string, SemanticSearchResult>();

  for (const r of vectorResults) {
    resultMap.set(r.id, { ...r });
  }

  let frontier = vectorResults.map(r => ({ id: r.id, score: r.score, hop: 0 }));

  for (let hop = 1; hop <= GRAPH_HOPS; hop++) {
    const nextFrontier: { id: string; score: number; hop: number }[] = [];
    for (const node of frontier) {
      const neighbors = graph![node.id] || [];
      for (const neighborId of neighbors) {
        if (resultMap.has(neighborId)) continue;
        const ci = idToChunkIndex!.get(neighborId);
        if (ci === undefined) continue;

        const score = node.score * GRAPH_DECAY;
        const entry: SemanticSearchResult = {
          score,
          id: neighborId,
          metadata: chunks![ci].metadata,
          via: `graph (${hop} hop${hop > 1 ? 's' : ''})`
        };
        resultMap.set(neighborId, entry);
        nextFrontier.push({ id: neighborId, score, hop });
      }
    }
    frontier = nextFrontier;
  }

  const all = [...resultMap.values()];
  all.sort((a, b) => b.score - a.score);
  return all;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Semantic search with vector similarity + graph expansion.
 * Lazy-loads the embedding model on first call.
 */
export async function semanticSearch(
  query: string,
  options?: { topK?: number; maxResults?: number }
): Promise<SemanticSearchResult[]> {
  ensureDataLoaded();
  await ensureEmbedderLoaded();

  const topK = options?.topK ?? 15;
  const maxResults = options?.maxResults ?? 30;

  const output = await embedder(query, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(output[0].data) as number[];

  const vectorResults = vectorSearch(queryEmbedding, topK);
  const allResults = graphExpand(vectorResults);

  return allResults.slice(0, maxResults);
}

/**
 * Get full markdown body content for a URL path.
 * Returns null if not found.
 */
export function getDocContent(url: string): { body: string; metadata: ChunkMetadata } | null {
  ensureDataLoaded();

  // Try exact match first
  for (const chunk of chunks!) {
    if (chunk.metadata.url === url) {
      return { body: chunk.body, metadata: chunk.metadata };
    }
  }

  // Try matching by chunk ID
  const ci = idToChunkIndex!.get(`content:${url}`);
  if (ci !== undefined) {
    return { body: chunks![ci].body, metadata: chunks![ci].metadata };
  }

  return null;
}

/**
 * Get full markdown body content by chunk ID (e.g., "api:Buffer.create").
 * Returns null if not found.
 */
export function getDocContentById(id: string): { body: string; metadata: ChunkMetadata } | null {
  ensureDataLoaded();

  const ci = idToChunkIndex!.get(id);
  if (ci === undefined) return null;

  return { body: chunks![ci].body, metadata: chunks![ci].metadata };
}

/**
 * Check if semantic search data is available.
 */
export function isAvailable(): boolean {
  try {
    // Just check if the data files exist
    readFileSync(join(DATA_DIR, 'doc_chunks.json'), 'utf-8').slice(0, 1);
    readFileSync(join(DATA_DIR, 'embeddings.json'), 'utf-8').slice(0, 1);
    readFileSync(join(DATA_DIR, 'graph.json'), 'utf-8').slice(0, 1);
    return true;
  } catch {
    return false;
  }
}
