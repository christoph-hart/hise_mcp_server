#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  Tool,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { HISEDataLoader } from './data-loader.js';
import { UIComponentProperty, ScriptingAPIMethod, ModuleParameter, SearchDomain, ServerStatus, HiseError } from './types.js';
import { getHiseClient } from './hise-client.js';
import { findPatternMatch } from './error-patterns.js';
import { WORKFLOWS, formatWorkflowAsMarkdown } from './workflows.js';
import { STYLE_GUIDES, formatStyleGuideAsMarkdown } from './style-guides.js';
import { PROMPTS, generateStyleSelectedComponentPrompt } from './prompts.js';
import { authMiddleware, isAuthConfigured, isOAuthConfigured, getTokenCache } from './auth/index.js';
import { oauthRouter } from './routes/oauth.js';
import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

// Read package.json for version info
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const SERVER_NAME = packageJson.name;
const SERVER_VERSION = packageJson.version;

const server = new Server(
  {
    name: SERVER_NAME,
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

let dataLoader: HISEDataLoader;

// ============================================================================
// Error Enrichment Helpers
// ============================================================================

/**
 * Extract potential API call from error message for fuzzy search
 */
function extractApiCallFromError(errorMessage: string): string | null {
  const patterns = [
    /Unknown function '([^']+)'/,
    /Can't find '([^']+)'/,
    /Unknown identifier '([^']+)'/,
    /API call (\w+\.\w+)/,
  ];
  
  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Enrich errors with suggestions from pattern matching and API fuzzy search
 */
async function enrichErrorsWithSuggestions(errors: HiseError[]): Promise<void> {
  for (const error of errors) {
    const suggestions: string[] = [];

    // 1. Check error patterns first
    const patternSuggestion = findPatternMatch(
      error.errorMessage,
      error.codeContext?.code
    );
    if (patternSuggestion) {
      suggestions.push(patternSuggestion);
    }

    // 2. Try fuzzy API search for unknown functions/identifiers
    const apiCall = extractApiCallFromError(error.errorMessage);
    if (apiCall) {
      const similar = await dataLoader.findSimilar(apiCall, 3, 'api');
      if (similar.length > 0) {
        suggestions.push(`Did you mean: ${similar.join(', ')}`);
      }
    }

    if (suggestions.length > 0) {
      error.suggestions = suggestions;
    }
  }
}

// Track server mode (set in main())
let isProductionMode = false;

// Documentation tools - always available
const DOC_TOOLS: Tool[] = [
  // PRIMARY TOOL - Use this first for discovery and searching
  {
    name: 'search_hise',
    description: `Search HISE docs by keyword or pattern (e.g., "midi", "Synth.*"). Returns matches with relevance score. Use query_* tools for full details.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords or pattern (e.g., "Synth.*")',
        },
        domain: {
          type: 'string',
          enum: ['all', 'api', 'ui', 'modules', 'snippets'],
          description: 'Filter by domain (default: all)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10)',
        },
      },
      required: ['query'],
    },
  },

  // EXACT QUERY TOOLS - Use after search or when you know exact names
  {
    name: 'query_scripting_api',
    description: `Get API method details. Format: "Namespace.method" (e.g., "Synth.addNoteOn"). Returns signature, parameters, examples.`,
    inputSchema: {
      type: 'object',
      properties: {
        apiCall: {
          type: 'string',
          description: '"Namespace.method" (e.g., "Synth.addNoteOn")',
        },
      },
      required: ['apiCall'],
    },
  },
  {
    name: 'query_ui_property',
    description: `Get UI component property details. Format: "Component.property" (e.g., "ScriptButton.filmstripImage"). Returns type, default, possible values.`,
    inputSchema: {
      type: 'object',
      properties: {
        componentProperty: {
          type: 'string',
          description: '"Component.property" (e.g., "ScriptSlider.mode")',
        },
      },
      required: ['componentProperty'],
    },
  },
  {
    name: 'query_module_parameter',
    description: `Get module parameter details. Format: "Module.param" (e.g., "SimpleEnvelope.Attack"). Returns min/max, default, description.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleParameter: {
          type: 'string',
          description: '"Module.param" (e.g., "SimpleGain.Gain")',
        },
      },
      required: ['moduleParameter'],
    },
  },

  // SNIPPET TOOLS
  {
    name: 'list_snippets',
    description: `Browse HISE code snippets. Filter by category/difficulty/tags. Use get_snippet for full code.`,
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category filter',
        },
        difficulty: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
          description: 'Difficulty filter',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tag filter',
        },
      },
    },
  },
  {
    name: 'get_snippet',
    description: `Get snippet source code and metadata.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Snippet ID',
        },
      },
      required: ['id'],
    },
  },

  // LISTING TOOLS - For browsing available items
  {
    name: 'list_ui_components',
    description: 'List UI component types with documented properties.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_scripting_namespaces',
    description: 'List Scripting API namespaces.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_module_types',
    description: 'List module types with documented parameters.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // SERVER INFO TOOL
  {
    name: 'server_status',
    description: `Get server status, data statistics, and HISE runtime availability.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // RESOURCE TOOLS - Access static documentation resources
  {
    name: 'list_resources',
    description: `List available HISE resources (workflows, guides). Use get_resource for full content.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_resource',
    description: `Get a HISE resource by ID. Returns markdown content.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Resource ID (e.g., "laf-functions-style")',
        },
      },
      required: ['id'],
    },
  },

  // LAF (LookAndFeel) TOOLS
  {
    name: 'list_laf_functions',
    description: `List LAF functions for a component type. IMPORTANT: Load get_resource("laf-functions-style") before writing LAF code.`,
    inputSchema: {
      type: 'object',
      properties: {
        componentType: {
          type: 'string',
          description: 'e.g., "ScriptButton", "PresetBrowser"',
        },
      },
      required: ['componentType'],
    },
  },
  {
    name: 'query_laf_function',
    description: `Get LAF function details including obj properties for drawing code.`,
    inputSchema: {
      type: 'object',
      properties: {
        functionName: {
          type: 'string',
          description: 'e.g., "drawToggleButton"',
        },
      },
      required: ['functionName'],
    },
  },

];

// HISE Runtime tools - only available in local mode when HISE is connected
const RUNTIME_TOOLS: Tool[] = [
  {
    name: 'hise_runtime_status',
    description: `Get HISE runtime status. Returns project info, processors, callbacks.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hise_runtime_get_script',
    description: `Read script from a processor. Returns {callbacks: {...}, externalFiles: [...]}.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
        callback: {
          type: 'string',
          description: 'Specific callback (optional)',
        },
      },
      required: ['moduleId'],
    },
  },
  {
    name: 'hise_runtime_set_script',
    description: `Set and compile script. RESTRICTION: Only for NEW (empty) callbacks OR callbacks with <50 lines. For larger scripts, use edit_script to make changes.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
        callbacks: {
          type: 'object',
          description: '{"callbackName": "code", ...}',
          additionalProperties: { type: 'string' },
        },
        compile: {
          type: 'boolean',
          description: 'Compile after setting (default: true)',
        },
        errorContextLines: {
          type: 'number',
          description: 'Error context lines (default: 1)',
        },
      },
      required: ['moduleId', 'callbacks'],
    },
  },
  {
    name: 'hise_runtime_edit_script',
    description: `Edit script by replacing oldString with newString. Works like the native mcp_edit tool - find exact string match and replace. This is the primary tool for modifying existing scripts. For multiple edits, call repeatedly with compile:false, then compile:true on last edit.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
        callback: {
          type: 'string',
          description: 'Callback name (e.g., "onInit")',
        },
        oldString: {
          type: 'string',
          description: 'Exact string to find and replace',
        },
        newString: {
          type: 'string',
          description: 'Replacement string',
        },
        replaceAll: {
          type: 'boolean',
          description: 'Replace all occurrences (default: false)',
        },
        compile: {
          type: 'boolean',
          description: 'Compile after (default: true)',
        },
        errorContextLines: {
          type: 'number',
          description: 'Error context lines (default: 1)',
        },
      },
      required: ['moduleId', 'callback', 'oldString', 'newString'],
    },
  },
  {
    name: 'hise_runtime_recompile',
    description: `Recompile a processor without changing script. Use after editing external .js files.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
        errorContextLines: {
          type: 'number',
          description: 'Error context lines (default: 1)',
        },
      },
      required: ['moduleId'],
    },
  },
  {
    name: 'hise_runtime_screenshot',
    description: `Screenshot the interface or a component. Returns base64 or saves to file.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
        id: {
          type: 'string',
          description: 'Component ID (omit for full interface)',
        },
        scale: {
          type: 'number',
          description: '0.5 or 1.0',
        },
        outputPath: {
          type: 'string',
          description: 'Save path (.png)',
        },
      },
    },
  },

  {
    name: 'hise_runtime_list_components',
    description: `List UI components. Use hierarchy=true for layout tree.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
        hierarchy: {
          type: 'boolean',
          description: 'Include layout tree',
        },
      },
      required: ['moduleId'],
    },
  },
  {
    name: 'hise_runtime_get_component_properties',
    description: `Get component properties. compact=true returns only non-defaults.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
        id: {
          type: 'string',
          description: 'Component ID',
        },
        compact: {
          type: 'boolean',
          description: 'Only non-defaults (default: true)',
        },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific properties to return',
        },
      },
      required: ['moduleId', 'id'],
    },
  },
  {
    name: 'hise_runtime_set_component_properties',
    description: `Set component properties. Pass changes array: [{id, properties: {...}}].`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
        changes: {
          type: 'array',
          description: '[{id, properties}]',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              properties: { type: 'object' },
            },
            required: ['id', 'properties'],
          },
        },
        force: {
          type: 'boolean',
          description: 'Bypass lock check',
        },
      },
      required: ['moduleId', 'changes'],
    },
  },
  {
    name: 'hise_runtime_get_component_value',
    description: `Get component's runtime value.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
        id: {
          type: 'string',
          description: 'Component ID',
        },
      },
      required: ['moduleId', 'id'],
    },
  },
  {
    name: 'hise_runtime_set_component_value',
    description: `Set component's runtime value. Triggers control callback.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
        id: {
          type: 'string',
          description: 'Component ID',
        },
        value: {
          type: 'number',
          description: 'Value to set',
        },
        validateRange: {
          type: 'boolean',
          description: 'Validate range',
        },
      },
      required: ['moduleId', 'id', 'value'],
    },
  },
  {
    name: 'hise_runtime_get_selected_components',
    description: `Get selected components from Interface Designer.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
      },
    },
  },
  {
    name: 'hise_verify_parameters',
    description: 'Verify method signatures. Returns parameter info for multiple methods.',
    inputSchema: {
      type: 'object',
      properties: {
        methods: {
          type: 'array',
          items: { type: 'string' },
          description: 'Method names (e.g., ["fillRect", "print"])'
        }
      },
      required: ['methods']
    }
  },
  {
    name: 'hise_runtime_get_laf_functions',
    description: `Get LAF functions for specific components. IMPORTANT: Load get_resource("laf-functions-style") before writing LAF code.`,
    inputSchema: {
      type: 'object',
      properties: {
        componentIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Component IDs (e.g., ["Button1"])',
        },
        moduleId: {
          type: 'string',
          description: 'Processor ID (e.g., "Interface")',
        },
      },
      required: ['componentIds'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // In production mode, only expose documentation tools
  // In local mode, expose all tools (HISE connection verified at startup)
  const tools = isProductionMode ? DOC_TOOLS : [...DOC_TOOLS, ...RUNTIME_TOOLS];
  return { tools };
});

// ============================================================================
// MCP Resource Handlers
// ============================================================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'hise://workflows',
        name: 'HISE Workflows',
        description: 'List of recommended workflows for HISE development',
        mimeType: 'application/json',
      },
      ...WORKFLOWS.map(w => ({
        uri: `hise://workflows/${w.id}`,
        name: w.name,
        description: w.description,
        mimeType: 'text/markdown',
      })),
      {
        uri: 'hise://style-guides',
        name: 'HISE Style Guides',
        description: 'Coding style guides for HISE development',
        mimeType: 'application/json',
      },
      ...STYLE_GUIDES.map(s => ({
        uri: `hise://style-guides/${s.id}`,
        name: s.name,
        description: s.description,
        mimeType: 'text/markdown',
      })),
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // List all workflows
  if (uri === 'hise://workflows') {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          WORKFLOWS.map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
          })),
          null,
          2
        ),
      }],
    };
  }

  // Specific workflow
  const workflowMatch = uri.match(/^hise:\/\/workflows\/(.+)$/);
  if (workflowMatch) {
    const workflow = WORKFLOWS.find(w => w.id === workflowMatch[1]);
    if (workflow) {
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: formatWorkflowAsMarkdown(workflow),
        }],
      };
    }
  }

  // List all style guides
  if (uri === 'hise://style-guides') {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          STYLE_GUIDES.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
          })),
          null,
          2
        ),
      }],
    };
  }

  // Specific style guide
  const styleGuideMatch = uri.match(/^hise:\/\/style-guides\/(.+)$/);
  if (styleGuideMatch) {
    const styleGuide = STYLE_GUIDES.find(s => s.id === styleGuideMatch[1]);
    if (styleGuide) {
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: formatStyleGuideAsMarkdown(styleGuide),
        }],
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
});

// ============================================================================
// MCP Prompt Handlers
// ============================================================================

/**
 * List available prompts
 * Prompts are only available in local mode (require HISE runtime)
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  // Only expose prompts in local mode (requires HISE runtime)
  if (isProductionMode) {
    return { prompts: [] };
  }

  return {
    prompts: PROMPTS.map(p => ({
      name: p.name,
      title: p.title,
      description: p.description,
      arguments: p.arguments,
    })),
  };
});

/**
 * Get a specific prompt with generated content
 */
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Guard: prompts only available in local mode
  if (isProductionMode) {
    throw new Error('Prompts are not available in production mode. They require a local HISE runtime connection.');
  }

  switch (name) {
    case 'style_selected_component':
      return await generateStyleSelectedComponentPrompt(args, dataLoader);

    default:
      throw new Error(`Unknown prompt: ${name}. Available prompts: ${PROMPTS.map(p => p.name).join(', ')}`);
  }
});

// ============================================================================
// MCP Tool Handlers
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Guard: reject runtime tools in production mode
  if (isProductionMode && name.startsWith('hise_runtime_')) {
    return {
      content: [{ type: 'text', text: 'HISE runtime tools are not available in production mode.' }],
      isError: true,
    };
  }

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

      // SERVER STATUS TOOL
       case 'hise_verify_parameters': {
         const { methods } = args as { methods: string[] };
         const result = dataLoader.lookupMethodsByName(methods);
         return {
           content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
         };
       }

       case 'server_status': {
        const baseStatus = dataLoader.getServerStatus(SERVER_NAME, SERVER_VERSION);
        const hiseClient = getHiseClient();
        
        // Check HISE runtime availability
        let hiseRuntime: ServerStatus['hiseRuntime'];
        try {
          const available = await hiseClient.isAvailable();
          if (available) {
            const hiseStatus = await hiseClient.getStatus();
            hiseRuntime = {
              available: true,
              url: hiseClient.getBaseUrl(),
              project: hiseStatus.project?.name || null,
              error: null,
            };
          } else {
            hiseRuntime = {
              available: false,
              url: hiseClient.getBaseUrl(),
              project: null,
              error: 'HISE not reachable',
            };
          }
        } catch (err) {
          hiseRuntime = {
            available: false,
            url: hiseClient.getBaseUrl(),
            project: null,
            error: err instanceof Error ? err.message : 'Unknown error',
          };
        }

        const status: ServerStatus = {
          ...baseStatus,
          mode: isProductionMode ? 'production' : 'local',
          hiseRuntime,
          hints: {
            resources: 'Use list_resources tool to discover available workflows and guides',
          },
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
      }

      // RESOURCE TOOLS
      case 'list_resources': {
        const resources = {
          workflows: WORKFLOWS.map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
          })),
          styleGuides: STYLE_GUIDES.map(s => ({
            id: s.id,
            name: s.name,
            description: s.description,
          })),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(resources, null, 2) }],
        };
      }

      case 'get_resource': {
        const { id } = args as { id: string };

        // Check workflows
        const workflow = WORKFLOWS.find(w => w.id === id);
        if (workflow) {
          return {
            content: [{ type: 'text', text: formatWorkflowAsMarkdown(workflow) }],
          };
        }

        // Check style guides
        const styleGuide = STYLE_GUIDES.find(s => s.id === id);
        if (styleGuide) {
          return {
            content: [{ type: 'text', text: formatStyleGuideAsMarkdown(styleGuide) }],
          };
        }

        // Not found
        const availableIds = [
          ...WORKFLOWS.map(w => w.id),
          ...STYLE_GUIDES.map(s => s.id),
        ];
        return {
          content: [{
            type: 'text',
            text: `Resource not found: "${id}". Available resources: ${availableIds.join(', ')}`
          }],
          isError: true,
        };
      }

      // ========================================================================
      // LAF (LookAndFeel) TOOLS
      // ========================================================================

      case 'list_laf_functions': {
        const { componentType } = args as { componentType: string };
        const result = await dataLoader.listLAFFunctions(componentType);

        if (!result) {
          return {
            content: [{
              type: 'text',
              text: `No LAF functions found for component type "${componentType}". Check if the type name is correct (e.g., "ScriptButton", "PresetBrowser", "PopupMenu").`
            }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'query_laf_function': {
        const { functionName } = args as { functionName: string };
        const result = await dataLoader.queryLAFFunction(functionName);

        if (!result) {
          return {
            content: [{
              type: 'text',
              text: `LAF function "${functionName}" not found. Use list_laf_functions to see available functions for a component type.`
            }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      // ========================================================================
      // HISE RUNTIME BRIDGE TOOLS
      // These tools are only available in local mode
      // ========================================================================

      case 'hise_runtime_status': {
        const hiseClient = getHiseClient();
        try {
          const status = await hiseClient.getStatus();
          return {
            content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{
              type: 'text',
              text: `HISE Runtime Error: ${err instanceof Error ? err.message : 'Unknown error'}\n\nEnsure HISE is running with the REST API enabled (default port 1900).`
            }],
            isError: true,
          };
        }
      }

      case 'hise_runtime_get_script': {
        const { moduleId, callback } = args as { 
          moduleId: string; 
          callback?: string;
        };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.getScript(moduleId, callback);
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

      case 'hise_runtime_set_script': {
        const { moduleId, callbacks, compile, errorContextLines } = args as {
          moduleId: string;
          callbacks: Record<string, string>;
          compile?: boolean;
          errorContextLines?: number;
        };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.setScript(
            { moduleId, callbacks, compile },
            errorContextLines ?? 1
          );
          // Enrich errors with suggestions (runtime errors can occur even when success=true)
          if (result.errors?.length) {
            await enrichErrorsWithSuggestions(result.errors);
          }
          // Add hint for style guide when errors occur
          const response = result.errors?.length
            ? { ...result, _hint: "Tip: Use get_resource('hisescript-style') for HiseScript syntax reference" }
            : result;
          return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
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

      case 'hise_runtime_recompile': {
        const { moduleId, errorContextLines } = args as { 
          moduleId: string;
          errorContextLines?: number;
        };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.recompile(moduleId, errorContextLines ?? 1);
          // Enrich errors with suggestions (runtime errors can occur even when success=true)
          if (result.errors?.length) {
            await enrichErrorsWithSuggestions(result.errors);
          }
          // Add hint for style guide when errors occur
          const response = result.errors?.length
            ? { ...result, _hint: "Tip: Use get_resource('hisescript-style') for HiseScript syntax reference" }
            : result;
          return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
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

      case 'hise_runtime_screenshot': {
        const { moduleId, id, scale, outputPath } = args as {
          moduleId?: string;
          id?: string;
          scale?: number;
          outputPath?: string;
        };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.screenshot({ moduleId, id, scale, outputPath });
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

      case 'hise_runtime_edit_script': {
        const { moduleId, callback, oldString, newString, replaceAll, compile, errorContextLines } = args as {
          moduleId: string;
          callback: string;
          oldString: string;
          newString: string;
          replaceAll?: boolean;
          compile?: boolean;
          errorContextLines?: number;
        };
        
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.editScript(
            { moduleId, callback, oldString, newString, replaceAll, compile },
            errorContextLines ?? 1
          );
          // Enrich errors with suggestions
          if (result.errors?.length) {
            await enrichErrorsWithSuggestions(result.errors);
          }
          const response = result.errors?.length
            ? { ...result, _hint: "Tip: Use get_resource('hisescript-style') for HiseScript syntax reference" }
            : result;
          return {
            content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
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

      case 'hise_runtime_list_components': {
        const { moduleId, hierarchy } = args as { moduleId: string; hierarchy?: boolean };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.listComponents(moduleId, hierarchy);
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

      case 'hise_runtime_get_component_properties': {
        const { moduleId, id, compact, properties } = args as { 
          moduleId: string; 
          id: string;
          compact?: boolean;
          properties?: string[];
        };
        const hiseClient = getHiseClient();
        try {
          const options = { compact, properties };
          const result = await hiseClient.getComponentProperties(moduleId, id, options);
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

      case 'hise_runtime_set_component_properties': {
        const { moduleId, changes, force } = args as {
          moduleId: string;
          changes: { id: string; properties: Record<string, unknown> }[];
          force?: boolean;
        };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.setComponentProperties({ moduleId, changes, force });
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

      case 'hise_runtime_get_component_value': {
        const { moduleId, id } = args as { moduleId: string; id: string };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.getComponentValue(moduleId, id);
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

      case 'hise_runtime_set_component_value': {
        const { moduleId, id, value, validateRange } = args as {
          moduleId: string;
          id: string;
          value: number;
          validateRange?: boolean;
        };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.setComponentValue({ moduleId, id, value, validateRange });
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

      case 'hise_runtime_get_selected_components': {
        const { moduleId } = args as { moduleId?: string };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.getSelectedComponents(moduleId);
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

      case 'hise_runtime_get_laf_functions': {
        const { componentIds, moduleId } = args as { componentIds: string[]; moduleId?: string };
        
        // Validate required parameter
        if (!componentIds || componentIds.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'Error: componentIds is required. Pass component IDs from hise_runtime_get_selected_components (e.g., componentIds=["Button1", "Button2"]). Do NOT pass only moduleId.'
            }],
            isError: true,
          };
        }
        
        const hiseClient = getHiseClient();
        
        try {
          // Get component properties to determine types
          const lafTargets: string[] = [];
          
          for (const componentId of componentIds) {
            const propsResult = await hiseClient.getComponentProperties(
              moduleId || 'Interface',
              componentId,
              { compact: false }
            );
            
            if (propsResult.success && propsResult.type) {
              // For ScriptFloatingTile, we need the ContentType property
              if (propsResult.type === 'ScriptFloatingTile') {
                const contentTypeProp = propsResult.properties?.find(p => p.id === 'ContentType');
                if (contentTypeProp && typeof contentTypeProp.value === 'string') {
                  lafTargets.push(contentTypeProp.value);
                }
              } else {
                lafTargets.push(propsResult.type);
              }
            }
          }
          
          // Get unique LAF targets and look up functions
          const uniqueTargets = [...new Set(lafTargets)];
          const functions = await dataLoader.getLAFFunctionsForTypes(uniqueTargets);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                componentIds,
                functions,
                note: "Before writing LAF code, use get_resource with IDs 'laf-functions-style' and 'hisescript-style' for correct implementation patterns. Use hise_runtime_set_script for new code, or hise_runtime_edit_script to modify existing code."
              }, null, 2)
            }],
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
  isProductionMode = args.includes('--production') || args.includes('-p');
  const port = parseInt(process.env.PORT || '3000', 10);

  if (isProductionMode) {
    console.error('HISE MCP server starting in production mode (documentation only)...');
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
    // Local mode - start server, HISE tools will error if HISE isn't running
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('HISE MCP server started in local mode (stdio)');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
