set windows-shell := ["powershell.exe", "-c"]

local:
    $env:PORT=4406; node dist/index.js

bump version:
    node scripts/bump-version.mjs {{version}}
