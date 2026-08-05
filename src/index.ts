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

function formatClassExamplesInLlmRef(llmRef: string): string {
  return llmRef.replace(
    /(^|\n)(Example:\n)(?!```javascript\n)([\s\S]*?)(\n\nMethods \(\d+\):)/g,
    (_match, prefix: string, heading: string, code: string, methods: string) => {
      const normalizedCode = code
        .split('\n')
        .map(line => line.startsWith('  ') ? line.slice(2) : line)
        .join('\n')
        .trimEnd();

      return `${prefix}${heading}\`\`\`javascript\n${normalizedCode}\n\`\`\`${methods}`;
    }
  );
}

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
    name: 'query_ui',
    description: `Query a HISE UI component reference. Pass "Component" (e.g., "ScriptSlider") for the full component reference, or "Component.property" (e.g., "ScriptSlider.mode") to filter to one property and save tokens.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '"Component" for full docs or "Component.property" for one property (e.g., "ScriptSlider.mode")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_module',
    description: `Query a HISE module reference. Pass "Module" (e.g., "AHDSR") for the full module reference, or "Module.Parameter" (e.g., "AHDSR.Attack") to filter to one parameter and save tokens.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '"Module" for full docs or "Module.Parameter" for one parameter (e.g., "AHDSR.Attack")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'query_scriptnode',
    description: `Query a Scriptnode reference. Pass "factory.node" (e.g., "filters.svf") for the full node reference, or "factory.node.Parameter" (e.g., "filters.svf.Frequency") to filter to one parameter and save tokens. Use list_scriptnode_nodes for factory browsing.`,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '"factory.node" for full docs or "factory.node.Parameter" for one parameter (e.g., "filters.svf.Frequency")',
        },
      },
      required: ['query'],
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
  {
    name: 'list_scriptnode_nodes',
    description: 'List documented Scriptnode nodes grouped by factory, optionally filtered by factory name (e.g., "analyse", "filters").',
    inputSchema: {
      type: 'object',
      properties: {
        factory: {
          type: 'string',
          description: 'Optional factory/category filter (e.g., "analyse")',
        },
      },
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

interface ToolCallResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

async function handleToolCall(name: string, args: unknown): Promise<ToolCallResult> {
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
      case 'query_ui': {
        const { query: componentProperty } = args as { query: string };

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
              text: `No UI component or property found for "${componentProperty}". Did you mean:\n${suggestions.map(s => `  - ${s}`).join('\n')}\n\nTip: Use search_hise to find UI references by keyword.`
              }],
            };
          }
          return {
            content: [{ type: 'text', text: `No UI component or property found for "${componentProperty}". Use list_ui_components to see available components, or search_hise to search by keyword.` }],
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
              // Enriched class: serve llmRef with Markdown-friendly examples.
              return {
                content: [{ type: 'text', text: formatClassExamplesInLlmRef(classData.llmRef) }],
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
              lines.push('```javascript');
              lines.push(ex.code);
              lines.push('```');
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
              lines.push('```javascript');
              lines.push(ex.code);
              lines.push('```');
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

      case 'query_module': {
        const { query: moduleParameter } = args as { query: string };

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
              text: `No module or parameter found for "${moduleParameter}". Did you mean:\n${suggestions.map(s => `  - ${s}`).join('\n')}\n\nTip: Use search_hise to find module references by keyword.`
              }],
            };
          }
          return {
            content: [{ type: 'text', text: `No module or parameter found for "${moduleParameter}". Use list_module_types to see available modules, or search_hise to search by keyword.` }],
          };
        }

        return {
          content: [{ type: 'text', text: JSON.stringify(enriched, null, 2) }],
        };
      }

      case 'query_scriptnode': {
        const { query } = args as { query: string };
        const result = dataLoader.queryScriptnodeReference(query);

        if (!result) {
          const suggestions = await dataLoader.findSimilar(query, 3, 'scriptnode');
          if (suggestions.length > 0) {
            return {
              content: [{
                type: 'text',
                text: `No Scriptnode node or parameter found for "${query}". Did you mean:\n${suggestions.map(s => `  - ${s}`).join('\n')}\n\nTip: Use list_scriptnode_nodes or search_hise with domain "scriptnode" to find nodes.`
              }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: `No Scriptnode node or parameter found for "${query}". Use list_scriptnode_nodes to see available nodes, or search_hise with domain "scriptnode" to search by keyword.` }],
            isError: true,
          };
        }

        if (result.kind === 'factory') {
          return {
            content: [{ type: 'text', text: `"${result.factory}" is a Scriptnode factory, not a node reference. Use list_scriptnode_nodes with { "factory": "${result.factory}" } to browse nodes in this factory.` }],
            isError: true,
          };
        }

        if (result.kind === 'missingParameter') {
          return {
            content: [{ type: 'text', text: `No parameter "${result.parameterName}" found for Scriptnode node "${result.node.factoryPath}". Available parameters: ${result.availableParameters.join(', ') || 'none'}.` }],
            isError: true,
          };
        }

        if (result.kind === 'parameter') {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                node: result.node.factoryPath,
                title: result.node.title,
                parameterName: result.parameterName,
                parameter: result.parameter,
              }, null, 2)
            }],
          };
        }

        return {
          content: [{ type: 'text', text: result.node.llmRef || JSON.stringify(result.node, null, 2) }],
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
              hint: 'Use query_ui with "ComponentName" for full docs or "ComponentName.propertyName" for one property, or search_hise to search by keyword.'
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
              hint: 'Use query_module with "ModuleName" for full docs or "ModuleName.parameterId" for one parameter, or search_hise to search by keyword.'
            }, null, 2)
          }],
        };
      }

      case 'list_scriptnode_nodes': {
        const { factory } = args as { factory?: string };
        const result = dataLoader.listScriptnodeNodes(factory);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ...result,
              hint: 'Use query_scriptnode with "factory.node" (e.g., "analyse.fft") for full node details.'
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
          '# hise-cli',
          '',
          'This MCP server is documentation-only. For current hise-cli command syntax, call the installed CLI directly.',
          '',
          '## Check Availability',
          '',
          'Check whether hise-cli is available:',
          '',
          '```bash',
          'hise-cli --version',
          '```',
          '',
          'If that does not work, install it from:',
          '',
          'GitHub: https://github.com/christophhart/hise-cli',
          '',
          'macOS:',
          '',
          '```bash',
          'curl -fsSL -o /tmp/hise-cli.pkg https://github.com/christophhart/hise-cli/releases/latest/download/hise-cli.pkg \\',
          '  && sudo installer -pkg /tmp/hise-cli.pkg -target /',
          '```',
          '',
          'Windows PowerShell:',
          '',
          '```powershell',
          'irm https://github.com/christophhart/hise-cli/releases/latest/download/hise-cli-setup.exe -OutFile $env:TEMP\\hise-cli-setup.exe',
          '& $env:TEMP\\hise-cli-setup.exe /VERYSILENT /NORESTART',
          '```',
          '',
          'npm:',
          '',
          '```bash',
          'npm i -g @hise/cli',
          'hise-cli',
          '```',
          '',
          'Or run without installing: `npx @hise/cli`.',
          '',
          '## Command Discovery',
          '',
          'For the current command surface:',
          '',
          '```bash',
          'hise-cli agent-context --agent',
          '```',
          '',
          'For a specific mode:',
          '',
          '```bash',
          'hise-cli agent-context builder --agent',
          'hise-cli agent-context ui --agent',
          'hise-cli agent-context dsp --agent',
          'hise-cli agent-context script --agent',
          '```',
          '',
          'For intent-based lookup:',
          '',
          '```bash',
          'hise-cli which "add a module" --agent',
          'hise-cli which "edit a slider property" --agent',
          '```',
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
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleToolCall(name, args);
});

const DOC_TOOL_NAMES = new Set(DOC_TOOLS.map(tool => tool.name));

function getMissingRequiredArgs(tool: Tool, args: unknown): string[] {
  const schema = tool.inputSchema as { required?: string[] } | undefined;
  const required = schema?.required || [];
  if (required.length === 0) return [];
  if (!args || typeof args !== 'object' || Array.isArray(args)) return required;

  const argRecord = args as Record<string, unknown>;
  return required.filter(key => argRecord[key] === undefined || argRecord[key] === null);
}

function getRestStatusForToolResult(result: ToolCallResult): number {
  if (!result.isError) return 200;

  const text = result.content.map(item => item.text).join('\n');
  if (/unknown tool/i.test(text)) return 404;
  if (/not available|still indexing|ensure .* in the data\/ directory|run .* pipeline/i.test(text)) return 503;
  if (/not a node reference/i.test(text)) return 400;
  if (/not found|no .* found|resource not found/i.test(text)) return 404;
  if (/required|provide|missing|invalid/i.test(text)) return 400;

  return 500;
}

function sendRestToolResult(res: Response, toolName: string, result: ToolCallResult): void {
  const status = getRestStatusForToolResult(result);
  res.status(status).json({
    tool: toolName,
    ok: status >= 200 && status < 300 && !result.isError,
    isError: result.isError || false,
    content: result.content,
  });
}

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

    interface TransportEntry {
      transport: StreamableHTTPServerTransport;
      lastActivity: number;
    }
    const transports: { [sessionId: string]: TransportEntry } = {};
    const SESSION_IDLE_MS = 60 * 60 * 1000; // 1 hour
    const SESSION_SWEEP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
    // /mcp is open and unauthenticated, so cap concurrent sessions — a flood
    // of `initialize` requests would otherwise grow `transports` without bound.
    const MAX_SESSIONS = parseInt(process.env.MAX_MCP_SESSIONS || '500', 10);

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

    // Fixed-window per-IP rate limiter, dependency-free. One bucket map per
    // limiter; entries are swept on the window interval. `req.ip` honors the
    // trust-proxy setting above. Single-process only — if this ever runs
    // multi-instance, move the buckets to a shared store. Sets standard
    // RateLimit-* headers; on /mcp the 429 body is JSON-RPC shaped so MCP
    // clients parse it cleanly.
    function createRateLimiter(opts: { name: string; windowMs: number; max: number }) {
      const buckets = new Map<string, { count: number; resetAt: number }>();
      const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      }, opts.windowMs);
      if (typeof cleanup.unref === 'function') cleanup.unref();

      return function rateLimit(req: Request, res: Response, next: NextFunction): void {
        const key = (req.ip || req.socket.remoteAddress || 'unknown').toString();
        const now = Date.now();
        let bucket = buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
          bucket = { count: 0, resetAt: now + opts.windowMs };
          buckets.set(key, bucket);
        }
        bucket.count++;
        const resetSecs = Math.ceil((bucket.resetAt - now) / 1000);
        res.set('RateLimit-Limit', String(opts.max));
        res.set('RateLimit-Remaining', String(Math.max(0, opts.max - bucket.count)));
        res.set('RateLimit-Reset', String(resetSecs));
        if (bucket.count > opts.max) {
          res.set('Retry-After', String(resetSecs));
          log.warn(`[ratelimit:${opts.name}] ${key} exceeded ${opts.max} req / ${Math.round(opts.windowMs / 1000)}s`);
          if (req.path === '/mcp' || req.baseUrl === '/mcp') {
            res.status(429).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Too many requests' }, id: null });
          } else {
            res.status(429).json({ error: 'Too many requests' });
          }
          return;
        }
        next();
      };
    }

    // /api/* — a docs-search frontend; 60 req/min/IP is generous.
    const apiRateLimit = createRateLimiter({
      name: 'api',
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10),
    });
    // /mcp — an active agent session is bursty (many tool calls), so the
    // ceiling is higher. Still bounds a flood from any single IP, complementing
    // the concurrent-session cap.
    const mcpRateLimit = createRateLimiter({
      name: 'mcp',
      windowMs: parseInt(process.env.MCP_RATE_LIMIT_WINDOW_MS || '60000', 10),
      max: parseInt(process.env.MCP_RATE_LIMIT_MAX || '300', 10),
    });

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
    app.use('/mcp', mcpRateLimit);

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
    app.use('/api', apiRateLimit);

    // Body parsing comes after the cheap guards (host allowlist, rate limits)
    // so a flood is rejected before we spend CPU parsing JSON. MCP requests are
    // tiny JSON-RPC envelopes; cap the body size so a malicious client can't
    // OOM the process. /health and /ready take no body — harmless to include.
    app.use(express.json({ limit: '256kb' }));

    app.get('/api/openapi.yaml', (_req: Request, res: Response) => {
      try {
        const spec = readFileSync(join(__dirname, '..', 'openapi.yaml'), 'utf8');
        res.type('application/yaml').send(spec);
      } catch (error) {
        log.error('Failed to read OpenAPI spec:', error);
        res.status(500).json({ error: 'OpenAPI spec not available' });
      }
    });

    app.get('/api/tools', (_req: Request, res: Response) => {
      res.json({
        count: DOC_TOOLS.length,
        tools: DOC_TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });
    });

    app.post('/api/tools/:name', async (req: Request, res: Response) => {
      const toolName = req.params.name;
      if (!DOC_TOOL_NAMES.has(toolName)) {
        res.status(404).json({
          tool: toolName,
          ok: false,
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        });
        return;
      }

      const args = req.body === undefined ? {} : req.body;
      if (!args || typeof args !== 'object' || Array.isArray(args)) {
        res.status(400).json({
          tool: toolName,
          ok: false,
          isError: true,
          content: [{ type: 'text', text: 'Tool arguments must be a JSON object.' }],
        });
        return;
      }

      const tool = DOC_TOOLS.find(item => item.name === toolName)!;
      const missingArgs = getMissingRequiredArgs(tool, args);
      if (missingArgs.length > 0) {
        res.status(400).json({
          tool: toolName,
          ok: false,
          isError: true,
          content: [{ type: 'text', text: `Missing required argument${missingArgs.length === 1 ? '' : 's'}: ${missingArgs.join(', ')}` }],
        });
        return;
      }

      const result = await handleToolCall(toolName, args);
      sendRestToolResult(res, toolName, result);
    });

    // /health: process is up. /ready: warmup complete and able to serve search.
    // Reverse proxies / orchestrators should route on /ready.
    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', server: 'hise-mcp-server' });
    });
    app.get('/ready', (_req: Request, res: Response) => {
      if (isEmbeddingsReady()) {
        res.json({ status: 'ready' });
      } else {
        // Kick (or re-kick) warmup so a failed startup attempt self-heals
        // instead of leaving the server stuck at 503. warmupSearch() is
        // memoized, so concurrent probes share one attempt.
        warmupSearch().catch(() => {});
        res.status(503).json({ status: 'initializing' });
      }
    });

    // REST API endpoints for website search (reuses semantic-search.ts)
    app.get('/api/search', async (req: Request, res: Response) => {
      if (!isEmbeddingsReady()) {
        warmupSearch().catch(() => {});
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
        warmupSearch().catch(() => {});
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
          if (Object.keys(transports).length >= MAX_SESSIONS) {
            log.warn(`Refusing new MCP session: at capacity (${MAX_SESSIONS})`);
            res.status(503).json({
              jsonrpc: '2.0',
              error: { code: -32000, message: 'Server at session capacity, retry later' },
              id: null,
            });
            return;
          }
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

    // Final error net. Mostly catches malformed-JSON / oversized-body errors
    // from express.json so clients get a clean 400 instead of an HTML stack
    // page, and an unexpected throw in a handler returns JSON, not HTML.
    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const status = typeof err?.status === 'number' ? err.status : 500;
      if (status >= 500) log.error('Unhandled request error:', err);
      if (res.headersSent) return;
      const onMcp = req.path === '/mcp';
      res.status(status).json(
        onMcp
          ? { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }
          : { error: status === 400 ? 'Bad request' : 'Internal server error' }
      );
    });

    // Warm up embeddings model + indices before accepting traffic so the
    // first search request doesn't block for ~seconds. On failure we log and
    // continue: search endpoints return 503 until `isEmbeddingsReady()` flips,
    // and they (plus /ready and any MCP search tool) re-kick warmupSearch() on
    // demand, so a transient failure self-heals without a restart.
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
      // Rate-limiter cleanup intervals are .unref()'d, so they don't block exit.

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
