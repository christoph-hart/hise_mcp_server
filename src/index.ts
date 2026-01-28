#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { HISEDataLoader } from './data-loader.js';
import { UIComponentProperty, ScriptingAPIMethod, ModuleParameter } from './types.js';

const server = new Server(
  {
    name: 'hise-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

let dataLoader: HISEDataLoader;

const TOOLS: Tool[] = [
  {
    name: 'query_ui_property',
    description: 'Query UI component properties. Use "Component.property" format (e.g., "ScriptButton.filmstripImage"). Works with get()/set() calls. For API calls like Math.round() or object methods like Knob.setValue(), use query_scripting_api.',
    inputSchema: {
      type: 'object',
      properties: {
        componentProperty: {
          type: 'string',
          description: 'The property to query in "Component.property" format (e.g., "ScriptButton.filmstripImage", "Knob.mouseCursor")',
        },
      },
      required: ['componentProperty'],
    },
  },
  {
    name: 'query_scripting_api',
    description: 'Query Scripting API methods. Supports both static API calls (e.g., "Math.round()") and object method calls (e.g., "Knob.setValue()"). Use combined format like "Namespace.method" or "Component.method".',
    inputSchema: {
      type: 'object',
      properties: {
        apiCall: {
          type: 'string',
          description: 'The API call to query (e.g., "Math.round()", "Knob.setValue()", "ScriptButton.isVertical()")',
        },
      },
      required: ['apiCall'],
    },
  },
  {
    name: 'query_module_parameter',
    description: 'Query module parameter IDs with exact match. Returns parameter details including min/max values, step size, default value, and description.',
    inputSchema: {
      type: 'object',
      properties: {
        moduleParameter: {
          type: 'string',
          description: 'The module parameter to query in "Module.parameterId" format (e.g., "HardcodedSynth.Gain", "AudioLooper.SyncMode")',
        },
      },
      required: ['moduleParameter'],
    },
  },
  {
    name: 'list_snippets',
    description: 'List all available code snippets with metadata (id, title, description, category, tags, difficulty). Use this first to browse and discover relevant snippets. After identifying relevant snippets, use get_snippet with snippet ID to retrieve full code and details.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_snippet',
    description: 'Get full details and code for a specific snippet by ID. Requires a valid snippet ID obtained from list_snippets. Returns complete snippet with code, related APIs, and components.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The snippet ID (e.g., "basic-synth", "knob-with-modulation-scaling")',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_ui_components',
    description: 'List all available UI component types that have properties documented.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_scripting_namespaces',
    description: 'List all available Scripting API namespaces.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_module_types',
    description: 'List all available module types that have parameters documented.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'query_ui_property': {
        const { componentProperty } = args as { componentProperty: string };
        const result = dataLoader.queryUIProperty(componentProperty);
        if (!result) {
          return {
            content: [{ type: 'text', text: `No property found for "${componentProperty}"` }],
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'query_scripting_api': {
        const { apiCall } = args as { apiCall: string };
        const result = dataLoader.queryScriptingAPI(apiCall);
        if (!result) {
          return {
            content: [{ type: 'text', text: `No API method found for "${apiCall}"` }],
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'query_module_parameter': {
        const { moduleParameter } = args as { moduleParameter: string };
        const result = dataLoader.queryModuleParameter(moduleParameter);
        if (!result) {
          return {
            content: [{ type: 'text', text: `No parameter found for "${moduleParameter}"` }],
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'list_snippets': {
        const summaries = dataLoader.listSnippets();
        return {
          content: [{ type: 'text', text: JSON.stringify(summaries, null, 2) }],
        };
      }

      case 'get_snippet': {
        const { id } = args as { id: string };
        const result = dataLoader.getSnippet(id);
        if (!result) {
          return {
            content: [{ type: 'text', text: `No snippet found with ID "${id}"` }],
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'list_ui_components': {
        const data = dataLoader.getAllData();
        const components = [...new Set(data?.uiComponentProperties.map((p: UIComponentProperty) => p.componentType) || [])];
        return {
          content: [{ type: 'text', text: JSON.stringify(components, null, 2) }],
        };
      }

      case 'list_scripting_namespaces': {
        const data = dataLoader.getAllData();
        const namespaces = [...new Set(data?.scriptingAPI.map((m: ScriptingAPIMethod) => m.namespace) || [])];
        return {
          content: [{ type: 'text', text: JSON.stringify(namespaces, null, 2) }],
        };
      }

      case 'list_module_types': {
        const data = dataLoader.getAllData();
        const modules = [...new Set(data?.moduleParameters.map((p: ModuleParameter) => p.moduleType) || [])];
        return {
          content: [{ type: 'text', text: JSON.stringify(modules, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error}` }],
      isError: true,
    };
  }
});

async function main() {
  dataLoader = new HISEDataLoader();
  
  await dataLoader.loadData();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('HISE MCP server started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
