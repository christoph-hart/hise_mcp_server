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
        name: 'issue',
        description: 'GitHub issue number, URL, or description of the bug/improvement',
        required: false,
      },
    ],
  },
  {
    name: 'review_pr',
    title: 'Review HISE Pull Request',
    description: 'Assess an incoming pull request against the HISE contribution risk framework',
    arguments: [
      {
        name: 'pr',
        description: 'PR number or URL (e.g., "879" or "https://github.com/christophhart/HISE/pull/879")',
        required: true,
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
): GetPromptResult {
  const issue = args?.issue || '';

  const promptText = `# HISE Contribution Workflow

You are guiding a contributor through fixing a bug or adding an improvement to the HISE C++ codebase (https://github.com/christophhart/HISE). Follow these phases in order. Do NOT skip phases.

${issue ? `**Starting from:** ${issue}` : '**No issue provided — ask the contributor to describe the bug.**'}

---

# PHASE 0: Prerequisites

Execute each step in order.

1. **HISE repo check:** Run \`ls hi_core hi_scripting hi_components\` — all three directories must exist in the current working directory.
   **If they do NOT:** STOP IMMEDIATELY. Tell the user: "This is not a HISE repository. Please cd into your local HISE checkout and start again." Do NOT search for HISE folders on disk. Do NOT continue with any other phase. This is a fatal error.

2. **GitHub interaction mode:** Ask the user: "Do you want me to use the GitHub CLI (gh) to create issues and pull requests automatically, or would you prefer to do that manually on GitHub? If manual, I'll provide the exact text to paste."
   Remember this choice — it applies to ALL GitHub interactions in this session.
   **If manual mode:** Skip steps 3-4. You are in **contributor mode** with **manual GitHub interaction**. Proceed to Phase 1.

3. **GitHub CLI auth (gh mode only):** \`gh auth status\` — must show authenticated account. If not installed or not authenticated, guide the user through \`gh auth login\` setup before continuing.

4. **Mode detection (gh mode only):** Run \`gh api user --jq .login\`.
   If the result is \`christophhart\` -> **maintainer mode** (skip fork setup, can branch directly in main repo).
   Otherwise -> **contributor mode** (fork required before Phase 3).

Fork & branch setup is deferred to Phase 3.

---

# PHASE 1: Understand

${issue ? `**Issue provided — fetch context first:**
- Extract the issue number from the URL or argument
- Fetch the issue and comments:
  - **gh mode:** \`gh issue view <number> --comments\`
  - **manual mode:** Use WebFetch on \`https://github.com/christophhart/HISE/issues/<number>\`, or fetch the unauthenticated GitHub API endpoints: \`https://api.github.com/repos/christophhart/HISE/issues/<number>\` (issue body) and \`https://api.github.com/repos/christophhart/HISE/issues/<number>/comments\` (comments as JSON). No authentication is needed for public repos.
- Reading issues works in BOTH modes — the gh/manual distinction only matters for write operations (creating issues, creating PRs).
- Check for comments from the repo owner (\`christophhart\`)
- If the repo owner has commented with guidance -> skip to **Phase 2.5**
- If no owner comments -> inform contributor to wait, or proceed to assess independently
` : `Ask the contributor for:
1. What is the bug or improvement? (symptoms, reproduction steps)
2. Is there a forum thread or GitHub issue with context?
3. Do you have any debugger output? (stack traces, variable values at crash site)
`}
**Crash shortcut:** If the contributor mentions a crash, has a stack trace ready, or says they are already in a debug session, skip the description questions. Ask them to paste the full stack trace and any relevant variable values. The stack trace IS the description — proceed directly to analyzing it using the debugger-assisted workflow from the contributor-agent-guide.

**Issue number tracking:** If the issue argument is a GitHub issue number or URL, extract the issue number (e.g., \`769\` from \`https://github.com/christophhart/HISE/issues/769\`). Remember this number — it will be used as \`Fixes #NNN\` in commit messages and PR descriptions to auto-close the issue on GitHub. If the issue argument was a free-text description (not a GitHub issue), there is no issue number to reference.

Search the codebase (grep, glob, file reads) to locate the relevant code. Present findings before proceeding.

---

# PHASE 2: Assess

**CRITICAL:** Before proposing any fix, load the full risk assessment protocol:

> **Load now:** \`get_resource('contributor-agent-guide')\` — this contains the Evidence Test, Consumer Trace, complete Red Flags and Positive Signals lists, and common fix patterns. Read it fully and apply it to this change.

Run the Evidence Test and Consumer Trace as described in the guide. Then determine the risk verdict:

**Absolute red flags (always stop — create issue instead):**
- Parameter/attribute index changes (enum reordering, index arithmetic)
- Scripting API method signature changes (HISE validates param count at compile time)
- Serialization format changes (exportAsValueTree / restoreFromValueTree)

For all other red flags, consult the full list in the contributor-agent-guide resource.

## Verdict
- **GREEN** — No red flags, evidence found -> Phase 3
- **YELLOW** — Minor concerns, evidence exists -> Phase 3 with documented caveats
- **RED** — Red flags triggered -> RED PATH

---

# RED PATH: Create Issue

Generate the issue content with this structure:
- **Contribution Proposal** header with contributor username, AI-assisted flag
- **Bug / Feature Description** — symptoms, reproduction, links
- **Investigation Findings** — relevant file:line references, root cause analysis
- **Risk Assessment** — which red flags triggered, evidence found/not found, consumers identified
- **Proposed Approach** — how this could be fixed, confidence level, specific guidance needed

**If gh mode (chosen in Phase 0):**
\`\`\`
gh issue create \\
  --repo christophhart/HISE \\
  --assignee christophhart \\
  --label "contribution-proposal" \\
  --title "Contribution Proposal: [SHORT DESCRIPTION]" \\
  --body "BODY"
\`\`\`

**If manual mode (chosen in Phase 0):** Present the title and body as copyable text blocks. Tell the user to create the issue at https://github.com/christophhart/HISE/issues/new and paste the content. Remind them to add the \`contribution-proposal\` label and assign to \`christophhart\`.

**Maintainer mode:** "Issue created. Continue directly or test resume flow by re-invoking with the issue URL."
**Contributor mode:** "Issue #NNN created. When the maintainer responds, re-invoke: \`contribute(issue: 'NNN')\`"

Stop here in contributor mode.

---

# PHASE 2.5: Resume with Guidance

(Only when issue has maintainer comments.)

1. Fetch the issue and comments using the same method as Phase 1 (gh mode: \`gh issue view <number> --comments\`; manual mode: WebFetch or unauthenticated GitHub API). Reading always works regardless of mode.
2. Extract the maintainer's instructions from issue comments
3. For each instruction, search the codebase to understand WHY — find existing usage of the suggested pattern/class, show findings to contributor
4. Incorporate guidance into the fix approach, proceed to Phase 3

---

# PHASE 3: Fix

**3a. Fork & branch setup:**
- **Contributor mode (gh mode):**
  1. Run \`git remote -v\` to check current remote configuration
  2. If no \`upstream\` remote pointing to \`christophhart/HISE\`: run \`gh repo fork christophhart/HISE --remote=true\` (this adds the upstream remote and creates the fork if needed)
  3. \`git fetch upstream develop\`
  4. \`git checkout -b fix/DESCRIPTION upstream/develop\`
- **Contributor mode (manual mode):** Tell the user to ensure they have a fork, an \`upstream\` remote pointing to \`christophhart/HISE\`, and a branch from \`upstream/develop\`. Wait for confirmation before proceeding.
- **Maintainer mode:** Ask: "Do you want to create a separate branch for this fix (with PR at the end), or work directly on \`develop\` and push the changes yourself?"
  - If direct commit on develop: skip branch creation and skip Phase 4 entirely. After the fix is tested, suggest a commit message: \`Fix #NNN: [short description]\` (if an issue number was tracked in Phase 1) or just \`[short description]\` (if no issue). Say "Changes ready on develop. Push when ready."
  - If branch+PR: \`git checkout -b fix/DESCRIPTION origin/develop\` and continue to Phase 4.

**3b. Propose the fix** following patterns identified in Phase 2. Show the diff. Keep it minimal.

**3c. NEVER attempt to build HISE from the CLI.** Do not run MSBuild, make, cmake, xcodebuild, or any build command. This applies in BOTH contributor and maintainer mode. Tell the user to build in their IDE (Visual Studio, Xcode) and report the result. Wait for the user to confirm the build succeeded and the fix works before proceeding.

---

# PHASE 4: Submit

**4a.** Generate the PR description with this structure:

\`\`\`markdown
## Summary
[What was broken, what the fix does]
Fixes #NNN (if an issue number was tracked in Phase 1, otherwise omit this line)

### Risk Assessment

**Change type:** [Bugfix / Pattern consistency / Feature (opt-in) / Feature (modifies existing)]

**Evidence:** [Link to existing code that does this, or "new pattern"]

**Impact check:** (check all that apply)
- [ ] Modifies DSP or audio rendering code
- [ ] Modifies module parameter indices or attribute enums
- [ ] Modifies serialization (exportAsValueTree / restoreFromValueTree)
- [ ] Modifies code with USE_BACKEND / USE_FRONTEND guards
- [ ] Modifies scripting engine (parser, preprocessor, include system)
- [ ] Adds per-instance objects to a module (chains, processors, buffers)
- [ ] Could change behavior of existing HISEScript projects
- [ ] Could change how existing projects sound or perform

**Testing:** [Debug build / Release build / Exported plugin / Reproduced bug first]

**Files changed:** N files, +A/-D lines
**Maintainer guidance:** [Summary if resuming from issue, or N/A]
**AI Conversation:** [Link or N/A]
\`\`\`

**4b. MANDATORY STEP — Conversation Link:** Before creating the PR, you MUST ask the contributor: "Would you like to include a link to this AI conversation in the PR description? This helps the maintainer understand the investigation process. (Optional but encouraged)" Wait for their response. Set the AI Conversation field in the PR description to the link if yes, or "N/A" if no. Do NOT skip this step.

**4c. Submit the PR.** The PR title MUST include the issue reference if one was tracked in Phase 1: \`Fix #NNN: [short description]\`. Example: \`Fix #769: CSS border-size percentage not applied correctly\`. If no issue number, just use a descriptive title.

**If gh mode (chosen in Phase 0):**
\`\`\`
gh pr create --base develop --label "verified-workflow" --title "Fix #NNN: DESCRIPTION" --body "BODY"
\`\`\`

**If manual mode (chosen in Phase 0):** Present the title, body, target branch (\`develop\`), and label (\`verified-workflow\`) as copyable text. Tell the user to create the PR at https://github.com/christophhart/HISE/compare/develop...BRANCH.

Show the PR URL to the contributor.
`;

  return {
    description: 'HISE Contribution Workflow — assess, fix, and submit a PR',
    messages: [{
      role: 'user',
      content: { type: 'text', text: promptText }
    }]
  };
}

/**
 * Generate the review_pr prompt
 *
 * Helps the maintainer assess an incoming PR against the risk framework.
 */
export function generateReviewPrPrompt(
  args: Record<string, string> | undefined,
): GetPromptResult {
  const pr = args?.pr;

  if (!pr) {
    return createErrorPrompt(
      'PR Number Required',
      'Please provide a PR number or URL. Example: review_pr(pr: "879")'
    );
  }

  const promptText = `# HISE Pull Request Review

You are helping the HISE maintainer assess an incoming pull request. Your job is to independently verify the contributor's risk assessment and identify anything they missed.

**PR to review:** ${pr}

---

# STEP 1: Gather PR Information

Run these commands to get the full picture:

\`\`\`bash
# Get PR metadata and description
gh pr view ${pr} --repo christophhart/HISE --json title,body,files,additions,deletions,changedFiles,author,labels,state

# Get the actual diff
gh pr diff ${pr} --repo christophhart/HISE
\`\`\`

Read the PR description and identify:
1. The contributor's risk assessment checklist (if present)
2. Any evidence links they provided
3. Any linked issues or conversation links
4. Whether they disclosed AI tool usage

If the risk assessment is **missing entirely**, note this as a concern.

---

# STEP 2: Independent Verification

Load the risk framework: \`get_resource('contributor-agent-guide')\`

## 2a. Evidence Verification

If they claim "existing code already does this" — read the linked code. Does it actually match? Is the pattern match accurate or superficial?

## 2b. Consumer Trace (Re-run)

Search for everything that depends on the code being modified:
- Function name: who calls it?
- Enum value: who reads it by index?
- Property name: who serializes/deserializes it?
- Class: who inherits from it?

Compare your consumer list with what the contributor identified. Note any they missed.

## 2c. Red Flag Check

Scan the diff against the Red Flags list from the contributor-agent-guide. Check for:
- Parameter/attribute index changes
- API method signature changes
- Backend/frontend boundary code
- Scripting engine internals
- Serialization format changes
- Audio thread / DSP rendering
- Per-instance overhead additions
- Established callback behavior changes

## 2d. Code Quality

- Does the code follow HISE conventions? (Allman braces, tabs, PascalCase classes, camelCase methods)
- Is the diff minimal? (smallest change that fixes the issue)
- Thread safety: does the change touch audio-thread-accessible data without \`killVoicesAndCall\`?

---

# STEP 3: Review Summary

Present a concise review:

\`\`\`markdown
## PR #${pr} Review Summary

**Title:** [PR title]
**Author:** [username]
**Scope:** [N files, +A/-D lines]

### Risk Assessment Comparison

| Aspect | Contributor Claims | My Findings |
|--------|-------------------|-------------|
| Change type | [what they said] | [agree/disagree + why] |
| Evidence | [what they linked] | [verified/not verified] |
| Impact areas | [what they checked] | [agree + any missed items] |

### Consumers

**Contributor identified:** [list]
**Additionally found:** [list, or "none — trace was complete"]

### Concerns

[Numbered list of specific issues, or "None — review looks clean"]

### Verdict

**[MERGE-READY / NEEDS-CHANGES / NEEDS-DISCUSSION]**

[1-2 sentences explaining the verdict]
\`\`\`

If NEEDS-CHANGES, draft a review comment:
\`\`\`
gh pr review ${pr} --repo christophhart/HISE --request-changes --body "REVIEW_BODY"
\`\`\`

If MERGE-READY:
\`\`\`
gh pr review ${pr} --repo christophhart/HISE --approve --body "Reviewed with AI assistance. [brief note]"
\`\`\`
`;

  return {
    description: `Review HISE PR #${pr}`,
    messages: [{
      role: 'user',
      content: { type: 'text', text: promptText }
    }]
  };
}
