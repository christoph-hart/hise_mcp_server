/**
 * HISE MCP Server - Prompt Definitions
 * 
 * MCP Prompts are user-controlled templates invoked via slash commands.
 * These prompts embed style guides directly to ensure correct code generation.
 */

import { getHiseClient } from './hise-client.js';
import { HISEDataLoader } from './data-loader.js';
import { STYLE_GUIDES } from './style-guides.js';

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
- If there are errors, use \`hise_runtime_fix_script_line\` to fix them and recompile
- For multi-line changes, use \`hise_runtime_patch_script\` with unified diff format

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
- If there are errors, use \`hise_runtime_fix_script_line\` to fix them and recompile
- For multi-line changes, use \`hise_runtime_patch_script\` with unified diff format

Begin by analyzing the existing code structure and planning your approach.`;

  return {
    description: `Create LAF for: ${components.map(c => c.id).join(', ')}`,
    messages: [{
      role: 'user',
      content: { type: 'text', text: promptText }
    }]
  };
}
