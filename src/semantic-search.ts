import { readFileSync, accessSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { log } from './log.js';

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
  slug?: string;
  category?: string;
  tags?: string[];
  featured?: boolean;
  url: string;
  channel?: string;
  chapter?: string;
  summary?: string;
  timestamp?: number;
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
// Shared embedding model (singleton)
// ============================================================================

let embedder: any = null;
let embeddingsReady = false;

async function ensureEmbedderLoaded(): Promise<void> {
  if (embedder) return;

  log.info('[semantic-search] Loading embedding model (first time may download ~80MB)...');
  const { pipeline } = await import('@huggingface/transformers');
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  log.info('[semantic-search] Embedding model ready');
}

export function isEmbeddingsReady(): boolean {
  return embeddingsReady;
}

/**
 * Warm up the embedding model + load all index files.
 * Safe to call multiple times; only loads once.
 * Any failure is surfaced to the caller — decide to crash or fall back.
 */
export async function warmupSearch(): Promise<void> {
  await ensureEmbedderLoaded();
  if (docIndex.isAvailable()) docIndex.ensureLoaded();
  if (exampleIndex.isAvailable()) exampleIndex.ensureLoaded();
  if (videoIndex.isAvailable()) videoIndex.ensureLoaded();
  embeddingsReady = true;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// ============================================================================
// Chunk ID validation — defense in depth against any future path-building code
// ============================================================================

const CHUNK_ID_PATTERN = /^[a-zA-Z0-9:._-]+$/;

function assertValidChunkId(id: string): void {
  if (typeof id !== 'string' || id.length === 0 || id.length > 512 || !CHUNK_ID_PATTERN.test(id)) {
    throw new Error(`Invalid chunk id: ${JSON.stringify(id)}`);
  }
}

// ============================================================================
// SearchIndex class — encapsulates one index (chunks + embeddings + graph)
// ============================================================================

class SearchIndex {
  private chunks: DocChunk[] | null = null;
  private embeddings: EmbeddingEntry[] | null = null;
  private graph: Record<string, string[]> | null = null;
  private idToChunkIndex: Map<string, number> | null = null;

  constructor(
    private name: string,
    private chunksFile: string,
    private embeddingsFile: string,
    private graphFile: string
  ) {}

  ensureLoaded(): void {
    if (this.chunks && this.embeddings && this.graph) return;

    log.info(`[${this.name}] Loading data files...`);

    this.chunks = JSON.parse(readFileSync(join(DATA_DIR, this.chunksFile), 'utf-8'));
    this.embeddings = JSON.parse(readFileSync(join(DATA_DIR, this.embeddingsFile), 'utf-8'));
    this.graph = JSON.parse(readFileSync(join(DATA_DIR, this.graphFile), 'utf-8'));

    this.idToChunkIndex = new Map();
    for (let i = 0; i < this.chunks!.length; i++) {
      this.idToChunkIndex.set(this.chunks![i].id, i);
    }

    log.info(`[${this.name}] Loaded ${this.chunks!.length} chunks, ${this.embeddings!.length} embeddings, ${Object.keys(this.graph!).length} graph nodes`);
  }

  isAvailable(): boolean {
    try {
      accessSync(join(DATA_DIR, this.chunksFile));
      accessSync(join(DATA_DIR, this.embeddingsFile));
      accessSync(join(DATA_DIR, this.graphFile));
      return true;
    } catch {
      return false;
    }
  }

  vectorSearch(queryEmbedding: number[], topK: number): SemanticSearchResult[] {
    const scored = this.embeddings!.map((item) => ({
      score: cosineSimilarity(queryEmbedding, item.embedding),
      id: item.id
    }));
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(s => {
      const ci = this.idToChunkIndex!.get(s.id);
      return {
        score: s.score,
        id: s.id,
        metadata: ci !== undefined ? this.chunks![ci].metadata : {} as ChunkMetadata,
        via: 'vector'
      };
    });
  }

  graphExpand(vectorResults: SemanticSearchResult[]): SemanticSearchResult[] {
    const resultMap = new Map<string, SemanticSearchResult>();

    for (const r of vectorResults) {
      resultMap.set(r.id, { ...r });
    }

    let frontier = vectorResults.map(r => ({ id: r.id, score: r.score, hop: 0 }));

    for (let hop = 1; hop <= GRAPH_HOPS; hop++) {
      const nextFrontier: { id: string; score: number; hop: number }[] = [];
      for (const node of frontier) {
        const neighbors = this.graph![node.id] || [];
        for (const neighborId of neighbors) {
          if (resultMap.has(neighborId)) continue;
          const ci = this.idToChunkIndex!.get(neighborId);
          if (ci === undefined) continue;

          const score = node.score * GRAPH_DECAY;
          const entry: SemanticSearchResult = {
            score,
            id: neighborId,
            metadata: this.chunks![ci].metadata,
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

  getChunkByUrl(url: string): { body: string; metadata: ChunkMetadata } | null {
    this.ensureLoaded();

    for (const chunk of this.chunks!) {
      if (chunk.metadata.url === url) {
        return { body: chunk.body, metadata: chunk.metadata };
      }
    }

    const ci = this.idToChunkIndex!.get(`content:${url}`);
    if (ci !== undefined) {
      return { body: this.chunks![ci].body, metadata: this.chunks![ci].metadata };
    }

    return null;
  }

  getChunkById(id: string): { body: string; metadata: ChunkMetadata } | null {
    assertValidChunkId(id);
    this.ensureLoaded();

    const ci = this.idToChunkIndex!.get(id);
    if (ci === undefined) return null;

    return { body: this.chunks![ci].body, metadata: this.chunks![ci].metadata };
  }

  async search(
    query: string,
    options?: { topK?: number; maxResults?: number }
  ): Promise<SemanticSearchResult[]> {
    this.ensureLoaded();
    await ensureEmbedderLoaded();

    const topK = options?.topK ?? 15;
    const maxResults = options?.maxResults ?? 30;

    const output = await embedder(query, { pooling: 'mean', normalize: true });
    const queryEmbedding = Array.from(output[0].data) as number[];

    const vectorResults = this.vectorSearch(queryEmbedding, topK);
    const allResults = this.graphExpand(vectorResults);

    return allResults.slice(0, maxResults);
  }

  listAll(): SemanticSearchResult[] {
    this.ensureLoaded();
    return this.chunks!.map(chunk => ({
      id: chunk.id,
      score: 1,
      metadata: chunk.metadata,
      via: 'browse'
    }));
  }
}

// ============================================================================
// Index instances
// ============================================================================

const docIndex = new SearchIndex(
  'doc-search',
  'doc_chunks.json',
  'embeddings.json',
  'graph.json'
);

const exampleIndex = new SearchIndex(
  'example-search',
  'example_chunks.json',
  'example_embeddings.json',
  'example_graph.json'
);

const videoIndex = new SearchIndex(
  'video-search',
  'video_chunks.json',
  'video_embeddings.json',
  'video_graph.json'
);

// ============================================================================
// Public API — backward-compatible doc search
// ============================================================================

export async function semanticSearch(
  query: string,
  options?: { topK?: number; maxResults?: number }
): Promise<SemanticSearchResult[]> {
  return docIndex.search(query, options);
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
  options?: { topK?: number; maxResults?: number }
): Promise<SemanticSearchResult[]> {
  return exampleIndex.search(query, options);
}

export function getExampleById(id: string): { body: string; metadata: ChunkMetadata } | null {
  return exampleIndex.getChunkById(id);
}

export function listAllExamples(): SemanticSearchResult[] {
  return exampleIndex.listAll();
}

export function isExamplesAvailable(): boolean {
  return exampleIndex.isAvailable();
}

// ============================================================================
// Public API — video tutorial search
// ============================================================================

export async function searchTutorials(
  query: string,
  options?: { topK?: number; maxResults?: number }
): Promise<SemanticSearchResult[]> {
  return videoIndex.search(query, options);
}

export function getTutorialById(id: string): { body: string; metadata: ChunkMetadata } | null {
  return videoIndex.getChunkById(id);
}

export function isTutorialsAvailable(): boolean {
  return videoIndex.isAvailable();
}
