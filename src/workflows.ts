/**
 * HISE MCP Server - Workflow Definitions
 *
 * Workflows provide guidance for AI agents on how to perform common tasks.
 * These are exposed as MCP Resources at hise://workflows/*
 *
 * Live HISE control runs through the standalone `hise-cli` (on PATH). The MCP
 * server is documentation-only — workflows here describe the cli commands the
 * agent should run, plus which MCP tools to consult for docs/search.
 */

import { Workflow } from './types.js';

export const WORKFLOWS: Workflow[] = [
  {
    id: 'fix-errors',
    name: 'Iterative Error Fixing',
    description: 'Fix HISE script compile errors one at a time using hise-cli',
    steps: [
      '1. Run `hise-cli -wizard run recompile` to recompile and surface the current error',
      '2. If recompile succeeds, done — no errors remain',
      '3. Read the reported file:line — for inline callbacks, fetch the script via `hise-cli -script "..."` or read the external .js on disk',
      '4. If the error mentions an unknown function/identifier, use the MCP tools `search_hise` or `query_scripting_api` to find the correct API',
      '5. Edit the source: external .js with the file Edit tool; inline callbacks via `hise-cli -script "..."` or by editing the script file the cli points at',
      '6. Run `hise-cli -wizard run recompile` again; repeat from step 3 until clean',
    ],
    tools: ['search_hise', 'query_scripting_api', 'get_doc_content'],
    tips: [
      'The compiler stops at the first syntax error — fix iteratively',
      'For "Unknown function" errors, `search_hise` (MCP) often suggests the right API name',
      'Use `hise-cli diagnose <file.hsc>` to lint a script file before recompiling',
      'For batches, edit several files first, then run a single recompile',
    ],
  },
  {
    id: 'ui-layout',
    name: 'UI Component Layout',
    description: 'Position and align UI components via hise-cli',
    steps: [
      '1. Run `hise-cli -ui` (or `hise-cli -ui show <id>`) to inspect existing components and their properties',
      '2. Plan the layout changes (positions, sizes, alignment)',
      '3. Apply changes with `hise-cli -ui set <target>.<prop> <value>` (chain multiple via comma-separated commands)',
      '4. If a recompile is required, run `hise-cli -wizard run recompile`',
      '5. Optionally `hise-cli -hise screenshot to <path>` to verify the result',
    ],
    tools: [
      'list_ui_components',
      'query_ui',
      'get_laf_functions_for_components',
    ],
    tips: [
      'Use the MCP `query_ui` tool to look up the exact property name and value range before writing a `-ui set`',
      'Comma-chain `-ui` commands to batch edits in one cli round-trip',
      'For LAF/styling work, pass the component type (from `-ui show`) to MCP `get_laf_functions_for_components`',
    ],
  },
];

/**
 * Format a workflow as Markdown for human/agent readability
 */
export function formatWorkflowAsMarkdown(workflow: Workflow): string {
  let md = `# ${workflow.name}\n\n`;
  md += `${workflow.description}\n\n`;
  md += `## Steps\n\n`;
  md += workflow.steps.join('\n') + '\n\n';
  md += `## Tools Used\n\n`;
  md += workflow.tools.map(t => `- \`${t}\``).join('\n') + '\n\n';
  if (workflow.tips?.length) {
    md += `## Tips\n\n`;
    md += workflow.tips.map(t => `- ${t}`).join('\n') + '\n';
  }
  return md;
}
