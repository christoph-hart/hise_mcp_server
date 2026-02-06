# HISE MCP Server

[![Version](https://img.shields.io/badge/version-1.0.3-blue.svg)](https://github.com/christoph-hart/hise_mcp_server)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple.svg)](https://modelcontextprotocol.io/)
[![Remote Server](https://img.shields.io/badge/remote-docs.hise.dev%2Fmcp-orange.svg)](https://docs.hise.dev/mcp)

An MCP server providing AI assistants with access to HISE documentation and optionally a live connection to your HISE instance for interactive development.

## Quick Start

### Option 1: Remote Server (Documentation Only)

Connect to the hosted server - no installation required.

**URL:** `https://docs.hise.dev/mcp`

**Requirements:** Free HISE Store account for authorization token (TBD)

**Available features:**
- Query UI properties, Scripting API, and module parameters
- Browse code snippets and best practices
- Search across all HISE documentation
- Access development workflow guides

### Option 2: Local Server (Full Features)

Clone and run locally to unlock HISE runtime tools for interactive development.

**Requirements:** Node.js 18+

**Setup:**
```bash
git clone https://github.com/christoph-hart/hise_mcp_server
cd hise_mcp_server
npm install
npm run build
```

Then enable REST Server in HISE: **Tools > Enable REST Server**

**Additional features:**
- Read/write scripts in real-time
- Compile and see errors immediately
- Capture UI screenshots
- Manipulate components programmatically
- AI-assisted UI layout workflows

## MCP Client Configuration

### Opencode

**Config location:**
- macOS/Linux: `~/.local/share/opencode/opencode.json`
- Windows: `%USERPROFILE%\.config\opencode\opencode.json`

**Remote server:**
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

**Local server:**
```json
{
  "mcp": {
    "hise": {
      "type": "local",
      "command": ["node", "/path/to/hise_mcp_server/dist/index.js"],
      "enabled": true
    }
  }
}
```

**Tip:** Run `npm run build:configure` to automatically configure Opencode with the correct paths.

### Claude Desktop

**Config location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Remote server:**
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

**Local server:**
```json
{
  "mcpServers": {
    "hise": {
      "command": "node",
      "args": ["/path/to/hise_mcp_server/dist/index.js"]
    }
  }
}
```

## Available Tools

### Documentation Tools (Remote & Local)

| Tool | Description |
|------|-------------|
| `search_hise` | Search across all documentation |
| `query_scripting_api` | Look up API methods |
| `query_ui_property` | Look up UI component properties |
| `query_module_parameter` | Look up module parameters |
| `list_snippets` / `get_snippet` | Browse code examples |
| `list_resources` / `get_resource` | Access workflow guides |
| `server_status` | Check server status and available features |

### Runtime Tools (Local Only)

Requires HISE running with REST Server enabled.

| Tool | Description |
|------|-------------|
| `hise_runtime_status` | Get HISE project info |
| `hise_runtime_get_script` | Read script content |
| `hise_runtime_set_script` | Update and compile scripts |
| `hise_runtime_edit_script` | Edit specific lines |
| `hise_runtime_recompile` | Recompile without changing script |
| `hise_runtime_screenshot` | Capture UI screenshots |
| `hise_runtime_list_components` | List UI components |
| `hise_runtime_get_component_properties` | Get component properties |
| `hise_runtime_set_component_properties` | Set component properties |
| `hise_runtime_get_component_value` | Get component runtime value |
| `hise_runtime_set_component_value` | Set component value |
| `hise_runtime_get_selected_components` | Get Interface Designer selection |

## Troubleshooting

### Remote server returns 401 Unauthorized
- Verify your HISE Store token is valid
- Check the Authorization header format: `Bearer <token>`

### Runtime tools return connection error
- Ensure HISE is running
- Enable REST Server: **Tools > Enable REST Server**
- Default port is 1900 (configurable via `HISE_API_URL` environment variable)

### Tools not appearing in your AI assistant
- Restart your MCP client after configuration changes
- Verify the config file path and JSON syntax
- For local server: ensure you ran `npm run build`

## Development

After pulling updates:
```bash
git pull
npm run build
```

For development with auto-rebuild:
```bash
npm run dev
```

See [AGENTS.md](AGENTS.md) for technical implementation details.

## License

MIT
