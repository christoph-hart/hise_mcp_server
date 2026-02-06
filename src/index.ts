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
  Tool,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { HISEDataLoader } from './data-loader.js';
import { UIComponentProperty, ScriptingAPIMethod, ModuleParameter, SearchDomain, ServerStatus } from './types.js';
import { getHiseClient } from './hise-client.js';
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

  // SERVER INFO TOOL
  {
    name: 'server_status',
    description: `Get server version, runtime information, data statistics, and HISE runtime availability.

USE THIS TO:
- Verify the server version matches expectations
- Check if data is loaded and from cache
- View statistics about available documentation
- Check if HISE runtime bridge is available (requires local HISE instance)
- Debug connection issues

RETURNS: Server name/version, Node.js version, platform, cache status, counts for all data types, and HISE runtime status.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ============================================================================
  // HISE RUNTIME BRIDGE TOOLS
  // These tools require a running HISE instance with REST API enabled
  // ============================================================================

  {
    name: 'hise_runtime_status',
    description: `Get status of the running HISE instance.

REQUIRES: HISE running locally with REST API enabled (default port 1900).

RETURNS: Project info, script processors, callbacks, and external files.

USE THIS TO:
- Verify HISE is running and accessible
- Discover available script processors and their moduleIds
- Find which callbacks have content (empty: false)
- Get the scriptsFolder path for external files`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hise_runtime_get_script',
    description: `Read script content from a HISE processor.

REQUIRES: HISE running locally with REST API enabled.

PARAMETERS:
- moduleId (required): The processor ID (e.g., "Interface")
- callback (optional): Specific callback (e.g., "onInit"). If omitted, returns all callbacks merged.
- startLine (optional): First line to return (1-based)
- endLine (optional): Last line to return (1-based, inclusive)

RESPONSE:
- With lineRange: Returns script excerpt with {start, end, total} metadata
- Without lineRange: Returns complete script

USE lineRange when debugging errors - fetch only lines around the error location instead of the entire script.

NOTE: onInit returns raw code (no function wrapper). Other callbacks include the function signature.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'The script processor module ID (e.g., "Interface")',
        },
        callback: {
          type: 'string',
          description: 'Optional: specific callback name (e.g., "onInit", "onNoteOn")',
        },
        startLine: {
          type: 'number',
          description: 'Optional: first line to return (1-based)',
        },
        endLine: {
          type: 'number',
          description: 'Optional: last line to return (1-based, inclusive)',
        },
      },
      required: ['moduleId'],
    },
  },
  {
    name: 'hise_runtime_set_script',
    description: `Update and compile script content in a HISE processor.

REQUIRES: HISE running locally with REST API enabled.

PARAMETERS:
- moduleId (required): The processor ID
- script (required): The script content
- callback (optional): Specific callback to update. If omitted, script is treated as merged content.
- compile (optional): Whether to compile after setting (default: true)

RETURNS: Compilation result with success status, console logs, and any errors with callstacks.

NOTE: For onInit, provide raw code. For other callbacks, include the function wrapper.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'The script processor module ID',
        },
        script: {
          type: 'string',
          description: 'The script content',
        },
        callback: {
          type: 'string',
          description: 'Optional: specific callback to update',
        },
        compile: {
          type: 'boolean',
          description: 'Whether to compile after setting (default: true)',
        },
      },
      required: ['moduleId', 'script'],
    },
  },
  {
    name: 'hise_runtime_recompile',
    description: `Recompile a HISE processor without changing its script.

REQUIRES: HISE running locally with REST API enabled.

USE THIS:
- After editing external .js files directly on disk
- To re-run initialization code
- To check current compile state

RETURNS: Compilation result with success status, logs, and errors.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'The script processor module ID',
        },
      },
      required: ['moduleId'],
    },
  },
  {
    name: 'hise_runtime_screenshot',
    description: `Capture a screenshot of the HISE interface or a specific component.

REQUIRES: HISE running locally with REST API enabled.

PARAMETERS:
- moduleId (optional): Processor ID (default: "Interface")
- id (optional): Component ID to capture (omit for full interface)
- scale (optional): Scale factor - 0.5 or 1.0 (default: 1.0)
- outputPath (optional): File path to save PNG. If provided, saves to file. If omitted, returns base64.

RETURNS: Image dimensions and either base64 imageData or filePath.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'Processor ID (default: "Interface")',
        },
        id: {
          type: 'string',
          description: 'Component ID to capture (omit for full interface)',
        },
        scale: {
          type: 'number',
          description: 'Scale factor: 0.5 or 1.0 (default: 1.0)',
        },
        outputPath: {
          type: 'string',
          description: 'File path to save PNG (must end with .png)',
        },
      },
    },
  },
  {
    name: 'hise_runtime_list_components',
    description: `List all UI components in a HISE script processor.

REQUIRES: HISE running locally with REST API enabled.

PARAMETERS:
- moduleId (required): The processor ID (e.g., "Interface")
- hierarchy (optional): If true, returns nested tree with layout properties (x, y, width, height, visible, enabled)

RETURNS: Array of components with id and type. If hierarchy=true, includes layout properties and childComponents.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'The script processor module ID (e.g., "Interface")',
        },
        hierarchy: {
          type: 'boolean',
          description: 'If true, returns nested tree with layout properties (default: false)',
        },
      },
      required: ['moduleId'],
    },
  },
  {
    name: 'hise_runtime_get_component_properties',
    description: `Get properties for a UI component.

REQUIRES: HISE running locally with REST API enabled.

PARAMETERS:
- moduleId (required): The processor ID
- id (required): The component's ID (e.g., "Button1", "Knob1")
- compact (optional): Only return non-default properties (default: true)
- properties (optional): Array of specific property names to return

RESPONSE:
- With compact=true (default): Returns only modified properties, or just id/type if all are default
- With properties=[...]: Returns only the requested properties
- With compact=false: Returns all 45+ properties (use sparingly)

USE THIS TO:
- Check which properties have been modified from defaults
- Query specific properties like position (x, y, width, height)
- Get full property list only when discovering available options

AVOID calling this just to verify a set operation succeeded.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'The script processor module ID',
        },
        id: {
          type: 'string',
          description: 'The component ID (e.g., "Button1", "Knob1")',
        },
        compact: {
          type: 'boolean',
          description: 'Only return non-default properties (default: true)',
        },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: array of specific property names to return',
        },
      },
      required: ['moduleId', 'id'],
    },
  },
  {
    name: 'hise_runtime_set_component_properties',
    description: `Set properties on one or more UI components (like Interface Designer).

REQUIRES: HISE running locally with REST API enabled.

PARAMETERS:
- moduleId (required): The processor ID
- changes (required): Array of {id, properties: {...}} objects
- force (optional): If true, bypasses script-lock check (default: false)

RETURNS: Applied changes and recompileRequired flag. If properties are locked by script, returns error with locked list.

NOTE: When recompileRequired is true (parentComponent changed), call hise_runtime_recompile to apply.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'The script processor module ID',
        },
        changes: {
          type: 'array',
          description: 'Array of {id, properties: {...}} objects',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Component ID' },
              properties: { type: 'object', description: 'Properties to set' },
            },
            required: ['id', 'properties'],
          },
        },
        force: {
          type: 'boolean',
          description: 'Bypass script-lock check (default: false)',
        },
      },
      required: ['moduleId', 'changes'],
    },
  },
  {
    name: 'hise_runtime_get_component_value',
    description: `Get the current runtime value of a UI component.

REQUIRES: HISE running locally with REST API enabled.

PARAMETERS:
- moduleId (required): The processor ID
- id (required): The component's ID

RETURNS: Component type, current value, and min/max range.

USE THIS TO:
- Verify component state during testing
- Read current knob/slider position
- Check button toggle state`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'The script processor module ID',
        },
        id: {
          type: 'string',
          description: 'The component ID',
        },
      },
      required: ['moduleId', 'id'],
    },
  },
  {
    name: 'hise_runtime_set_component_value',
    description: `Set the runtime value of a UI component (triggers control callback).

REQUIRES: HISE running locally with REST API enabled.

PARAMETERS:
- moduleId (required): The processor ID
- id (required): The component's ID
- value (required): The value to set
- validateRange (optional): If true, validates value is within min/max range (default: false)

RETURNS: Success status. Console.print() output from callbacks appears in logs array.

NOTE: This triggers the component's control callback, simulating user interaction.`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'The script processor module ID',
        },
        id: {
          type: 'string',
          description: 'The component ID',
        },
        value: {
          type: 'number',
          description: 'The value to set',
        },
        validateRange: {
          type: 'boolean',
          description: 'Validate value is within min/max range (default: false)',
        },
      },
      required: ['moduleId', 'id', 'value'],
    },
  },
  {
    name: 'hise_runtime_get_selected_components',
    description: `Get the currently selected UI components from HISE's Interface Designer.

REQUIRES: HISE running locally with REST API enabled.

PARAMETERS:
- moduleId (optional): The processor ID (default: "Interface")

RETURNS: Selection count and array of selected components with all their properties.

USE THIS FOR AI-ASSISTED WORKFLOWS:
- User selects components in HISE, asks AI to align/resize them
- Batch property changes on selected components
- Generate code for selected components`,
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: {
          type: 'string',
          description: 'The processor ID (default: "Interface")',
        },
      },
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

      // SERVER STATUS TOOL
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
          hiseRuntime,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
      }

      // ========================================================================
      // HISE RUNTIME BRIDGE TOOLS
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
        const { moduleId, callback, startLine, endLine } = args as { 
          moduleId: string; 
          callback?: string;
          startLine?: number;
          endLine?: number;
        };
        const hiseClient = getHiseClient();
        try {
          const options = (startLine !== undefined || endLine !== undefined) 
            ? { startLine, endLine } 
            : undefined;
          const result = await hiseClient.getScript(moduleId, callback, options);
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
        const { moduleId, script, callback, compile } = args as {
          moduleId: string;
          script: string;
          callback?: string;
          compile?: boolean;
        };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.setScript({ moduleId, script, callback, compile });
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

      case 'hise_runtime_recompile': {
        const { moduleId } = args as { moduleId: string };
        const hiseClient = getHiseClient();
        try {
          const result = await hiseClient.recompile(moduleId);
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
