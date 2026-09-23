set windows-shell := ["powershell.exe", "-c"]

local:
    PORT=4406 node dist/index.js

[windows]
local:
    $env:PORT=4406; node dist/index.js

bump version:
    node scripts/bump-version.mjs {{version}}

rebuild-embeddings:
    node scripts/build-doc-chunks.mjs
    node scripts/build-example-chunks.mjs
    node scripts/build-video-chunks.mjs
    node scripts/build-embeddings.mjs --input doc_chunks.json --output embeddings.json
    node scripts/build-embeddings.mjs --input example_chunks.json --output example_embeddings.json
    node scripts/build-embeddings.mjs --input video_chunks.json --output video_embeddings.json
