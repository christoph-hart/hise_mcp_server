# Adding HISE Runtime Bridge Tools

This document describes how to add new bridge tools that connect the MCP server to a running HISE instance via its REST API.

## Overview

The HISE MCP server can operate in two modes:

1. **Documentation-only mode** (production server): Provides static documentation lookups for HISE APIs, UI properties, module parameters, and code snippets.

2. **Runtime bridge mode** (local server): In addition to documentation, provides tools that interact with a running HISE instance via its REST API.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Developer's Machine                             │
│                                                                         │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────┐   │
│  │    HISE     │◄────│  Local MCP      │◄────│  AI Agent           │   │
│  │  REST API   │     │  Server         │     │  (Claude Code, etc) │   │
│  │  :1900      │     │  (stdio mode)   │     │                     │   │
│  └─────────────┘     └─────────────────┘     └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Architecture

### Components

| File | Purpose |
|------|---------|
| `src/hise-client.ts` | HTTP client for HISE REST API |
| `src/types.ts` | TypeScript interfaces for HISE responses |
| `src/index.ts` | Tool definitions and request handlers |

### HISE Client

The `HiseClient` class (`src/hise-client.ts`) provides typed methods for each HISE REST API endpoint:

```typescript
import { getHiseClient } from './hise-client.js';

const client = getHiseClient();

// Check availability
const available = await client.isAvailable();

// Call endpoints
const status = await client.getStatus();
const script = await client.getScript('Interface', 'onInit');
```

### Configuration

The HISE API URL is configured via environment variable:

```bash
HISE_API_URL=http://localhost:1900  # Default
```

## Adding a New Bridge Tool

Follow these steps to add a new bridge tool:

### Step 1: Add Response Type to `src/types.ts`

Define the TypeScript interface for the HISE REST API response:

```typescript
/**
 * Response from GET /api/your_endpoint
 */
export interface HiseYourResponse {
  success: boolean;
  // ... endpoint-specific fields
  logs: string[];
  errors: HiseError[];
}
```

### Step 2: Add Client Method to `src/hise-client.ts`

Add a method to the `HiseClient` class:

```typescript
import { HiseYourResponse } from './types.js';

export class HiseClient {
  // ... existing methods ...

  /**
   * Your method description
   * 
   * @param param1 - Description
   */
  async yourMethod(param1: string): Promise<HiseYourResponse> {
    return this.fetchWithTimeout<HiseYourResponse>(
      `/api/your_endpoint?param1=${encodeURIComponent(param1)}`,
      'GET',
      undefined,
      this.config.timeouts.status  // or appropriate timeout
    );
  }
}
```

For POST endpoints:

```typescript
async yourMethod(params: YourParams): Promise<HiseYourResponse> {
  return this.fetchWithTimeout<HiseYourResponse>(
    '/api/your_endpoint',
    'POST',
    {
      param1: params.param1,
      param2: params.param2,
    },
    this.config.timeouts.script  // or appropriate timeout
  );
}
```

### Step 3: Add Tool Definition to `src/index.ts`

Add the tool definition to the `TOOLS` array (in the HISE RUNTIME BRIDGE section):

```typescript
{
  name: 'hise_runtime_your_tool',
  description: `Description of what the tool does.

REQUIRES: HISE running locally with REST API enabled.

PARAMETERS:
- param1 (required): Description
- param2 (optional): Description

RETURNS: Description of the response.`,
  inputSchema: {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Description of param1',
      },
      param2: {
        type: 'string',
        description: 'Optional: description of param2',
      },
    },
    required: ['param1'],
  },
},
```

### Step 4: Add Case Handler to `src/index.ts`

Add the handler in the `switch` statement (in the HISE RUNTIME BRIDGE section):

```typescript
case 'hise_runtime_your_tool': {
  const { param1, param2 } = args as { param1: string; param2?: string };
  const hiseClient = getHiseClient();
  try {
    const result = await hiseClient.yourMethod(param1, param2);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{
        type: 'text',
        text: `HISE Runtime Error: ${err instanceof Error ? err.message : 'Unknown error'}`
      }],
      isError: true,
    };
  }
}
```

### Step 5: Build and Test

```bash
# Build
npm run build

# Test with HISE running
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hise_runtime_your_tool","arguments":{"param1":"value"}}}' | node dist/index.js
```

## Testing

### Without HISE Running

Bridge tools should return a helpful error message:

```bash
$ echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hise_runtime_status","arguments":{}}}' | node dist/index.js 2>/dev/null
```

Expected response includes:
```json
{
  "isError": true,
  "content": [{
    "type": "text",
    "text": "HISE Runtime Error: Cannot connect to HISE at http://localhost:1900..."
  }]
}
```

### With HISE Running

Start HISE with REST API enabled (default port 1900), then test:

```bash
# Test status
curl -s http://localhost:1900/api/status

# Test via MCP
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"hise_runtime_status","arguments":{}}}' | node dist/index.js 2>/dev/null
```

## Error Handling Patterns

### Connection Errors

The `HiseClient` automatically handles connection errors and provides helpful messages:

```typescript
// In hise-client.ts
if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
  throw new Error(
    `Cannot connect to HISE at ${this.config.baseUrl}. ` +
    `Ensure HISE is running with the REST API enabled.`
  );
}
```

### Timeouts

Timeouts are configured per operation type:

```typescript
const DEFAULT_CONFIG: HiseClientConfig = {
  baseUrl: process.env.HISE_API_URL || 'http://localhost:1900',
  timeouts: {
    status: 3000,      // 3 seconds for status checks
    script: 30000,     // 30 seconds for compilation
    screenshot: 10000, // 10 seconds for screenshots
  },
};
```

Add new timeout categories as needed for slow operations.

### HISE API Errors

HISE REST API errors are passed through in the response:

```json
{
  "success": false,
  "errors": [
    {
      "errorMessage": "API call with undefined parameter 0",
      "callstack": ["myFunction() at Scripts/utils.js:42:12", "..."]
    }
  ]
}
```

## Available HISE REST API Endpoints

See `HISE_REST_API.md` in the HISE repository for the complete API reference.

### Currently Bridged (MVP)

| MCP Tool | HISE Endpoint |
|----------|---------------|
| `hise_runtime_status` | `GET /api/status` |
| `hise_runtime_get_script` | `GET /api/get_script` |
| `hise_runtime_set_script` | `POST /api/set_script` |
| `hise_runtime_recompile` | `POST /api/recompile` |
| `hise_runtime_screenshot` | `GET /api/screenshot` |
| `hise_runtime_list_components` | `GET /api/list_components` |
| `hise_runtime_get_component_properties` | `GET /api/get_component_properties` |
| `hise_runtime_set_component_properties` | `POST /api/set_component_properties` |
| `hise_runtime_get_component_value` | `GET /api/get_component_value` |
| `hise_runtime_set_component_value` | `POST /api/set_component_value` |
| `hise_runtime_get_selected_components` | `GET /api/get_selected_components` |

## Naming Conventions

- **Tool names**: `hise_runtime_` prefix to indicate runtime dependency
- **Method names**: Match HISE REST API naming (e.g., `getScript`, `setScript`)
- **Type names**: `Hise` prefix for HISE-specific types (e.g., `HiseStatusResponse`)

## Checklist for New Bridge Tools

- [ ] Response type added to `src/types.ts`
- [ ] Parameter type added (if POST with body)
- [ ] Client method added to `src/hise-client.ts`
- [ ] Tool definition added to `TOOLS` array in `src/index.ts`
- [ ] Case handler added to switch statement in `src/index.ts`
- [ ] Tool description includes `REQUIRES: HISE running locally`
- [ ] Error handling returns helpful message when HISE unavailable
- [ ] Tested with HISE running
- [ ] Tested without HISE (error case)
