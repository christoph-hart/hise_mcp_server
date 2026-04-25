set windows-shell := ["powershell.exe", "-c"]

local:
    node dist/index.js --production
