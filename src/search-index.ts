import { accessSync, readFileSync } from 'fs';
import { join } from 'path';


const GRAPH_HOPS = 2;
const GRAPH_DECAY = 0.6;
const CHUNK_ID_PATTERN = /^[a-zA-Z0-9:._-]+$/;

export interface ChunkMetadata {
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
  node?: string;
  relatedNodes?: string[];
  difficulty?: string;
  moduleType?: string;
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

export type MetadataFilter = (metadata: ChunkMetadata) => boolean;

export interface SearchOptions {
  topK?: number;
  maxResults?: number;
  filter?: MetadataFilter;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function assertValidChunkId(id: string): void {
  if (typeof id !== 'string' || id.length === 0 || id.length > 512 || !CHUNK_ID_PATTERN.test(id)) {
    throw new Error(`Invalid chunk id: ${JSON.stringify(id)}`);
  }
}

export class SearchIndex {
  private chunks: DocChunk[] | null = null;
  private embeddings: EmbeddingEntry[] | null = null;
  private graph: Record<string, string[]> | null = null;
  private idToChunkIndex: Map<string, number> | null = null;

  constructor(
    private name: string,
    private chunksFile: string,
    private embeddingsFile: string,
    private graphFile: string,
    private dataDir: string,
    private warmup: () => Promise<void>
  ) {}

  ensureLoaded(): void {
    if (this.chunks && this.embeddings && this.graph) return;

    this.chunks = JSON.parse(readFileSync(join(this.dataDir, this.chunksFile), 'utf-8'));
    this.embeddings = JSON.parse(readFileSync(join(this.dataDir, this.embeddingsFile), 'utf-8'));
    this.graph = JSON.parse(readFileSync(join(this.dataDir, this.graphFile), 'utf-8'));

    this.idToChunkIndex = new Map();
    for (let i = 0; i < this.chunks!.length; i++) {
      this.idToChunkIndex.set(this.chunks![i].id, i);
    }
  }

  stats(): { name: string; chunks: number; embeddings: number; graphNodes: number } {
    this.ensureLoaded();
    return {
      name: this.name,
      chunks: this.chunks!.length,
      embeddings: this.embeddings!.length,
      graphNodes: Object.keys(this.graph!).length,
    };
  }

  isAvailable(): boolean {
    try {
      accessSync(join(this.dataDir, this.chunksFile));
      accessSync(join(this.dataDir, this.embeddingsFile));
      accessSync(join(this.dataDir, this.graphFile));
      return true;
    } catch {
      return false;
    }
  }

  vectorSearch(queryEmbedding: number[], topK: number, filter?: MetadataFilter): SemanticSearchResult[] {
    const scored = this.embeddings!.flatMap((item) => {
      const ci = this.idToChunkIndex!.get(item.id);
      if (ci === undefined) return [];
      const metadata = this.chunks![ci].metadata;
      if (filter && !filter(metadata)) return [];
      return [{ score: cosineSimilarity(queryEmbedding, item.embedding), id: item.id, metadata }];
    });
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(item => ({ ...item, via: 'vector' }));
  }

  graphExpand(vectorResults: SemanticSearchResult[], filter?: MetadataFilter): SemanticSearchResult[] {
    const resultMap = new Map<string, SemanticSearchResult>();
    for (const result of vectorResults) resultMap.set(result.id, { ...result });

    let frontier = vectorResults.map(result => ({ id: result.id, score: result.score }));
    for (let hop = 1; hop <= GRAPH_HOPS; hop++) {
      const nextFrontier: { id: string; score: number }[] = [];
      for (const node of frontier) {
        for (const neighborId of this.graph![node.id] || []) {
          if (resultMap.has(neighborId)) continue;
          const ci = this.idToChunkIndex!.get(neighborId);
          if (ci === undefined) continue;
          const metadata = this.chunks![ci].metadata;
          if (filter && !filter(metadata)) continue;

          const score = node.score * GRAPH_DECAY;
          const entry: SemanticSearchResult = {
            score,
            id: neighborId,
            metadata,
            via: `graph (${hop} hop${hop > 1 ? 's' : ''})`,
          };
          resultMap.set(neighborId, entry);
          nextFrontier.push({ id: neighborId, score });
        }
      }
      frontier = nextFrontier;
    }

    return [...resultMap.values()].sort((a, b) => b.score - a.score);
  }

  getChunkByUrl(url: string): { body: string; metadata: ChunkMetadata } | null {
    this.ensureLoaded();
    for (const chunk of this.chunks!) {
      if (chunk.metadata.url === url) return { body: chunk.body, metadata: chunk.metadata };
    }

    const ci = this.idToChunkIndex!.get(`content:${url}`);
    return ci === undefined ? null : { body: this.chunks![ci].body, metadata: this.chunks![ci].metadata };
  }

  getChunkById(id: string): { body: string; metadata: ChunkMetadata } | null {
    assertValidChunkId(id);
    this.ensureLoaded();
    const ci = this.idToChunkIndex!.get(id);
    return ci === undefined ? null : { body: this.chunks![ci].body, metadata: this.chunks![ci].metadata };
  }

  async search(query: string, embed: (query: string) => Promise<number[]>, options?: SearchOptions): Promise<SemanticSearchResult[]> {
    await this.warmup();
    this.ensureLoaded();
    const queryEmbedding = await embed(query);
    const vectorResults = this.vectorSearch(queryEmbedding, options?.topK ?? 15, options?.filter);
    return this.graphExpand(vectorResults, options?.filter).slice(0, options?.maxResults ?? 30);
  }

  listAll(filter?: MetadataFilter): SemanticSearchResult[] {
    this.ensureLoaded();
    return this.chunks!
      .filter(chunk => !filter || filter(chunk.metadata))
      .map(chunk => ({ id: chunk.id, score: 1, metadata: chunk.metadata, via: 'browse' }));
  }
}
