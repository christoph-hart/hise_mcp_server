#!/usr/bin/env node

import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
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
import { UIComponentProperty, ScriptingAPIMethod, ModuleParameter, SearchDomain, ServerStatus } from './types.js';
import { WORKFLOWS, formatWorkflowAsMarkdown } from './workflows.js';
import { STYLE_GUIDES, formatStyleGuideAsMarkdown } from './style-guides.js';
import { CONTRIBUTION_GUIDES, formatContributionGuideAsMarkdown } from './contribution-guides.js';
import { PROMPTS, generateContributePrompt } from './prompts.js';
import { searchForum, fetchForumTopics, ForumTopicDetail } from './forum-search.js';
import { semanticSearch, getDocContent, getDocContentById, isAvailable as isSemanticSearchAvailable, searchExamples, getExampleById, listAllExamples, isExamplesAvailable, searchTutorials, getTutorialById, isTutorialsAvailable, warmupSearch, isEmbeddingsReady } from './semantic-search.js';
import express, { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { log } from './log.js';

// Process-level safety nets — log and (for unknown state) exit.
// Installed as early as possible so handler bugs at startup are visible.
process.on('unhandledRejection', (reason) => {
  log.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  log.error('Uncaught exception:', err);
  process.exit(1);
});

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

// Documentation tools - all tools are static (no local HISE runtime).
const DOC_TOOLS: Tool[] = [
  // PRIMARY TOOL - Use this first for discovery and searching
  {
    name: 'search_hise',
    description: `Search HISE docs by keyword or pattern (e.g., "midi", "Synth.*"). Returns matches with relevance score. Use query_* tools for full details. Domains: api, ui, modules, snippets, scriptnode, preprocessor.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Keywords or pattern (e.g., "Synth.*")',
        },
        domain: {
          type: 'string',
          enum: ['all', 'api', 'ui', 'modules', 'snippets', 'scriptnode', 'preprocessor'],
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

  // CLASS EXPLORATION TOOL - Use before query_scripting_api for discovery
  {
    name: 'explore_hise',
    description: `Explore HISE API class relationships and find the right classes for a task. Use this BEFORE query_scripting_api when you don't know which classes are involved. Returns class briefs, domain/role tags, factory chains (creates/createdBy), and "when to use A vs B" distinctions (seeAlso). Accepts a className for full graph entry, or query for free-text discovery.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free-text search across briefs and seeAlso distinctions',
        },
        className: {
          type: 'string',
          description: 'Full entry with one-hop context for a specific class',
        },
        domain: {
          type: 'string',
          enum: ['audio', 'complex-data', 'data', 'event', 'file', 'network',
                 'playback', 'preset-model', 'routing', 'scripting', 'scriptnode', 'ui'],
          description: 'Filter by functional domain (audio, ui, event, file, etc.)',
        },
        role: {
          type: 'string',
          enum: ['component', 'container', 'event', 'factory', 'handle',
                 'processor', 'service', 'utility'],
          description: 'Filter by architectural role (factory, handle, container, utility, etc.)',
        },
        source: {
          type: 'string',
          enum: ['all', 'docs', 'tutorials'],
          description: 'Filter by source: "docs" (API/content only), "tutorials" (video tutorials only), or "all" (default — searches both)',
        },
      },
    },
  },

  // EXACT QUERY TOOLS - Use after search or when you know exact names
  {
    name: 'query_scripting_api',
    description: `Get API method details. Format: "Namespace.method" (e.g., "Synth.addNoteOn"). Returns signature, parameters, examples. Enriched classes include thread safety, pitfalls, and source locations.`,
    inputSchema: {
      type: 'object',
      properties: {
        apiCall: {
          type: 'string',
          description: '"Namespace" for class overview, "Namespace.method" for method details (e.g., "Synth.addNoteOn")',
        },
        examples: {
          type: 'boolean',
          description: 'Include code examples (default: true)',
        },
      },
      required: ['apiCall'],
    },
  },
  {
    name: 'query_ui_property',
    description: `Get UI component property details. Format: "Component.property" (e.g., "ScriptButton.filmstripImage") for property details, or just "Component" (e.g., "ScriptSlider") for component overview with creation method, customization options, and common mistakes.`,
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
    description: `Get module parameter details. Format: "Module.param" (e.g., "SimpleEnvelope.Attack") for parameter details, or just "Module" (e.g., "LFO") for module overview with signal flow, all parameters, and common mistakes.`,
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

  // CODE EXAMPLE TOOLS
  {
    name: 'search_examples',
    description: `Search HISE code examples and snippets by description (e.g., "midi routing", "slider callback", "wavetable"). Returns summaries — use get_example for full code.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What you want to find (e.g., "clone an object before modifying")',
        },
        source: {
          type: 'string',
          enum: ['all', 'example', 'snippet', 'forum'],
          description: 'Filter by source type: "example" (API method examples), "snippet" (self-contained code snippets), "forum" (forum code examples), or "all" (default)',
        },
        className: {
          type: 'string',
          description: 'Optional: filter to API examples from a specific class (e.g., "Array", "Engine")',
        },
        featured: {
          type: 'boolean',
          description: 'If true, only return featured/high-quality examples',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10, max: 30)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_example',
    description: `Get full code and metadata for a code example or snippet by ID. Use after search_examples to retrieve full source code.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Example or snippet ID (e.g., "example:Array.clone:clone-template-object" or "snippet:basicsynth")',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_tutorial',
    description: `Get full content and metadata for a video tutorial section by ID. Use after explore_hise to retrieve full tutorial text and code blocks. Returns the section body plus YouTube deep link with timestamp.`,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Tutorial chunk ID (e.g., "video:dG-7K8cZoLI:using-key-switches-and-manual-round-robin-group-control")',
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
    description: `Get server status and data statistics.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hise_cli_help',
    description: `Discover the hise-cli command tree for live HISE control. The MCP server is docs-only — runtime ops (launch/shutdown, recompile, REPL, UI/scriptnode/builder editing, screenshots, profiling, publish, assets) live in the standalone hise-cli on the user's PATH. Call this first when you need any live HISE action; it tells you how to invoke hise-cli yourself via Bash.`,
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

  // FORUM SEARCH TOOLS
  {
    name: 'search_forum',
    description: 'Search the HISE forum with signal-based denoising. Returns a ranked topic list filtered by quality heuristics (trusted posters, solved status, upvotes, category relevance). Use fetch_forum_topics to read specific topics.',
    inputSchema: {
      type: 'object',
      properties: {
        term: {
          type: 'string',
          description: 'Primary search term (e.g., "ScriptSlider")',
        },
        alsoTerms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional search terms to broaden results',
        },
        maxResults: {
          type: 'number',
          description: 'Max topics to return (default: 15, max: 30)',
        },
      },
      required: ['term'],
    },
  },
  {
    name: 'fetch_forum_topics',
    description: 'Fetch and denoise specific forum topics by ID. Returns cleaned post content with noise removed (HiseSnippets, quoted replies, URLs, low-signal posts). Only includes posts from the OP, trusted/expert posters, and upvoted posts.',
    inputSchema: {
      type: 'object',
      properties: {
        tids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Topic IDs to fetch (max 5 per call)',
        },
        maxPostsPerTopic: {
          type: 'number',
          description: 'Max posts per topic (default: 30)',
        },
      },
      required: ['tids'],
    },
  },

  // DOCUMENTATION CONTENT TOOL
  {
    name: 'get_doc_content',
    description: 'Get full markdown documentation content for a HISE page or API method. Use after explore_hise or search_hise to read the actual docs. Accepts a URL path (from search results) or a chunk ID (e.g., "api:Buffer.create").',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL path from search results (e.g., "/v2/scripting-api/buffer#create")',
        },
        id: {
          type: 'string',
          description: 'Chunk ID from search results (e.g., "api:Buffer.create")',
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
    name: 'get_laf_functions_for_components',
    description: `Get LAF functions for a list of component types. IMPORTANT: Load get_resource("laf-functions-style") before writing LAF code. Use hise-cli '-ui show <id>' to discover a component's type (and ContentType for ScriptFloatingTile).`,
    inputSchema: {
      type: 'object',
      properties: {
        componentTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Component types (e.g., ["ScriptButton", "PresetBrowser"]). For ScriptFloatingTile, pass the ContentType value instead.',
        },
      },
      required: ['componentTypes'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: DOC_TOOLS };
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
      {
        uri: 'hise://contribution-guides',
        name: 'HISE Contribution Guides',
        description: 'Guides for the community contribution workflow',
        mimeType: 'application/json',
      },
      ...CONTRIBUTION_GUIDES.map(g => ({
        uri: `hise://contribution-guides/${g.id}`,
        name: g.name,
        description: g.description,
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

  // List all contribution guides
  if (uri === 'hise://contribution-guides') {
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(
          CONTRIBUTION_GUIDES.map(g => ({
            id: g.id,
            name: g.name,
            description: g.description,
          })),
          null,
          2
        ),
      }],
    };
  }

  // Specific contribution guide
  const guideMatch = uri.match(/^hise:\/\/contribution-guides\/(.+)$/);
  if (guideMatch) {
    const guide = CONTRIBUTION_GUIDES.find(g => g.id === guideMatch[1]);
    if (guide) {
      return {
        contents: [{
          uri,
          mimeType: 'text/markdown',
          text: formatContributionGuideAsMarkdown(guide),
        }],
      };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
});

// ============================================================================
// MCP Prompt Handlers
// ============================================================================

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: PROMPTS.map(p => ({
      name: p.name,
      title: p.title,
      description: p.description,
      arguments: p.arguments,
    })),
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'contribute':
      return generateContributePrompt(args, SERVER_VERSION);

    default:
      throw new Error(`Unknown prompt: ${name}. Available prompts: ${PROMPTS.map(p => p.name).join(', ')}`);
  }
});

// ============================================================================
// MCP Tool Handlers
// ============================================================================

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

      // CLASS EXPLORATION TOOL
      case 'explore_hise': {
        const { query, className, domain, role, source } = args as {
          query?: string;
          className?: string;
          domain?: string;
          role?: string;
          source?: 'all' | 'docs' | 'tutorials';
        };
        const searchSource = source || 'all';

        // className mode takes precedence
        if (className) {
          const result = await dataLoader.exploreSurveyByClass(className);
          if (!result) {
            return {
              content: [{
                type: 'text',
                text: `No class found for "${className}". Use explore_hise({ query: "keyword" }) to search by topic, or explore_hise({ domain: "audio" }) to browse by domain.`
              }],
            };
          }
          return {
            content: [{ type: 'text', text: result }],
          };
        }

        // query mode — hybrid: semantic search + existing keyword search
        if (query) {
          // Build parallel search promises based on source filter
          const searchPromises: Promise<any>[] = [];

          // Keyword search (docs only, skip for tutorials-only)
          if (searchSource !== 'tutorials') {
            searchPromises.push(dataLoader.exploreSurveyByQuery(query, { domain, role }));
          } else {
            searchPromises.push(Promise.resolve(''));
          }

          // Doc semantic search
          if (searchSource !== 'tutorials' && isSemanticSearchAvailable()) {
            searchPromises.push(semanticSearch(query, { topK: 10, maxResults: 15 }));
          } else {
            searchPromises.push(Promise.resolve([]));
          }

          // Video tutorial search
          if (searchSource !== 'docs' && isTutorialsAvailable()) {
            searchPromises.push(searchTutorials(query, { topK: 10, maxResults: 15 }));
          } else {
            searchPromises.push(Promise.resolve([]));
          }

          const [keywordResult, semanticResults, tutorialResults] = await Promise.all(searchPromises);

          const hasResults = semanticResults.length > 0 || tutorialResults.length > 0;

          if (hasResults) {
            const lines: string[] = [];

            if (keywordResult) {
              lines.push(keywordResult);
            }

            if (semanticResults.length > 0) {
              lines.push('\n--- Semantic search results ---\n');
              for (const r of semanticResults.slice(0, 8)) {
                const m = r.metadata;
                const label = m.class
                  ? `${m.class}${m.method ? '.' + m.method : ''}`
                  : m.title || m.url;
                const desc = typeof m.description === 'string' ? m.description.split(/\.\s/)[0] + '.' : '';
                const tag = r.via === 'vector' ? '' : ` [${r.via}]`;
                lines.push(`${label}${tag}  (${r.score.toFixed(3)})`);
                lines.push(`  ${m.url}`);
                if (desc) lines.push(`  ${desc}`);
                lines.push('');
              }
            }

            if (tutorialResults.length > 0) {
              lines.push('\n--- Video tutorial results ---\n');
              for (const r of tutorialResults.slice(0, 8)) {
                const m = r.metadata;
                const label = m.chapter || m.title || r.id;
                const videoTitle = m.title || '';
                const tag = r.via === 'vector' ? '' : ` [${r.via}]`;
                lines.push(`${label}${tag}  (${r.score.toFixed(3)})`);
                lines.push(`  ${m.url}`);
                if (videoTitle && videoTitle !== label) lines.push(`  Video: ${videoTitle} — ${m.channel || ''}`);
                lines.push('');
              }
            }

            const hints: string[] = [];
            if (semanticResults.length > 0) hints.push('Use get_doc_content({ url: "..." }) to read full documentation for any result.');
            if (tutorialResults.length > 0) hints.push('Use get_tutorial({ id: "..." }) to read full tutorial content.');
            lines.push(hints.join('\n'));

            return {
              content: [{ type: 'text', text: lines.join('\n') }],
            };
          }

          if (keywordResult) {
            return {
              content: [{ type: 'text', text: keywordResult }],
            };
          }

          return {
            content: [{ type: 'text', text: `No results found for "${query}".` }],
          };
        }

        // filter-only mode (domain and/or role without query)
        if (domain || role) {
          const result = await dataLoader.exploreSurveyByFilter({ domain, role });
          return {
            content: [{ type: 'text', text: result }],
          };
        }

        // No parameters provided
        return {
          content: [{
            type: 'text',
            text: 'Please provide at least one parameter: query (free-text search), className (full class details), or domain/role (filter by category).'
          }],
          isError: true,
        };
      }

      // EXACT QUERY TOOLS (with enriched responses)
      case 'query_ui_property': {
        const { componentProperty } = args as { componentProperty: string };

        // Component-level query (no dot) - return enriched llmRef if available
        if (!componentProperty.includes('.')) {
          const compData = dataLoader.queryUIComponentEnriched(componentProperty);
          if (compData?.llmRef) {
            return {
              content: [{ type: 'text', text: compData.llmRef }],
            };
          }
        }

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
        const { apiCall, examples: includeExamples = true } = args as { apiCall: string; examples?: boolean };

        // Class-level query: no dot means class overview (e.g., "TransportHandler")
        if (!apiCall.includes('.')) {
          const classData = dataLoader.queryScriptingClass(apiCall);
          if (classData) {
            const canonicalName = dataLoader.resolveClassName(apiCall) || apiCall;

            if (classData.llmRef) {
              // Enriched class: serve llmRef verbatim
              return {
                content: [{ type: 'text', text: classData.llmRef }],
              };
            }

            // Unenriched class: generate plain text card from structured data
            const classLines: string[] = [];
            classLines.push(`${canonicalName}${classData.category ? ` (${classData.category})` : ''}`);
            if (classData.obtainedVia) {
              classLines.push(`Obtain via: ${classData.obtainedVia}`);
            }
            classLines.push('');
            if (classData.description) {
              classLines.push(classData.description);
              classLines.push('');
            }
            if (classData.methodNames && classData.methodNames.length > 0) {
              classLines.push(`Methods (${classData.methodNames.length}):`);
              // Format method names in columns (4 per row, padded)
              const names = classData.methodNames.sort();
              const colWidth = Math.max(...names.map(n => n.length)) + 2;
              const cols = Math.max(1, Math.floor(72 / colWidth));
              for (let i = 0; i < names.length; i += cols) {
                const row = names.slice(i, i + cols).map(n => n.padEnd(colWidth)).join('');
                classLines.push(`  ${row.trimEnd()}`);
              }
            }
            return {
              content: [{ type: 'text', text: classLines.join('\n').trimEnd() }],
            };
          }

          // No class found - fall through to suggestions
          const suggestions = await dataLoader.findSimilar(apiCall, 3, 'api');
          if (suggestions.length > 0) {
            return {
              content: [{
                type: 'text',
                text: `No class or method found for "${apiCall}". Did you mean:\n${suggestions.map(s => `  - ${s}`).join('\n')}\n\nTip: Use search_hise to find methods by keyword.`
              }],
            };
          }
          return {
            content: [{ type: 'text', text: `No class found for "${apiCall}". Use list_scripting_namespaces to see available namespaces.` }],
          };
        }

        // Method-level query: has dot (e.g., "Synth.addNoteOn")
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

        const method = enriched.result;
        const lines: string[] = [];

        if (method.llmRef) {
          // Enriched method: serve llmRef verbatim
          lines.push(method.llmRef);

          // Append examples if requested
          if (includeExamples && method.examples && method.examples.length > 0) {
            lines.push('');
            for (const ex of method.examples) {
              lines.push(`Example: ${ex.title}`);
              // Indent each line of code by 2 spaces
              for (const codeLine of ex.code.split('\n')) {
                lines.push(`  ${codeLine}`);
              }
              lines.push('');
            }
          }
        } else {
          // Unenriched method: generate plain text card
          const paramStr = method.parameters
            .map(p => `${p.type} ${p.name}`)
            .join(', ');
          lines.push(`${method.namespace}::${method.methodName}(${paramStr}) -> ${method.returnType}`);
          lines.push('');
          if (method.description) {
            lines.push(method.description);
          }

          // Append example if requested
          if (includeExamples && method.examples && method.examples.length > 0) {
            lines.push('');
            for (const ex of method.examples) {
              lines.push(`Example: ${ex.title}`);
              for (const codeLine of ex.code.split('\n')) {
                lines.push(`  ${codeLine}`);
              }
              lines.push('');
            }
          }
        }

        // Append related items
        if (enriched.related && enriched.related.length > 0) {
          lines.push(`Related: ${enriched.related.join(', ')}`);
        }

        return {
          content: [{ type: 'text', text: lines.join('\n').trimEnd() }],
        };
      }

      case 'query_module_parameter': {
        const { moduleParameter } = args as { moduleParameter: string };

        // Module-level query (no dot) - return enriched llmRef if available
        if (!moduleParameter.includes('.')) {
          const moduleData = dataLoader.queryModuleEnriched(moduleParameter);
          if (moduleData?.llmRef) {
            return {
              content: [{ type: 'text', text: moduleData.llmRef }],
            };
          }
        }

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

      // CODE EXAMPLE TOOLS
      case 'search_examples': {
        const { query, source, className, featured, limit: rawLimit } = args as {
          query: string;
          source?: 'all' | 'example' | 'snippet' | 'forum';
          className?: string;
          featured?: boolean;
          limit?: number;
        };

        if (!isExamplesAvailable()) {
          return {
            content: [{ type: 'text', text: 'Example search index not available. Run the build pipeline first.' }],
          };
        }

        const limit = Math.min(Math.max(rawLimit || 10, 1), 30);
        const sourceFilter = source || 'all';

        // Fetch more if filtering, to ensure enough results after filtering
        const fetchLimit = (sourceFilter !== 'all' || className || featured) ? limit * 3 : limit;
        let results = await searchExamples(query, { maxResults: fetchLimit });

        if (sourceFilter !== 'all') {
          results = results.filter(r => r.metadata.source === sourceFilter);
        }
        if (className) {
          results = results.filter(r => r.metadata.class?.toLowerCase() === className.toLowerCase());
        }
        if (featured) {
          results = results.filter(r => r.metadata.featured);
        }

        results = results.slice(0, limit);

        const summaries = results.map(r => ({
          id: r.id,
          score: Math.round(r.score * 1000) / 1000,
          title: r.metadata.title || '',
          source: r.metadata.source,
          class: r.metadata.class,
          method: r.metadata.method,
          category: r.metadata.category,
          description: r.metadata.description || '',
          via: r.via,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              query,
              count: summaries.length,
              filters: { source: sourceFilter, className: className || null },
              results: summaries,
              hint: 'Use get_example({ id: "..." }) to retrieve full source code.'
            }, null, 2)
          }],
        };
      }

      case 'get_example': {
        const { id } = args as { id: string };
        const result = getExampleById(id);

        if (!result) {
          return {
            content: [{ type: 'text', text: `No example found with ID "${id}". Use search_examples to find examples.` }],
          };
        }

        const header = result.metadata.class
          ? `# ${result.metadata.title}\n**${result.metadata.class}.${result.metadata.method}** | Source: ${result.metadata.source}`
          : `# ${result.metadata.title}\n**Category:** ${result.metadata.category} | Source: ${result.metadata.source}`;

        return {
          content: [{ type: 'text', text: `${header}\n\n${result.body}` }],
        };
      }

      case 'get_tutorial': {
        const { id } = args as { id: string };

        if (!isTutorialsAvailable()) {
          return {
            content: [{ type: 'text', text: 'Tutorial search index not available. Run the video build pipeline first.' }],
          };
        }

        const result = getTutorialById(id);

        if (!result) {
          return {
            content: [{ type: 'text', text: `No tutorial found with ID "${id}". Use explore_hise({ query: "...", source: "tutorials" }) to find tutorials.` }],
          };
        }

        const m = result.metadata;
        const header = `# ${m.chapter || m.title}\n**Video:** ${m.title} — ${m.channel}\n**URL:** ${m.url}`;

        return {
          content: [{ type: 'text', text: `${header}\n\n${result.body}` }],
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
        // Load survey data so briefs are available as fallback descriptions
        await dataLoader.loadSurveyData();
        const listing = dataLoader.getNamespaceListing();
        const lines: string[] = [];
        lines.push(`${listing.length} namespaces:\n`);

        // Find the longest name for alignment (only among entries with descriptions)
        const maxNameLen = Math.max(...listing.filter(e => e.description).map(e => e.name.length));

        for (const entry of listing) {
          if (entry.description) {
            lines.push(`  ${entry.name.padEnd(maxNameLen)}  - ${entry.description}`);
          } else {
            lines.push(`  ${entry.name}`);
          }
        }

        lines.push('');
        lines.push('Use query_scripting_api("Namespace") for class overview, "Namespace.method" for method details.');

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
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

      case 'hise_verify_parameters': {
        const { methods } = args as { methods: string[] };
        const result = dataLoader.lookupMethodsByName(methods);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_laf_functions_for_components': {
        const { componentTypes } = args as { componentTypes: string[] };
        if (!componentTypes || componentTypes.length === 0) {
          return {
            content: [{
              type: 'text',
              text: 'Error: componentTypes is required (e.g., ["ScriptButton", "PresetBrowser"]). For ScriptFloatingTile pass the ContentType value instead.'
            }],
            isError: true,
          };
        }
        const uniqueTypes = [...new Set(componentTypes)];
        const functions = await dataLoader.getLAFFunctionsForTypes(uniqueTypes);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              componentTypes: uniqueTypes,
              functions,
              note: "Before writing LAF code, use get_resource with IDs 'laf-functions-style' and 'hisescript-style' for correct implementation patterns."
            }, null, 2)
          }],
        };
      }

      case 'server_status': {
        const baseStatus = dataLoader.getServerStatus(SERVER_NAME, SERVER_VERSION);
        const status: ServerStatus = {
          ...baseStatus,
          hints: {
            resources: 'Use list_resources tool to discover available workflows and guides',
          },
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
      }

      case 'hise_cli_help': {
        const text = [
          '# hise-cli — live HISE control (runs on the user\'s machine)',
          '',
          'The MCP server is documentation-only. For any **live** action against a running HISE instance, invoke `hise-cli` via the Bash tool on the user\'s shell — this server cannot reach their HISE.',
          '',
          '## Discovering the command tree',
          '',
          'Run these directly in the user\'s shell — never paraphrase or cache the help text, it changes between releases:',
          '',
          '- `hise-cli --help` — top-level command list',
          '- `hise-cli -<mode> --help` — per-mode help (e.g. `hise-cli -hise --help`, `hise-cli -script --help`, `hise-cli -ui --help`, `hise-cli -builder --help`, `hise-cli -dsp --help`)',
          '- `hise-cli --status` — CLI + HISE liveness probe',
          '- `hise-cli --version` — CLI version',
          '',
          '## Modes the agent should reach for',
          '',
          '- **Launch / shutdown / screenshot / profile** → `-hise`',
          '- **Evaluate HiseScript expressions, read/write runtime values** → `-script` (REPL)',
          '- **Add/remove/edit UI components** → `-ui`',
          '- **Module tree (synths, FX chains)** → `-builder`',
          '- **Scriptnode DSP graph** → `-dsp`',
          '- **Lint a HiseScript file (no HISE needed)** → `hise-cli diagnose <file>`',
          '',
          'Other modes exist (`-publish`, `-assets`, `-wizard`, `-api`, `-undo`, etc.) but are user-driven workflows — leave those to the user unless explicitly asked.',
          '',
          '## Workflow contract',
          '',
          '1. Call `hise-cli --help` (or the relevant `-<mode> --help`) every time before issuing commands you have not used recently — flag set may have changed.',
          '2. Default output is markdown / raw text (human-readable). Add `--json` if you need machine-readable JSON for parsing.',
          '3. Multi-step edits: combine into a `-undo plan "<name>"` group, run the steps, then `-undo apply` (or `-undo discard`).',
        ].join('\n');

        return {
          content: [{ type: 'text', text }],
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
          contributionGuides: CONTRIBUTION_GUIDES.map(g => ({
            id: g.id,
            name: g.name,
            description: g.description,
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

        // Check contribution guides
        const contribGuide = CONTRIBUTION_GUIDES.find(g => g.id === id);
        if (contribGuide) {
          return {
            content: [{ type: 'text', text: formatContributionGuideAsMarkdown(contribGuide) }],
          };
        }

        // Not found
        const availableIds = [
          ...WORKFLOWS.map(w => w.id),
          ...STYLE_GUIDES.map(s => s.id),
          ...CONTRIBUTION_GUIDES.map(g => g.id),
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
      // FORUM SEARCH TOOLS
      // ========================================================================

      case 'search_forum': {
        const { term, alsoTerms, maxResults } = args as {
          term: string;
          alsoTerms?: string[];
          maxResults?: number;
        };
        const result = await searchForum(term, alsoTerms || [], {
          maxResults: Math.min(maxResults || 15, 30),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'fetch_forum_topics': {
        const { tids, maxPostsPerTopic } = args as {
          tids: number[];
          maxPostsPerTopic?: number;
        };
        const cappedTids = tids.slice(0, 5);
        const forumResults: ForumTopicDetail[] = [];
        for (const tid of cappedTids) {
          try {
            const topics = await fetchForumTopics([tid], { maxPostsPerTopic });
            forumResults.push(...topics);
          } catch (err) {
            forumResults.push({
              tid,
              title: `Error fetching topic ${tid}`,
              posts: [{ header: 'Error', content: err instanceof Error ? err.message : 'Unknown error' }],
            });
          }
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(forumResults, null, 2) }],
        };
      }

      case 'get_doc_content': {
        const { url, id } = args as { url?: string; id?: string };

        if (!url && !id) {
          return {
            content: [{ type: 'text', text: 'Provide either url or id parameter.' }],
            isError: true,
          };
        }

        if (!isSemanticSearchAvailable()) {
          return {
            content: [{ type: 'text', text: 'Documentation content not available. Ensure doc_chunks.json is in the data/ directory.' }],
            isError: true,
          };
        }

        const result = id
          ? getDocContentById(id)
          : getDocContent(url!);

        if (!result) {
          return {
            content: [{ type: 'text', text: `No documentation found for ${id ? `id "${id}"` : `url "${url}"`}. Use explore_hise or search_hise to find valid URLs.` }],
          };
        }

        const header = result.metadata.class
          ? `# ${result.metadata.class}${result.metadata.method ? '.' + result.metadata.method : ''}`
          : `# ${result.metadata.title || result.metadata.url}`;

        return {
          content: [{ type: 'text', text: `${header}\n${result.metadata.url}\n\n${result.body}` }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    log.error('Tool handler error:', error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  dataLoader = new HISEDataLoader();
  await dataLoader.loadData();

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  log.info('HISE MCP server starting (documentation only)...');
  const app = express();

  // Behind a reverse proxy (Caddy/nginx) - trust X-Forwarded-* so req.ip
  // resolves to the real client, which the rate limiter relies on.
  app.set('trust proxy', 1);

    // MCP requests are tiny JSON-RPC envelopes; cap the body size so a
    // malicious client can't OOM the process.
    app.use(express.json({ limit: '256kb' }));

    interface TransportEntry {
      transport: StreamableHTTPServerTransport;
      lastActivity: number;
    }
    const transports: { [sessionId: string]: TransportEntry } = {};
    const SESSION_IDLE_MS = 60 * 60 * 1000; // 1 hour
    const SESSION_SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

    const sweepInterval = setInterval(() => {
      const now = Date.now();
      for (const sid of Object.keys(transports)) {
        const entry = transports[sid];
        if (!entry) continue;
        if (now - entry.lastActivity > SESSION_IDLE_MS) {
          log.info(`Sweeping idle session ${sid} (idle ${Math.round((now - entry.lastActivity) / 1000)}s)`);
          try {
            entry.transport.close();
          } catch (err) {
            log.error(`Error closing idle transport ${sid}:`, err);
          }
          delete transports[sid];
        }
      }
    }, SESSION_SWEEP_INTERVAL_MS);
    // Don't keep the event loop alive just for the sweeper.
    if (typeof sweepInterval.unref === 'function') sweepInterval.unref();

    // Simple sliding-window rate limiter for /api/* (per-IP, in-memory).
    // 60 req/min/IP is generous for a docs search frontend; tighten via env
    // if abuse appears. The bucket map is cleaned opportunistically.
    const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
    const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '60', 10);
    const rateBuckets = new Map<string, { count: number; resetAt: number }>();
    const rateCleanup = setInterval(() => {
      const now = Date.now();
      for (const [ip, b] of rateBuckets) {
        if (b.resetAt <= now) rateBuckets.delete(ip);
      }
    }, RATE_LIMIT_WINDOW_MS);
    if (typeof rateCleanup.unref === 'function') rateCleanup.unref();

    function rateLimit(req: Request, res: Response, next: NextFunction): void {
      const ip = (req.ip || req.socket.remoteAddress || 'unknown').toString();
      const now = Date.now();
      let bucket = rateBuckets.get(ip);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
        rateBuckets.set(ip, bucket);
      }
      bucket.count++;
      if (bucket.count > RATE_LIMIT_MAX) {
        res.set('Retry-After', Math.ceil((bucket.resetAt - now) / 1000).toString());
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
      next();
    }

    // Host-header allowlist for /mcp — defends against DNS rebinding attacks
    // where an attacker tricks a browser into POSTing to 127.0.0.1 via a
    // rebound hostname. /mcp is open and unauthenticated, so this matters.
    // Default list covers prod + local dev; extend via ALLOWED_MCP_HOSTS
    // (comma-separated) if you front the server with multiple hostnames.
    const allowedMcpHosts = new Set([
      'mcp.hise.dev',
      `localhost:${port}`,
      `127.0.0.1:${port}`,
      ...(process.env.ALLOWED_MCP_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean),
    ]);
    app.use('/mcp', (req: Request, res: Response, next: NextFunction) => {
      const host = req.headers.host;
      if (!host || !allowedMcpHosts.has(host)) {
        log.warn(`Rejected /mcp request with host header: ${host}`);
        res.status(403).json({ error: 'Forbidden host' });
        return;
      }
      next();
    });

    // CORS for the public REST API (success + error responses).
    // Per-handler `res.set('Access-Control-Allow-Origin', '*')` only fired on
    // 200, so 4xx/5xx hit the browser without the header and looked like CORS
    // failures instead of the actual error. /mcp is server-to-server and
    // intentionally has no CORS headers.
    app.use('/api', (_req: Request, res: Response, next) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Referrer-Policy', 'no-referrer');
      next();
    });
    app.use('/api', rateLimit);

    // /health: process is up. /ready: warmup complete and able to serve search.
    // Reverse proxies / orchestrators should route on /ready.
    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', server: 'hise-mcp-server' });
    });
    app.get('/ready', (_req: Request, res: Response) => {
      if (isEmbeddingsReady()) {
        res.json({ status: 'ready' });
      } else {
        res.status(503).json({ status: 'initializing' });
      }
    });

    // REST API endpoints for website search (reuses semantic-search.ts)
    app.get('/api/search', async (req: Request, res: Response) => {
      if (!isEmbeddingsReady()) {
        res.status(503).json({ error: 'Still indexing, try again in a moment' });
        return;
      }
      const q = req.query.q as string | undefined;
      if (!q) {
        res.status(400).json({ error: 'Missing q parameter' });
        return;
      }
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
      const domain = req.query.domain as string | undefined;
      const source = req.query.source as string | undefined;
      try {
        const fetchLimit = domain ? limit * 3 : limit;

        const searchPromises: Promise<any[]>[] = [];
        if (source !== 'tutorials') searchPromises.push(semanticSearch(q, { maxResults: fetchLimit }));
        else searchPromises.push(Promise.resolve([]));
        if (source !== 'docs' && isTutorialsAvailable()) searchPromises.push(searchTutorials(q, { maxResults: fetchLimit }));
        else searchPromises.push(Promise.resolve([]));

        const [docResults, videoResults] = await Promise.all(searchPromises);
        let results = [...docResults, ...videoResults].sort((a: any, b: any) => b.score - a.score);

        const filtered = domain
          ? results.filter((r: any) => r.metadata.domain === domain).slice(0, limit)
          : results.slice(0, limit);
        res.json(filtered.map(r => ({
          id: r.id,
          score: r.score,
          via: r.via,
          metadata: r.metadata
        })));
      } catch (err) {
        log.error('Search error:', err);
        res.status(500).json({ error: 'Search failed' });
      }
    });

    app.get('/api/search/domains', (_req: Request, res: Response) => {
      res.json([
        { id: 'all', label: 'All' },
        { id: 'audio', label: 'Audio' },
        { id: 'ui', label: 'UI' },
        { id: 'scripting', label: 'Scripting' },
        { id: 'scriptnode', label: 'Scriptnode' },
        { id: 'event', label: 'Events' },
        { id: 'guide', label: 'Guides' },
        { id: 'architecture', label: 'Architecture' },
      ]);
    });

    app.get('/api/doc', (req: Request, res: Response) => {
      const url = req.query.url as string | undefined;
      const id = req.query.id as string | undefined;
      if (!url && !id) {
        res.status(400).json({ error: 'Missing url or id parameter' });
        return;
      }
      const result = id ? getDocContentById(id) : getDocContent(url!);
      if (!result) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(result);
    });

    // REST API endpoints for code example search
    app.get('/api/search/examples', async (req: Request, res: Response) => {
      if (!isEmbeddingsReady()) {
        res.status(503).json({ error: 'Still indexing, try again in a moment' });
        return;
      }
      const q = req.query.q as string | undefined;
      if (!q) {
        res.status(400).json({ error: 'Missing q parameter' });
        return;
      }
      if (!isExamplesAvailable()) {
        res.status(503).json({ error: 'Example search index not available' });
        return;
      }
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 200);
      const source = req.query.source as string | undefined;
      const className = req.query.className as string | undefined;
      const featured = req.query.featured === 'true';
      try {
        let results = q === '*'
          ? listAllExamples()
          : await searchExamples(q, { maxResults: (source || className || featured) ? limit * 3 : limit });
        if (source && source !== 'all') {
          results = results.filter(r => r.metadata.source === source);
        }
        if (className) {
          results = results.filter(r => r.metadata.class?.toLowerCase() === className.toLowerCase());
        }
        if (featured) {
          results = results.filter(r => r.metadata.featured);
        }
        results = results.slice(0, limit);
        res.json(results.map(r => ({
          id: r.id,
          score: r.score,
          via: r.via,
          metadata: r.metadata
        })));
      } catch (err) {
        log.error('Example search error:', err);
        res.status(500).json({ error: 'Search failed' });
      }
    });

    app.get('/api/example', (req: Request, res: Response) => {
      const id = req.query.id as string | undefined;
      if (!id) {
        res.status(400).json({ error: 'Missing id parameter' });
        return;
      }
      const result = getExampleById(id);
      if (!result) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(result);
    });

    app.post('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (sessionId) {
        log.debug(`Received MCP request for session: ${sessionId}`);
      }

      // Tracks a transport we created inside this handler so we can tear it
      // down if anything fails before it enters the `transports` map.
      let createdTransport: StreamableHTTPServerTransport | null = null;

      try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId && transports[sessionId]) {
          const entry = transports[sessionId];
          entry.lastActivity = Date.now();
          transport = entry.transport;
        } else if (!sessionId && isInitializeRequest(req.body)) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sid) => {
              log.info(`Session initialized with ID: ${sid}`);
              transports[sid] = { transport, lastActivity: Date.now() };
            },
          });
          createdTransport = transport;

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && transports[sid]) {
              log.info(`Transport closed for session ${sid}`);
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
        log.error('Error handling MCP request:', error);
        // If we created a transport in this handler, make sure it doesn't
        // leak — either because initialize failed before onsessioninitialized
        // fired, or because a later step threw.
        if (createdTransport) {
          const sid = createdTransport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
          }
          try {
            await createdTransport.close();
          } catch (closeErr) {
            log.error('Error closing failed transport:', closeErr);
          }
        }
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
        log.debug(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
      } else {
        log.debug(`Establishing SSE stream for session ${sessionId}`);
      }

      const entry = transports[sessionId];
      entry.lastActivity = Date.now();
      await entry.transport.handleRequest(req, res);
    });

    app.delete('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      log.info(`Session termination request for session ${sessionId}`);

      try {
        const entry = transports[sessionId];
        entry.lastActivity = Date.now();
        await entry.transport.handleRequest(req, res);
      } catch (error) {
        log.error('Error handling session termination:', error);
        if (!res.headersSent) {
          res.status(500).send('Error processing session termination');
        }
      }
    });

    // Warm up embeddings model + indices before accepting traffic so the
    // first search request doesn't block for ~seconds. On failure we log
    // and fall back to lazy-load; endpoints that require embeddings return
    // 503 until `isEmbeddingsReady()` flips.
    const warmupStart = Date.now();
    try {
      await warmupSearch();
      log.info(`[semantic-search] Warmup complete in ${Date.now() - warmupStart}ms`);
    } catch (err) {
      log.error(`[semantic-search] Warmup failed after ${Date.now() - warmupStart}ms, falling back to lazy load:`, err);
    }

    const httpServer = app.listen(port, host, () => {
      log.info(`HISE MCP server running in production mode on ${host}:${port}`);
      log.info(`MCP endpoint: /mcp (open, no auth)`);
    });

    // Slowloris / idle-socket protections.
    httpServer.requestTimeout = 30_000;     // total time to receive a request
    httpServer.headersTimeout = 35_000;     // must exceed requestTimeout
    httpServer.keepAliveTimeout = 65_000;   // a touch above common LB timeouts

    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      log.info(`Received ${signal}, shutting down...`);

      clearInterval(sweepInterval);
      clearInterval(rateCleanup);

      // Stop accepting new connections; existing ones drain naturally.
      httpServer.close((err) => {
        if (err) log.error('Error closing HTTP server:', err);
      });

      // Snapshot session IDs first — closing a transport mutates `transports`
      // via its onclose hook.
      const sids = Object.keys(transports);
      for (const sid of sids) {
        const entry = transports[sid];
        if (!entry) continue;
        try {
          log.info(`Closing transport for session ${sid}`);
          await entry.transport.close();
        } catch (error) {
          log.error(`Error closing transport for session ${sid}:`, error);
        }
        delete transports[sid];
      }

      log.info('Server shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', () => { void shutdown('SIGINT'); });
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

    // Hard timeout — if shutdown hangs for 15s, force exit so the orchestrator
    // doesn't have to SIGKILL us.
    const installForceExit = (signal: string) => {
      process.once(signal as NodeJS.Signals, () => {
        setTimeout(() => {
          log.error(`Shutdown timed out after ${signal}, forcing exit`);
          process.exit(1);
        }, 15_000).unref();
      });
    };
    installForceExit('SIGINT');
    installForceExit('SIGTERM');
}

main().catch((error) => {
  log.error('Fatal error:', error);
  process.exit(1);
});
