/**
 * HISE MCP Server - Workflow Definitions
 * 
 * Workflows provide guidance for AI agents on how to perform common tasks.
 * These are exposed as MCP Resources at hise://workflows/*
 */

import { Workflow } from './types.js';

export const WORKFLOWS: Workflow[] = [
  {
    id: 'fix-errors',
    name: 'Iterative Error Fixing',
    description: 'Fix HISE script compile errors one at a time',
    steps: [
      '1. Call hise_runtime_recompile to get current error',
      '2. If success=true, done - no errors remain',
      '3. Analyze errors[0].codeContext for the problematic code',
      '4. Check errors[0].suggestions - if present, apply the suggested fix directly',
      '5. If error is "Function / constant not found", use search_hise or query_scripting_api to find the correct API',
      '6. Call hise_runtime_fix_script_line with the line number and corrected content',
      '7. If response has errors, repeat from step 3',
    ],
    tools: ['hise_runtime_recompile', 'hise_runtime_fix_script_line', 'search_hise', 'query_scripting_api'],
    tips: [
      'The compiler stops at the first syntax error - fix iteratively',
      'If suggestions[] is populated, it contains pattern-matched fix recommendations',
      'For "Unknown function" errors, search_hise can find similar API methods',
      'Use fix_script_line for single-line fixes (most compile errors)',
      'Use patch_script for multi-line changes (refactoring, adding/removing blocks)',
      'Line numbers in errors are 1-based',
    ],
  },
  {
    id: 'ui-layout',
    name: 'UI Component Layout',
    description: 'Position and align UI components efficiently',
    steps: [
      '1. Call hise_runtime_list_components to see all components',
      '2. Call hise_runtime_get_selected_components if user selected components in HISE',
      '3. Plan the layout changes (positions, sizes, alignment)',
      '4. Call hise_runtime_set_component_properties with batch changes',
      '5. If recompileRequired=true in response, call hise_runtime_recompile',
      '6. Optionally call hise_runtime_screenshot to verify the result',
    ],
    tools: [
      'hise_runtime_list_components',
      'hise_runtime_get_selected_components',
      'hise_runtime_get_component_properties',
      'hise_runtime_set_component_properties',
      'hise_runtime_recompile',
      'hise_runtime_screenshot',
    ],
    tips: [
      'Use get_selected_components for user-driven workflows',
      'Batch multiple component changes in one set_component_properties call',
      'Properties like x, y, width, height control position and size',
      'Use compact=true (default) when reading properties to reduce tokens',
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
