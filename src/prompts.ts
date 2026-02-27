/**
 * HISE MCP Server - Prompt Definitions
 * 
 * MCP Prompts are user-controlled templates invoked via slash commands.
 * These prompts embed style guides directly to ensure correct code generation.
 */

import { getHiseClient } from './hise-client.js';
import { HISEDataLoader } from './data-loader.js';
import { STYLE_GUIDES } from './style-guides.js';
import { CONTRIBUTION_GUIDES } from './contribution-guides.js';

// ============================================================================
// Types matching MCP Prompts spec
// ============================================================================

export interface PromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface HisePrompt {
  name: string;
  title: string;
  description: string;
  arguments?: PromptArgument[];
}

/**
 * GetPromptResult matching SDK's GetPromptResultSchema
 * Using index signature for SDK compatibility
 */
export interface GetPromptResult {
  [key: string]: unknown;
  description?: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: {
      type: 'text';
      text: string;
    };
  }>;
}

// ============================================================================
// Prompt Definitions
// ============================================================================

/**
 * Prompts that require HISE runtime connection (local mode only).
 * Used by index.ts to filter prompts in production mode.
 */
export const RUNTIME_PROMPT_NAMES = new Set(['style_selected_component']);

export const PROMPTS: HisePrompt[] = [
  {
    name: 'style_selected_component',
    title: 'Style Selected Component',
    description: 'Create custom styling (LAF or paint routines) for components selected in HISE Interface Designer',
    arguments: [
      {
        name: 'description',
        description: 'Optional styling request (e.g., "modern flat design", "vintage knob look")',
        required: false,
      },
    ],
  },
  {
    name: 'contribute',
    title: 'Contribute to HISE',
    description: 'Guided workflow for assessing, fixing, and submitting a HISE C++ bugfix or improvement as a pull request',
    arguments: [
      {
        name: 'ref',
        description: 'GitHub issue URL/number, PR URL/number, or description of the bug/improvement',
        required: false,
      },
    ],
  },

];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get style guide content by ID
 */
function getStyleGuideContent(id: string): string {
  const guide = STYLE_GUIDES.find(g => g.id === id);
  return guide?.content || '';
}

/**
 * Create an error prompt result
 */
function createErrorPrompt(title: string, message: string): GetPromptResult {
  return {
    description: `Error: ${title}`,
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `# ${title}\n\n${message}`
      }
    }]
  };
}

// ============================================================================
// Main Prompt Generator
// ============================================================================

/**
 * Generate the style_selected_component prompt
 * 
 * This queries HISE for selected components and generates a tailored prompt
 * with embedded style guides for creating LAF functions or paint routines.
 */
export async function generateStyleSelectedComponentPrompt(
  args: Record<string, string> | undefined,
  dataLoader: HISEDataLoader
): Promise<GetPromptResult> {
  const hiseClient = getHiseClient();
  const description = args?.description || '';

  // 1. Check HISE connection
  let available = false;
  try {
    available = await hiseClient.isAvailable();
  } catch {
    available = false;
  }

  if (!available) {
    return createErrorPrompt(
      'HISE Not Connected',
      `The HISE runtime is not available. Please ensure:

1. HISE is running
2. The REST API is enabled (default port 1900)
3. You have a project open

Then try this prompt again.`
    );
  }

  // 2. Get selected components
  let selection;
  try {
    selection = await hiseClient.getSelectedComponents();
  } catch (err) {
    return createErrorPrompt(
      'Failed to Get Selection',
      `Could not retrieve selected components from HISE: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  if (!selection.success || !selection.components || selection.components.length === 0) {
    return createErrorPrompt(
      'No Components Selected',
      `Please select one or more components in HISE's Interface Designer, then invoke this prompt again.

**Tips:**
- Click a component in the Interface Designer to select it
- Shift+Click or Ctrl+Click to select multiple components
- For ScriptPanels: Creates paint routines using the factory pattern
- For other components: Creates LookAndFeel functions`
    );
  }

  // 3. Separate panels from LAF components
  const panels = selection.components.filter(c => c.type === 'ScriptPanel');
  const lafComponents = selection.components.filter(c => c.type !== 'ScriptPanel');

  // 4. Error if mixed types (Panel + non-Panel)
  if (panels.length > 0 && lafComponents.length > 0) {
    const panelIds = panels.map(p => p.id).join(', ');
    const lafIds = lafComponents.map(c => `${c.id} (${c.type})`).join(', ');

    return createErrorPrompt(
      'Mixed Component Types Selected',
      `You have selected both ScriptPanels and other component types:

- **ScriptPanels:** ${panelIds}
- **Other components:** ${lafIds}

**Why this matters:**
- ScriptPanels use \`setPaintRoutine()\` - you write the entire drawing code
- Other components use LookAndFeel (LAF) functions - you override specific drawing callbacks

Please select only one type:
- Select only ScriptPanels to create custom paint routines
- Select only other components (buttons, sliders, etc.) to create LAF functions`
    );
  }

  // 5. Get current onInit code to check for existing routines
  let existingCode = '';
  try {
    const currentScript = await hiseClient.getScript(selection.moduleId || 'Interface', 'onInit');
    existingCode = currentScript.callbacks?.onInit || '';
  } catch {
    // Ignore - we'll proceed without existing code context
  }

  // 6. Build the appropriate prompt
  if (panels.length > 0) {
    return generatePanelPrompt(panels, description, existingCode, dataLoader);
  } else {
    return generateLAFPrompt(lafComponents, description, existingCode, dataLoader);
  }
}

// ============================================================================
// Panel Prompt Generator
// ============================================================================

/**
 * Generate prompt for ScriptPanel styling using factory pattern
 */
async function generatePanelPrompt(
  panels: { id: string; type: string }[],
  description: string,
  existingCode: string,
  _dataLoader: HISEDataLoader
): Promise<GetPromptResult> {
  const panelIds = panels.map(p => p.id);
  const panelList = panelIds.map(id => `- ${id}`).join('\n');

  // Suggest a namespace name based on description or first panel
  const suggestedName = description
    ? description.split(' ')[0].replace(/[^a-zA-Z]/g, '') || 'CustomPanel'
    : panelIds[0].replace(/[0-9]/g, '') || 'CustomPanel';

  const graphicsGuide = getStyleGuideContent('graphics-api-style');
  const panelGuide = getStyleGuideContent('scriptpanel-style');
  const hisescriptGuide = getStyleGuideContent('hisescript-style');

  // Truncate existing code if too long (keep first 2000 chars for context)
  const codePreview = existingCode.length > 2000
    ? existingCode.substring(0, 2000) + '\n// ... (truncated)'
    : existingCode;

  const promptText = `# Create ScriptPanel Paint Routine${panels.length > 1 ? 's' : ''}

## Selected Panels
${panelList}

## Styling Request
${description || 'Create a clean, professional visual style.'}

---

# STEP 1: Read Existing Code

First, examine the current onInit code to understand the existing structure:

\`\`\`javascript
${codePreview || '// No existing code found'}
\`\`\`

Look for:
- Existing paint routines for these panels
- Namespaces or factory patterns already in use
- Colour variables or theme definitions

---

# STEP 2: Understand the Requirements

${panels.length > 1 ? `
**Multiple Panels Selected:** Create a single factory pattern namespace that can be applied to all panels.

If styling ALL panels the same way:
\`\`\`javascript
namespace ${suggestedName}
{
    inline function make(panelId)
    {
        local p = Content.getComponent(panelId);
        
        p.data.value = 0.0;
        
        p.setPaintRoutine(function(g)
        {
            // Same drawing code for all panels
        });
        
        return p;
    }
}

// Apply to all panels
${panelIds.map(id => `${suggestedName}.make("${id}");`).join('\n')}
\`\`\`

If styling panels DIFFERENTLY based on the request, add parameters or use panel-specific logic.
` : `
**Single Panel Selected:** Create a namespace with factory pattern for clean encapsulation.

\`\`\`javascript
namespace ${suggestedName}
{
    inline function make(panelId)
    {
        local p = Content.getComponent(panelId);
        
        p.data.value = 0.0;
        
        p.setPaintRoutine(function(g)
        {
            // Drawing code here
        });
        
        return p;
    }
}

${suggestedName}.make("${panelIds[0]}");
\`\`\`
`}

Determine the approach based on the user's styling request.

---

# CRITICAL: Style Guide References

Read these carefully before writing any code.

## HiseScript Syntax (Language Basics)
${hisescriptGuide}

## Graphics API (Drawing Methods)
${graphicsGuide}

## ScriptPanel Patterns (Panel Setup)
${panelGuide}

---

# STEP 3: Implementation Workflow

1. **Plan your design** based on the styling request
2. **Write the code** using the factory pattern shown above
3. **Compile and test** using \`hise_runtime_set_script\` with the onInit callback
4. **Iterate** on any errors using the style guides as reference

**Important:** 
- Use \`hise_runtime_set_script\` to compile new code - do NOT just present code to the user
- If there are errors, use \`hise_runtime_edit_script\` to fix them (find the broken code string, replace with fixed version)
- For multiple edits, use \`compile: false\` on all but the last edit to avoid repeated compilation

Begin by analyzing the existing code structure and planning your approach.`;

  return {
    description: `Create paint routine for ScriptPanel${panels.length > 1 ? 's' : ''}: ${panelIds.join(', ')}`,
    messages: [{
      role: 'user',
      content: { type: 'text', text: promptText }
    }]
  };
}

// ============================================================================
// LAF Prompt Generator
// ============================================================================

/**
 * Generate prompt for LookAndFeel styling
 */
async function generateLAFPrompt(
  components: { id: string; type: string }[],
  description: string,
  existingCode: string,
  dataLoader: HISEDataLoader
): Promise<GetPromptResult> {
  // Get unique component types
  const uniqueTypes = [...new Set(components.map(c => c.type))];

  // Get LAF functions for these types
  const lafFunctions = await dataLoader.getLAFFunctionsForTypes(uniqueTypes);

  // Build component list with types
  const componentList = components
    .map(c => `- ${c.id} (${c.type})`)
    .join('\n');

  // Get LAF function details for the prompt
  const lafDetails: string[] = [];
  for (const func of lafFunctions) {
    const detail = await dataLoader.queryLAFFunction(func);
    if (detail) {
      // Extract property names from the properties Record
      const propNames = detail.properties ? Object.keys(detail.properties).join(', ') : 'See documentation';
      lafDetails.push(`### ${func}\n${detail.description || 'No description available'}\n\n**obj properties:** ${propNames}`);
    }
  }

  const graphicsGuide = getStyleGuideContent('graphics-api-style');
  const lafGuide = getStyleGuideContent('laf-functions-style');
  const hisescriptGuide = getStyleGuideContent('hisescript-style');

  // Truncate existing code if too long
  const codePreview = existingCode.length > 2000
    ? existingCode.substring(0, 2000) + '\n// ... (truncated)'
    : existingCode;

  const promptText = `# Create LookAndFeel for Components

## Selected Components
${componentList}

## Styling Request
${description || 'Create a clean, professional visual style.'}

---

# STEP 1: Read Existing Code

First, examine the current onInit code to understand the existing structure:

\`\`\`javascript
${codePreview || '// No existing code found'}
\`\`\`

Look for:
- Existing LookAndFeel objects (\`Content.createLocalLookAndFeel()\`)
- How components are currently styled
- Colour variables or theme definitions

---

# STEP 2: Available LAF Functions

For the selected component types, these LAF functions can be overridden:

${lafDetails.length > 0 ? lafDetails.join('\n\n') : `Functions available: ${lafFunctions.join(', ') || 'None found'}`}

---

# STEP 3: Implementation Pattern

${components.length > 1 ? `
**Multiple Components Selected:**

If styling ALL components the same way:
\`\`\`javascript
const var laf = Content.createLocalLookAndFeel();

laf.registerFunction("${lafFunctions[0] || 'drawToggleButton'}", function(g, obj)
{
    // Same style applies to all components
});

${components.map(c => `Content.getComponent("${c.id}").setLocalLookAndFeel(laf);`).join('\n')}
\`\`\`

If styling components DIFFERENTLY, use \`obj.id\` to branch:
\`\`\`javascript
const var laf = Content.createLocalLookAndFeel();

laf.registerFunction("${lafFunctions[0] || 'drawToggleButton'}", function(g, obj)
{
    if (obj.id == "${components[0].id}")
    {
        // Style for ${components[0].id}
    }
    else if (obj.id == "${components[1]?.id || 'Other'}")
    {
        // Style for ${components[1]?.id || 'other components'}
    }
});

${components.map(c => `Content.getComponent("${c.id}").setLocalLookAndFeel(laf);`).join('\n')}
\`\`\`

Determine which approach based on the user's styling request.
` : `
**Single Component Selected:**

\`\`\`javascript
const var laf = Content.createLocalLookAndFeel();

laf.registerFunction("${lafFunctions[0] || 'drawToggleButton'}", function(g, obj)
{
    // Drawing code here
});

Content.getComponent("${components[0].id}").setLocalLookAndFeel(laf);
\`\`\`
`}

---

# CRITICAL: Style Guide References

Read these carefully before writing any code.

## HiseScript Syntax (Language Basics)
${hisescriptGuide}

## Graphics API (Drawing Methods)
${graphicsGuide}

## LAF Functions Reference
${lafGuide}

---

# STEP 4: Implementation Workflow

1. **Plan your design** based on the styling request
2. **Write the LAF code** using the pattern shown above
3. **Compile and test** using \`hise_runtime_set_script\` with the onInit callback
4. **Iterate** on any errors using the style guides as reference

**Important:**
- Use \`hise_runtime_set_script\` to compile new code - do NOT just present code to the user
- If there are errors, use \`hise_runtime_edit_script\` to fix them (find the broken code string, replace with fixed version)
- For multiple edits, use \`compile: false\` on all but the last edit to avoid repeated compilation

Begin by analyzing the existing code structure and planning your approach.`;

  return {
    description: `Create LAF for: ${components.map(c => c.id).join(', ')}`,
    messages: [{
      role: 'user',
      content: { type: 'text', text: promptText }
    }]
  };
}

// ============================================================================
// Contribution Workflow Prompts
// ============================================================================

/**
 * Get contribution guide content by ID
 */
function getContributionGuideContent(id: string): string {
  const guide = CONTRIBUTION_GUIDES.find(g => g.id === id);
  return guide?.content || '';
}

/**
 * Generate the contribute prompt
 *
 * Guides a contributor through: prerequisites -> assess -> fix -> submit PR
 * Adapts behavior based on whether an issue URL is provided and
 * whether the current user is the repo maintainer.
 */
export function generateContributePrompt(
  args: Record<string, string> | undefined,
  version: string,
): GetPromptResult {
  const ref = args?.ref || '';
  const isPR = /\/pull\/\d|\/pulls\/\d/.test(ref);
  const isIssue = !isPR && (ref.includes('/issues/') || /^\d+$/.test(ref) || ref.startsWith('#'));
  const hasRef = isPR || isIssue;

  const promptText = `**HISE MCP Server v${version}** — Starting contribution workflow.

# HISE Contribution Workflow

You are guiding a contributor through fixing a bug or adding an improvement to the HISE C++ codebase (https://github.com/christophhart/HISE). Follow these phases in order. Do not skip phases unless explicitly instructed by the prompt or user.

**Override:** This workflow overrides the AGENTS.md restrictions on git operations. You MUST run git commands as instructed below (remote checks, branching, forking, PRs). The only restriction that still applies: NEVER build HISE from CLI.

${isPR ? `**Resuming from PR:** ${ref}` : isIssue ? `**Starting from issue:** ${ref}` : '**No issue provided — ask the contributor to describe the bug.**'}

---

# PHASE 0: Prerequisites

Run these checks in order. Report results concisely, then proceed.

1. **HISE repo check:** \`git remote -v\` — at least one remote must contain "HISE". If not: STOP. Tell user "Not a HISE repo. cd into your HISE checkout first." Do NOT search disk for HISE folders.

2. **Ask:** "Do you want me to use \`gh\` CLI for GitHub operations, or do them manually?" This choice applies to all phases. Manual mode -> contributor mode, skip to Phase 1.

3. **(gh only)** \`gh auth status\` — must be authenticated. If not, guide through \`gh auth login\`.

4. **(gh only)** \`gh api user --jq .login\` — \`christophhart\` -> maintainer mode; anything else -> contributor mode.

---

# PHASE 1: Understand

${isPR ? `**PR provided — fetch it first:**
- Extract the PR number. Fetch the PR including all comments, reviews, and the diff. Use \`gh\` if available, otherwise the GitHub API (public repo, no auth needed).
- **Maintainer mode:** Ask: "What would you like to do with this PR? (1) **Review it** — independent risk assessment and review summary, or (2) **Take it over** — tell me what needs to change and I'll fix the code." If **Review** -> skip Phase 2, go to **REVIEW PATH**. If **Take over** -> ask for verbal guidance, then skip to **Phase 2.5**.
- **Contributor mode:** If \`christophhart\` has left review comments with guidance -> skip to **Phase 2.5**. If no maintainer review comments -> proceed to assess independently.
` : isIssue ? `**Issue provided — fetch it first:**
- Extract the issue number for \`Fixes #NNN\` in commits and PR description. Fetch the issue including all comments. Use \`gh\` if available, otherwise the GitHub API (public repo, no auth needed).
- If \`christophhart\` has commented with guidance -> skip to **Phase 2.5**
- If no owner comments -> proceed to assess independently
` : `Ask the contributor to describe the bug or improvement. Gather reproduction steps, relevant forum/issue links, and debugger output if available.
`}
**Crash shortcut:** If the contributor has a stack trace or is in a debug session, skip description questions — the stack trace IS the description.

Search the codebase to locate the relevant code. Present findings before proceeding.

---

# PHASE 2: Assess

**CRITICAL:** Load \`get_resource('contributor-agent-guide')\` now. Read it fully — it contains the Evidence Test, Consumer Trace, Red Flags, Positive Signals, and common fix patterns. Apply them to this change.

**Absolute red flags (always stop — create issue instead of fixing):**
- Parameter/attribute index changes (enum reordering, index arithmetic)
- Scripting API method signature changes (HISE validates param count at compile time)
- Serialization format changes (exportAsValueTree / restoreFromValueTree)

Full red flags list is in the contributor-agent-guide.

**Verdict:** GREEN (no flags, evidence found) -> Phase 3 | YELLOW (minor concerns) -> Phase 3 with caveats | RED -> Red Path

---
${isPR ? `
# REVIEW PATH (maintainer + PR only)

This section runs when the maintainer chose "Review it" in Phase 1. The PR data and diff are already fetched.

**Step 1: Independent Verification**

Load the risk framework: \`get_resource('contributor-agent-guide')\`. Run the same assessment as Phase 2: verify evidence, re-run the consumer trace, scan for red flags, check code quality. Compare your findings with the contributor's claims.

**Step 2: Present your findings** — Summarize: does the contributor's evidence check out? What consumers did you find? Any red flags or concerns? Your verdict: MERGE-READY, NEEDS-CHANGES, or NEEDS-DISCUSSION.

**Step 3: What next?**

Ask the maintainer:
1. **Post review & request changes** — \`gh pr review <N> --repo christophhart/HISE --request-changes --body "REVIEW_BODY"\`. The contributor can pick this up by re-invoking \`contribute\` with the PR URL.
2. **Fix it myself** — Transition to Phase 3 using your review findings as guidance. Your concerns from Step 2 ARE the guidance — proceed directly, no need to re-fetch or re-analyze.
3. **Approve & merge** — Post a comment on the PR summarizing your analysis (verdict, evidence, risk assessment results) so both contributor and maintainer can refer to it later. Then approve: \`gh pr review <N> --repo christophhart/HISE --approve\`
4. **Done** — No further action.

If the maintainer picks "Fix it myself", proceed to **Phase 3** (the review findings provide the context needed — skip Phase 2.5).

---
` : ''}
# RED PATH: Create Issue Instead of PR

Create a \`contribution-proposal\` issue with: description, investigation findings (file:line refs), risk assessment (which flags triggered), and proposed approach.

- **gh mode:** \`gh issue create --repo christophhart/HISE --assignee christophhart --label "contribution-proposal" --title "Contribution Proposal: ..." --body "..."\`
- **manual mode:** Present title + body as copyable text for https://github.com/christophhart/HISE/issues/new with label \`contribution-proposal\`.

Contributor mode: stop here, tell user to re-invoke with issue URL when maintainer responds.

---

# PHASE 2.5: Resume with Guidance

**Entry conditions** (any of these):
- Issue or PR has maintainer comments with guidance
- Maintainer gave verbal guidance (chose "Take it over" in Phase 1)
- Contributor re-invoked with a PR URL after maintainer requested changes

**Note:** If arriving here from the REVIEW PATH ("Fix it myself"), skip this phase — the review findings already provide the context. Proceed directly to Phase 3.

1. Fetch the issue or PR + comments/reviews (same as Phase 1). For PRs, also review the diff to understand the current state of the fix.
2. For each maintainer instruction (written or verbal), search the codebase to understand WHY — find existing usage of the suggested pattern, show findings
3. Incorporate guidance into fix approach, proceed to Phase 3

---

# PHASE 3: Fix

**3a. Fork & branch setup:**
- **Contributor:** Ensure a fork exists with \`upstream\` pointing to \`christophhart/HISE\`. Create a branch from \`upstream/develop\`. If resuming from a PR, check out the existing PR branch instead.
- **Maintainer:** Ask: "Fix their PR branch, commit directly to your current branch, or create a new branch?" For direct commits, skip Phase 4 — do NOT switch branches, do NOT push.

**3b.** Propose the fix following patterns from Phase 2. Show the diff. Keep it minimal.

**3c. NEVER build HISE from CLI.** No MSBuild, make, cmake, xcodebuild. Tell user to build in their IDE and report the result. Wait for confirmation before proceeding.

---

# PHASE 4: Submit

**4a.** Generate a PR description with: summary of the change, \`Fixes #NNN\` if applicable, change type, evidence, testing info, files changed, and this impact checklist:

- [ ] DSP or audio rendering
- [ ] Module parameter indices or attribute enums
- [ ] Serialization (exportAsValueTree / restoreFromValueTree)
- [ ] Backend/frontend guards (USE_BACKEND / USE_FRONTEND)
- [ ] Scripting engine (parser, preprocessor, include system)
- [ ] Per-instance objects (chains, processors, buffers)
- [ ] Could change existing HISEScript behavior
- [ ] Could change how projects sound or perform

**4b.** Ask the contributor if they want to include a link to this AI conversation in the PR.

**4c.** PR title must include \`Fix #NNN: [description]\` if issue was tracked. Target branch: \`develop\`. Add label \`verified-workflow\`.
`;

  return {
    description: 'HISE Contribution Workflow — assess, fix, and submit a PR',
    messages: [{
      role: 'user',
      content: { type: 'text', text: promptText }
    }]
  };
}


