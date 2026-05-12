# HISE MCP Server

[![Version](https://img.shields.io/badge/version-1.8.0-blue.svg)](https://github.com/christoph-hart/hise_mcp_server)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple.svg)](https://modelcontextprotocol.io/)
[![Remote Server](https://img.shields.io/badge/remote-docs.hise.dev%2Fmcp-orange.svg)](https://docs.hise.dev/mcp)

An MCP server providing AI assistants with access to HISE documentation, the Scripting API, code examples, forum search, and curated style/workflow guides.

The server is **documentation-only**. Live HISE control (launch, recompile, scriptnode editing, UI editing, screenshots, REPL, profiling, plugin builds) lives in the standalone `hise-cli` tool — see https://github.com/christophhart/hise-cli.

## Quick Start

Connect to the hosted server — no installation required.

**URL:** `https://docs.hise.dev/mcp`

**Requirements:** Free HISE Store account for authorization token

**Available features:**
- Search across all HISE documentation, examples, and the forum
- Query UI properties, Scripting API, module parameters, LAF functions
- Browse code examples and tutorial videos
- Access development workflow and style guides

## MCP Client Configuration

### Opencode

**Config location:**
- macOS/Linux: `~/.config/opencode/opencode.json`
- Windows: `%USERPROFILE%\.config\opencode\opencode.json`

```json
{
  "mcp": {
    "hise": {
      "type": "remote",
      "url": "https://docs.hise.dev/mcp",
      "enabled": true,
      "headers": {
        "Authorization": "Bearer abc1234..."
      }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add --transport sse hise -- https://docs.hise.dev/mcp
```

Use `--scope project` to store the config in `.mcp.json` (shared via version control) or `--scope user` to make it available across all projects.

### Claude Desktop

**Config location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "hise": {
      "url": "https://docs.hise.dev/mcp",
      "headers": {
        "Authorization": "Bearer abc1234..."
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_hise` | Search across all documentation |
| `explore_hise` | Walk Scripting API class relationships |
| `query_scripting_api` | Look up API methods |
| `query_ui_property` | Look up UI component properties |
| `query_module_parameter` | Look up module parameters |
| `search_examples` / `get_example` | Browse code examples |
| `get_tutorial` | Fetch a video tutorial section with deep links |
| `list_ui_components` | List UI component types |
| `list_scripting_namespaces` | List Scripting API namespaces |
| `list_module_types` | List module types |
| `list_resources` / `get_resource` | Access workflow + style guides |
| `list_laf_functions` / `query_laf_function` | LAF function reference (single-type) |
| `get_laf_functions_for_components` | Bulk LAF lookup by component type |
| `search_forum` / `fetch_forum_topics` | Search and read denoised forum topics |
| `get_doc_content` | Fetch full markdown for a docs page or API method |
| `hise_verify_parameters` | Verify Scripting API method signatures |
| `server_status` | Check server status and statistics |

## REST API

The same read-only tools are also exposed as stateless REST endpoints for CLI clients that do not need the MCP session handshake.

- OpenAPI spec: `GET /api/openapi.yaml`
- Tool discovery: `GET /api/tools`
- Tool execution: `POST /api/tools/:name`

Example:

```bash
curl http://localhost:3000/api/tools

curl -X POST http://localhost:3000/api/tools/query_scripting_api \
  -H 'Content-Type: application/json' \
  -d '{"apiCall":"Synth.addNoteOn","examples":true}'
```

The execution endpoint accepts the same JSON arguments as the MCP tool and returns a JSON envelope with `tool`, `ok`, `isError`, and `content`. REST callers receive real HTTP status codes such as `400` for missing arguments, `404` for unknown tools or missing lookup targets, `429` for rate limiting, and `503` while indexes are unavailable.

## Running Locally (for Development)

The server can also be hosted locally — useful when developing the server itself or running it on your own infrastructure.

```bash
git clone https://github.com/christoph-hart/hise_mcp_server
cd hise_mcp_server
npm install
npm run build
npm start
```

Listens on `http://localhost:3000/mcp` by default, with REST endpoints under `http://localhost:3000/api`. Override the port via `PORT=4406 npm start`.

## Troubleshooting

### Remote server returns 401 Unauthorized
- Verify your HISE Store token is valid
- Check the Authorization header format: `Bearer <token>`

### Tools not appearing in your AI assistant
- Restart your MCP client after configuration changes
- Verify the config file path and JSON syntax

### Need live HISE control?
The MCP server itself does not drive HISE. Install `hise-cli` and use commands like `hise-cli -hise launch`, `hise-cli -script "..."`, `hise-cli -ui set <id>.<prop> <value>`, `hise-cli -wizard run recompile`. See https://github.com/christophhart/hise-cli.

## Development

After pulling updates:
```bash
git pull
npm run build
```

Auto-rebuild during development:
```bash
npm run dev
```

See [AGENTS.md](AGENTS.md) for technical implementation details.

## License

MIT
