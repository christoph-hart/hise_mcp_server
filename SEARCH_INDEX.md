# Search Index Build & Deploy

How to rebuild the semantic search indices and run the MCP server in production mode.

## Directory layout

```
hise_mcp_server/
  content/          ← markdown docs (copied from hise_website_v2/content/v2/)
  data/
    api_reference.json        ← API data (copied from hise_website_v2/)
    class_survey_data.json
    snippet_dataset.json
    forum_examples.json       ← validated forum code examples
    scriptnode_examples.json  ← validated Scriptnode example networks
    doc_chunks.json           ← generated: doc search chunks
    graph.json                ← generated: doc graph edges
    embeddings.json           ← generated: doc embeddings
    example_chunks.json       ← generated: example search chunks
    example_graph.json        ← generated: example graph edges
    example_embeddings.json   ← generated: example embeddings
    video_chunks.json         ← generated: tutorial chunks
    video_graph.json          ← generated: tutorial graph edges
    video_embeddings.json     ← generated: tutorial embeddings
  scripts/
    build-doc-chunks.mjs      ← step 1a: docs → chunks
    build-example-chunks.mjs  ← step 1b: examples → chunks
    build-video-chunks.mjs    ← step 1c: tutorials → chunks
    build-embeddings.mjs      ← step 2: chunks → embeddings
```

## Prerequisites

- Node.js 20+
- `npm install` in the MCP server root (includes `@huggingface/transformers`)

## Updating source data

Before rebuilding, copy updated source files into the MCP server:

```bash
# From the website repo
cp -r ../hise_website_v2/content/v2/* content/
cp ../hise_website_v2/api_reference.json data/

# Enrichment datasets, including scriptnode_examples.json
python collect_mcp.py ../hise_mcp_server/data

# Forum examples (after running the validation pipeline)
cp ../hise_website_v2/hise_project_analysis/HISE/tools/api\ generator/forum-search/output/forum_examples.json data/
```

## Rebuild: full pipeline

```bash
# 1. Build chunks from source data
node scripts/build-doc-chunks.mjs
node scripts/build-example-chunks.mjs
node scripts/build-video-chunks.mjs

# 2. Generate embeddings (takes ~1-2 min per index on CPU)
node scripts/build-embeddings.mjs --input doc_chunks.json --output embeddings.json
node scripts/build-embeddings.mjs --input example_chunks.json --output example_embeddings.json
node scripts/build-embeddings.mjs --input video_chunks.json --output video_embeddings.json
```

All output goes to `data/`. The embedding model (`all-MiniLM-L6-v2`, ~80MB) downloads automatically on first run.

## Rebuild: examples only

When only forum, API, snippet, or Scriptnode examples changed (docs unchanged):

```bash
node scripts/build-example-chunks.mjs
node scripts/build-embeddings.mjs --input example_chunks.json --output example_embeddings.json
```

## Rebuild: docs only

When only markdown content or API reference changed:

```bash
node scripts/build-doc-chunks.mjs
node scripts/build-embeddings.mjs --input doc_chunks.json --output embeddings.json
```

## Run in production

```bash
node dist/index.js --production
```

Starts an HTTP server on port 3000 (configurable via `PORT` env var). MCP endpoint at `http://localhost:3000/mcp`; stateless REST endpoints live under `http://localhost:3000/api`, with the OpenAPI spec at `http://localhost:3000/api/openapi.yaml`. Documentation and search tools only - no HISE runtime tools.

## Run in local/dev mode

```bash
npm run dev
```

Starts in stdio mode with full tool access (requires HISE running on port 1900).
