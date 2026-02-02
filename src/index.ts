#!/usr/bin/env node

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { HISEDataLoader } from './data-loader.js';
import { UIComponentProperty, ScriptingAPIMethod, ModuleParameter, SearchDomain } from './types.js';
import { authMiddleware, isAuthConfigured, isOAuthConfigured, getTokenCache } from './auth/index.js';
import { oauthRouter } from './routes/oauth.js';
import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

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
  // PRIMARY TOOL - Use this first for discovery and searching
  {
    name: 'search_hise',
    description: `Search across all HISE documentation: API methods, UI properties, module parameters, and code snippets.

USE THIS WHEN:
- You don't know the exact name of what you're looking for
- You want to find items by keyword or concept (e.g., "midi", "filter", "envelope")
- You want to see all methods in a namespace (e.g., "Synth.*")
- You want to discover related functionality

SUPPORTS:
- Keyword search: "midi note" finds items about MIDI notes
- Prefix patterns: "Synth.*" lists all Synth methods, "*.setValue" finds all setValue methods
- Fuzzy matching: Finds similar items even with typos

RETURNS: Array of matches with id, domain, name, description, and relevance score.

After finding items, use the specific query tools to get full details.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Can be keywords, Namespace.method format, or wildcard patterns like "Synth.*"',
        },
        domain: {
          type: 'string',
          enum: ['all', 'api', 'ui', 'modules', 'snippets'],
          description: 'Optional: Limit search to specific domain. Default: "all"',
        },
        limit: {
          type: 'number',
          description: 'Optional: Maximum results to return (1-50). Default: 10',
        },
      },
      required: ['query'],
    },
  },

  // EXACT QUERY TOOLS - Use after search or when you know exact names
  {
    name: 'query_scripting_api',
    description: `Get full details for a HISE Scripting API method by exact name.

USE THIS FOR:
- Method calls with () like: Synth.addNoteOn, Math.round, Engine.getSampleRate
- Object methods like: Knob.setValue, ScriptButton.getValue, Panel.repaint
- Any function/method you call in HiseScript code

FORMAT: "Namespace.methodName" (parentheses optional, will be stripped)
EXAMPLES: "Synth.addNoteOn", "Math.round()", "Console.print"

DO NOT USE FOR:
- UI properties (filmstripImage, text, enabled) -> use query_ui_property
- Module parameters (Gain, Attack, Release) -> use query_module_parameter

RETURNS: Method signature, parameters, return type, description, example code, and related methods.`,
    inputSchema: {
      type: 'object',
      properties: {
        apiCall: {
          type: 'string',
          description: 'The API method in "Namespace.method" format. Examples: "Synth.addNoteOn", "Math.round", "Engine.getSampleRate"',
        },
      },
      required: ['apiCall'],
    },
  },
  {
    name: 'query_ui_property',
    description: `Get full details for a HISE UI component property by exact name.

USE THIS FOR:
- Properties accessed via Content.getComponent("name").get("property")
- Properties accessed via Content.getComponent("name").set("property", value)
- Visual/behavior properties: filmstripImage, text, enabled, visible, itemColour, bgColour

FORMAT: "ComponentType.propertyName"
EXAMPLES: "ScriptButton.filmstripImage", "ScriptSlider.mode", "ScriptLabel.text"

DO NOT USE FOR:
- Method calls with () like setValue(), getValue() -> use query_scripting_api
- Module parameters like Gain, Attack -> use query_module_parameter

RETURNS: Property type, default value, description, possible values, and related properties.`,
    inputSchema: {
      type: 'object',
      properties: {
        componentProperty: {
          type: 'string',
          description: 'The property in "Component.property" format. Examples: "ScriptButton.filmstripImage", "ScriptSlider.mode"',
        },
      },
      required: ['componentProperty'],
    },
  },
  {
    name: 'query_module_parameter',
    description: `Get full details for a HISE module/processor parameter by exact name.

USE THIS FOR:
- DSP module parameters: Gain, Attack, Release, Frequency, Q
- Processor settings accessed via setAttribute()
- Sound generator parameters: HardcodedSynth.Gain, SimpleEnvelope.Attack

FORMAT: "ModuleType.ParameterId"
EXAMPLES: "SimpleEnvelope.Attack", "HardcodedSynth.Gain", "SimpleGain.Gain"

DO NOT USE FOR:
- Scripting methods with () -> use query_scripting_api
- UI component properties -> use query_ui_property

RETURNS: Min/max values, step size, default value, description, and related parameters.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleParameter: {
          type: 'string',
          description: 'The parameter in "Module.parameterId" format. Examples: "SimpleEnvelope.Attack", "HardcodedSynth.Gain"',
        },
      },
      required: ['moduleParameter'],
    },
  },

  // SNIPPET TOOLS
  {
    name: 'list_snippets',
    description: `Browse available HISE code snippets with optional filtering.

USE THIS TO:
- Discover example code for learning
- Find snippets by category: Modules, MIDI, Scripting, Scriptnode, UI
- Filter by difficulty: beginner, intermediate, advanced
- Search by tags

WORKFLOW: Use this to browse -> find relevant snippet ID -> use get_snippet to get full code.

RETURNS: Array of snippet summaries (id, title, description, category, tags, difficulty).`,
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Optional: Filter by category (All, Modules, MIDI, Scripting, Scriptnode, UI)',
        },
        difficulty: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
          description: 'Optional: Filter by difficulty level',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: Filter by tags (e.g., ["Best Practice", "Featured"])',
        },
      },
    },
  },
  {
    name: 'get_snippet',
    description: `Get complete code snippet with full source code and metadata.

USE AFTER list_snippets to retrieve the actual code.

RETURNS: Complete snippet including:
- Full source code
- Related API methods
- Related UI components
- Category and tags`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The snippet ID from list_snippets (e.g., "basicsynth", "midi-cc-control")',
        },
      },
      required: ['id'],
    },
  },

  // LISTING TOOLS - For browsing available items
  {
    name: 'list_ui_components',
    description: 'List all UI component types (ScriptButton, ScriptSlider, ScriptPanel, etc.) that have documented properties.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_scripting_namespaces',
    description: 'List all Scripting API namespaces (Synth, Engine, Math, Console, etc.).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_module_types',
    description: 'List all module/processor types (SimpleEnvelope, HardcodedSynth, SimpleGain, etc.) that have documented parameters.',
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
      // PRIMARY SEARCH TOOL
      case 'search_hise': {
        const { query, domain = 'all', limit = 10 } = args as {
          query: string;
          domain?: SearchDomain;
          limit?: number;
        };
        const clampedLimit = Math.min(Math.max(1, limit), 50);
        const results = await dataLoader.search(query, domain as SearchDomain, clampedLimit);

        if (results.length === 0) {
          const suggestions = await dataLoader.findSimilar(query, 5, domain as SearchDomain);
          if (suggestions.length > 0) {
            return {
              content: [{
                type: 'text',
                text: `No results found for "${query}". Did you mean:\n${suggestions.map(s => `  - ${s}`).join('\n')}`
              }],
            };
          }
          return {
            content: [{ type: 'text', text: `No results found for "${query}" in domain "${domain}"` }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              domain,
              resultCount: results.length,
              results
            }, null, 2)
          }],
        };
      }

      // EXACT QUERY TOOLS (with enriched responses)
      case 'query_ui_property': {
        const { componentProperty } = args as { componentProperty: string };
        const enriched = dataLoader.queryUIPropertyEnriched(componentProperty);

        if (!enriched) {
          const suggestions = await dataLoader.findSimilar(componentProperty, 3, 'ui');
          if (suggestions.length > 0) {
            return {
              content: [{
                type: 'text',
                text: `No property found for "${componentProperty}". Did you mean:\n${suggestions.map(s => `  - ${s}`).join('\n')}\n\nTip: Use search_hise to find properties by keyword.`
              }],
            };
          }
          return {
            content: [{ type: 'text', text: `No property found for "${componentProperty}". Use list_ui_components to see available components, or search_hise to search by keyword.` }],
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
        };
      }

      case 'query_scripting_api': {
        const { apiCall } = args as { apiCall: string };
        const enriched = dataLoader.queryScriptingAPIEnriched(apiCall);

        if (!enriched) {
          const suggestions = await dataLoader.findSimilar(apiCall, 3, 'api');
          if (suggestions.length > 0) {
            return {
              content: [{
                type: 'text',
                text: `No API method found for "${apiCall}". Did you mean:\n${suggestions.map(s => `  - ${s}`).join('\n')}\n\nTip: Use search_hise to find methods by keyword.`
              }],
            };
          }
          return {
            content: [{ type: 'text', text: `No API method found for "${apiCall}". Use list_scripting_namespaces to see available namespaces, or search_hise to search by keyword.` }],
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
        };
      }

      case 'query_module_parameter': {
        const { moduleParameter } = args as { moduleParameter: string };
        const enriched = dataLoader.queryModuleParameterEnriched(moduleParameter);

        if (!enriched) {
          const suggestions = await dataLoader.findSimilar(moduleParameter, 3, 'modules');
          if (suggestions.length > 0) {
            return {
              content: [{
                type: 'text',
                text: `No parameter found for "${moduleParameter}". Did you mean:\n${suggestions.map(s => `  - ${s}`).join('\n')}\n\nTip: Use search_hise to find parameters by keyword.`
              }],
            };
          }
          return {
            content: [{ type: 'text', text: `No parameter found for "${moduleParameter}". Use list_module_types to see available modules, or search_hise to search by keyword.` }],
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
        };
      }

      // SNIPPET TOOLS (with filtering)
      case 'list_snippets': {
        const { category, difficulty, tags } = args as {
          category?: string;
          difficulty?: "beginner" | "intermediate" | "advanced";
          tags?: string[];
        };

        const summaries = await dataLoader.listSnippetsFiltered({ category, difficulty, tags });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: summaries.length,
              filters: { category, difficulty, tags },
              snippets: summaries
            }, null, 2)
          }],
        };
      }

      case 'get_snippet': {
        const { id } = args as { id: string };
        const enriched = await dataLoader.getSnippetEnriched(id);

        if (!enriched) {
          const allSnippets = await dataLoader.listSnippets();
          const similarIds = allSnippets
            .filter(s => s.id.includes(id) || s.title.toLowerCase().includes(id.toLowerCase()))
            .slice(0, 3)
            .map(s => s.id);

          if (similarIds.length > 0) {
            return {
              content: [{
                type: 'text',
                text: `No snippet found with ID "${id}". Similar snippets:\n${similarIds.map(s => `  - ${s}`).join('\n')}`
              }],
            };
          }
          return {
            content: [{ type: 'text', text: `No snippet found with ID "${id}". Use list_snippets to see available snippets.` }],
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
        };
      }

      // LISTING TOOLS
      case 'list_ui_components': {
        const data = dataLoader.getAllData();
        const components = [...new Set(data?.uiComponentProperties.map((p: UIComponentProperty) => p.componentType) || [])].sort();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: components.length,
              components,
              hint: 'Use query_ui_property with "ComponentName.propertyName" to get property details, or search_hise to search by keyword.'
            }, null, 2)
          }],
        };
      }

      case 'list_scripting_namespaces': {
        const data = dataLoader.getAllData();
        const namespaces = [...new Set(data?.scriptingAPI.map((m: ScriptingAPIMethod) => m.namespace) || [])].sort();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: namespaces.length,
              namespaces,
              hint: 'Use query_scripting_api with "Namespace.methodName" to get method details, or search_hise with "Namespace.*" to list all methods in a namespace.'
            }, null, 2)
          }],
        };
      }

      case 'list_module_types': {
        const data = dataLoader.getAllData();
        const modules = [...new Set(data?.moduleParameters.map((p: ModuleParameter) => p.moduleType) || [])].sort();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              count: modules.length,
              modules,
              hint: 'Use query_module_parameter with "ModuleName.parameterId" to get parameter details, or search_hise to search by keyword.'
            }, null, 2)
          }],
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

  const args = process.argv.slice(2);
  const isProduction = args.includes('--production') || args.includes('-p');
  const port = parseInt(process.env.PORT || '3000', 10);

  if (isProduction) {
    const app = express();
    app.use(express.json());

    const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', server: 'hise-mcp-server' });
    });

    // Auth status endpoint (for debugging)
    app.get('/auth/status', (_req: Request, res: Response) => {
      const authConfigured = isAuthConfigured();
      const oauthConfigured = isOAuthConfigured();
      res.json({
        authEnabled: authConfigured,
        oauthEnabled: oauthConfigured,
        cacheStats: authConfigured ? getTokenCache().stats() : null,
      });
    });

    // OAuth routes (Phase 3: Claude Desktop support)
    // Mount at root for /.well-known/oauth-authorization-server
    // and /oauth/* endpoints
    app.use(oauthRouter);

    // Apply auth middleware to all /mcp routes
    app.use('/mcp', authMiddleware);

    app.post('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId) {
        console.error(`Received MCP request for session: ${sessionId}`);
      }

      try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          transport = transports[sessionId];
        } else if (!sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              console.error(`Session initialized with ID: ${sid}`);
              transports[sid] = transport;
            },
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              console.error(`Transport closed for session ${sid}`);
              delete transports[sid];
            }
          };

          await server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        } else {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
            id: null,
          });
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      }
    });

    app.get('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const lastEventId = req.headers['last-event-id'];
      if (lastEventId) {
        console.error(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
      } else {
        console.error(`Establishing SSE stream for session ${sessionId}`);
      }

      const transport = transports[sessionId];
      await transport.handleRequest(req, res);
    });

    app.delete('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      console.error(`Session termination request for session ${sessionId}`);

      try {
        const transport = transports[sessionId];
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('Error handling session termination:', error);
        if (!res.headersSent) {
          res.status(500).send('Error processing session termination');
        }
      }
    });

    app.listen(port, () => {
      console.error(`HISE MCP server running in production mode on port ${port}`);
      console.error(`MCP endpoint: http://localhost:${port}/mcp`);
      
      // Auth status
      if (isAuthConfigured()) {
        console.error(`Auth enabled: validating tokens against ${process.env.MCP_VALIDATE_TOKEN_URL}`);
      } else {
        console.error(`WARNING: Auth not configured - MCP endpoints are publicly accessible!`);
        console.error(`Set MCP_VALIDATE_TOKEN_URL and MCP_SHARED_SECRET to enable auth.`);
      }
      
      // OAuth status
      if (isOAuthConfigured()) {
        console.error(`OAuth enabled: Claude Desktop can authenticate via ${process.env.OAUTH_AUTHORIZE_URL}`);
        console.error(`OAuth metadata: http://localhost:${port}/.well-known/oauth-authorization-server`);
      } else {
        console.error(`OAuth not configured - Claude Desktop OAuth flow unavailable.`);
        console.error(`Set OAUTH_ISSUER, OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL, MCP_CLIENT_ID, MCP_CLIENT_SECRET, MCP_SERVER_URL to enable.`);
      }
    });

    process.on('SIGINT', async () => {
      console.error('Shutting down server...');
      
      // Cleanup token cache
      if (isAuthConfigured()) {
        console.error('Cleaning up token cache...');
        getTokenCache().destroy();
      }
      
      for (const sessionId in transports) {
        try {
          console.error(`Closing transport for session ${sessionId}`);
          await transports[sessionId].close();
          delete transports[sessionId];
        } catch (error) {
          console.error(`Error closing transport for session ${sessionId}:`, error);
        }
      }
      console.error('Server shutdown complete');
      process.exit(0);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('HISE MCP server started in local mode (stdio)');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
