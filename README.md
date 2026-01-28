# HISE MCP Server

A Model Context Protocol (MCP) server for querying HISE documentation, including UI component properties, Scripting API methods, module parameter IDs, and a best-practice code snippet database.

## Requirements

- **Node.js 18+** (Required - not compatible with older versions)
- npm or yarn

## Features

- **Exact Query Tools**: Look up specific UI component properties, Scripting API methods, and module parameters with precise matching
- **Code Snippet Database**: Browse and retrieve 100-150 code examples organized by metadata (category, tags, difficulty)
- **Best Practice Guide**: Code snippets serve as a reference for AI agents implementing HISE solutions
- **Fast Lookups**: Indexed data structures for O(1) exact queries
- **Type-Safe**: Full TypeScript implementation

## Available Tools

### Exact Query Tools

1. **`query_ui_property`** - Query UI component properties
   - Input: `componentType`, `propertyName`
   - Returns: Property details including type, default value, description, and possible values

2. **`query_scripting_api`** - Query Scripting API methods
   - Input: `namespace`, `methodName`
   - Returns: Method signature, parameters, return type, description, and example usage

3. **`query_module_parameter`** - Query module parameter IDs
   - Input: `moduleType`, `parameterId`
   - Returns: Parameter details including min/max values, step size, default value, and description

### Code Snippet Tools

4. **`list_snippets`** - List all available code snippets with metadata
   - Input: none
   - Returns: Array of snippet summaries (id, title, description, category, tags, difficulty)
   - Use this first to browse and discover relevant snippets

5. **`get_snippet`** - Get full details and code for a specific snippet
   - Input: `id` (snippet ID from `list_snippets`)
   - Returns: Complete snippet with code, related APIs, and components

### Listing Tools

6. **`list_ui_components`** - List all available UI component types
7. **`list_scripting_namespaces`** - List all available Scripting API namespaces
8. **`list_module_types`** - List all available module types

## Installation

### Check Node.js Version

First, verify your Node.js version:
```bash
node --version
```

If you have Node.js < 18, you must upgrade. Use one of these methods:

**Option 1: Using nvm (recommended on macOS/Linux):**
```bash
nvm install 20
nvm use 20
```

**Option 2: Using nvm-windows (recommended on Windows):**
1. Download nvm-windows from: https://github.com/coreybutler/nvm-windows/releases
2. Install it, then run:
```cmd
nvm install 20
nvm use 20
```

**Option 3: Direct download:**
Download the LTS version from: https://nodejs.org/

### Setup

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Set up environment variables:
```bash
# Optional: Custom path to HISE data JSON file
# Default: ./data/hise-data.json
export HISE_DATA_PATH="/path/to/your/hise-data.json"
```

On Windows (Command Prompt):
```cmd
set HISE_DATA_PATH=C:\path\to\hise-data.json
```

On Windows (PowerShell):
```powershell
$env:HISE_DATA_PATH="C:\path\to\hise-data.json"
```

## Usage

### Running the Server

```bash
npm start
```

The server will start and listen for MCP connections via stdio.

### Using with Claude Desktop

Add the HISE MCP server configuration to your Claude Desktop config file.

#### Finding the Config File

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json` (usually `C:\Users\<username>\AppData\Roaming\Claude\`)

#### Configuration

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hise": {
      "command": "node",
      "args": ["D:\\development\\projekte\\hise_mcp\\dist\\index.js"],
      "env": {
        "HISE_DATA_PATH": "D:\\development\\projekte\\hise_mcp\\data\\hise-data.json"
      }
    }
  }
}
```

**Important:** Replace the paths with your actual installation path. Use absolute paths (not relative).

#### Restart Claude Desktop

After adding the configuration, completely quit and restart Claude Desktop to load the MCP server.

#### Verification

Once connected, you can verify the server is working by asking Claude:
```
List all available tools from the HISE MCP server
```

### Using with Opencode

Configure Opencode to connect to the HISE MCP server by adding it to your `opencode.json` config file.

#### Finding Opencode Config

**macOS/Linux:** `~/.local/share/opencode/opencode.json`

**Windows:** `%USERPROFILE%\.local\share\opencode\opencode.json` (usually `C:\Users\<username>\.local\share\opencode\opencode.json`)

Create the directory if it doesn't exist.

#### Configuration

Add the following to your `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "hise": {
      "type": "local",
      "command": ["node", "./dist/index.js"],
      "environment": {
        "HISE_DATA_PATH": "./data/hise-data.json"
      },
      "enabled": true
    }
  }
}
```

**Important notes:**
- Use `$schema` at the top for validation
- The `command` must be an array with each argument as a separate element
- Environment variables go under `environment` (not `env`)
- Use relative paths if running Opencode from the `hise_mcp` directory
- Set `enabled: true` to activate the server

#### Using from Opencode

Once configured, you can use HISE MCP server tools directly in Opencode:

1. **Browse code snippets:**
   ```
   Can you list all available HISE code snippets?
   ```

2. **Query specific data:**
   ```
   What are the properties of a Knob component?
   ```

3. **Get full code examples:**
   ```
   Show me the full code for handling MIDI note events
   ```

4. **Referencing by server name:**
   ```
   Use the hise MCP server to find information about Synth API methods
   ```

#### Relative vs Absolute Paths

- **Opencode:** Can use relative paths (`["node", "./dist/index.js"]`) if running from `hise_mcp` directory
- **Claude Desktop:** Requires absolute paths (`D:\development\projekte\hise_mcp\dist\index.js`)

### Example Queries

1. **Query a UI property:**
```
query_ui_property(componentType="Knob", propertyName="text")
```

2. **Query a Scripting API method:**
```
query_scripting_api(namespace="Synth", methodName="addNote")
```

3. **Query a module parameter:**
```
query_module_parameter(moduleType="SimpleEnvelope", parameterId="Attack")
```

4. **List all code snippets:**
```
list_snippets()
```

5. **Get a specific code snippet:**
```
get_snippet(id="handle-midi-note-events")
```

6. **List available UI components:**
```
list_ui_components()
```

## Data Format

The server expects a JSON file with the following structure (see `data/hise-data.json` for a complete example):

```json
{
  "uiComponentProperties": [
    {
      "id": "unique-id",
      "componentType": "Knob",
      "propertyName": "text",
      "propertyType": "String",
      "defaultValue": "",
      "description": "Description of the property",
      "possibleValues": ["value1", "value2"]
    }
  ],
  "scriptingAPI": [
    {
      "id": "unique-id",
      "namespace": "Synth",
      "methodName": "addNote",
      "returnType": "void",
      "parameters": [...],
      "description": "Description",
      "example": "code example"
    }
  ],
  "moduleParameters": [
    {
      "id": "unique-id",
      "moduleType": "SimpleEnvelope",
      "parameterId": "Attack",
      "parameterName": "Attack Time",
      "min": 0,
      "max": 10000,
      "step": 0.1,
      "defaultValue": 20,
      "description": "Description"
    }
  ],
  "codeSnippets": [
    {
      "id": "unique-id",
      "title": "Snippet Title",
      "description": "Detailed description",
      "category": "Category",
      "tags": ["tag1", "tag2"],
      "code": "// HISE code here",
      "relatedAPIs": ["API1", "API2"],
      "relatedComponents": ["Component1"],
      "difficulty": "intermediate"
    }
  ]
}
```

## Data Generation

The HISE data file is expected to be auto-generated from official HISE documentation. You would typically:

1. Scrape/parse the HISE documentation
2. Extract UI component properties, API methods, and module parameters
3. Collect and curate code examples
4. Format according to the JSON schema above
5. Save to `data/hise-data.json`

## Architecture

- **`src/types.ts`** - TypeScript type definitions for all data structures
- **`src/data-loader.ts`** - Data loading, indexing, and retrieval logic
- **`src/index.ts`** - MCP server implementation with tool definitions

### Data Access Pattern

For code snippets, use a two-step process:
1. Call `list_snippets()` to browse available snippets with metadata
2. Call `get_snippet(id)` to retrieve full code for specific snippets

This keeps responses lightweight and allows AI agents to select only relevant examples.

## Development

### Development mode (with auto-rebuild):
```bash
npm run dev
```

### TypeScript compilation:
```bash
npm run build
```

## Troubleshooting

### Server fails to start
- Ensure all dependencies are installed (`npm install`)
- Verify the data file path is correct
- Check the JSON data file is valid JSON format

### Exact queries returning no results
- Verify exact spelling (case-insensitive but exact match otherwise)
- Use `list_*` tools to discover available values
- Check that your data JSON contains the requested items

### Code snippets not found
- Call `list_snippets()` to see all available snippet IDs
- Verify the snippet ID is correct (use exact ID from list results)
- Check that your data JSON contains the snippet

## License

MIT

## Contributing

Contributions are welcome! Please ensure any code examples added follow HISE best practices and are well-documented.
