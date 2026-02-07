/**
 * HISE MCP Server - Style Guide Definitions
 * 
 * Style guides help LLMs understand language-specific quirks.
 * The HiseScript guide is critical for models trained on JavaScript.
 * These are exposed as MCP Resources at hise://style-guides/*
 */

export interface StyleGuide {
  id: string;
  name: string;
  description: string;
  content: string;  // Markdown content - kept concise for context window efficiency
}

export const STYLE_GUIDES: StyleGuide[] = [
  {
    id: 'hisescript-style',
    name: 'HiseScript Style Guide',
    description: 'Key differences between HiseScript and JavaScript - load this before writing any HiseScript code',
    content: `# HiseScript Style Guide

## Quick Reference - JavaScript vs HiseScript

| Feature | JavaScript | HiseScript |
|---------|-----------|------------|
| Local variables | \`const\`, \`let\`, \`var\` | \`var\` (inside functions) |
| Constants | \`const\` | \`const\` (global only) |
| Classes | \`class Foo {}\` | Factory functions |
| Arrow functions | \`() => {}\` | \`inline function() {}\` |
| Inline function params | Any number | Max 5, no undefined |
| Default parameters | \`fn(x = 5)\` | Not supported |
| Template literals | \`\`Hello \${x}\`\` | \`"Hello " + x\` |
| Destructuring | \`const {a} = obj\` | Not supported |
| Spread operator | \`[...arr]\` | Not supported |
| Object creation | \`new Object()\` | \`{}\` |
| MIDI access | \`event.pitch\` | \`Message.getNoteNumber()\` |

(Rest of content remains the same)
`
  },
  {
    id: 'hisescript-code-workflow',
    name: 'HiseScript Code Generation Workflow',
    description: 'Step-by-step process for writing correct HiseScript code, including API method verification',
    content: `# HiseScript Code Generation Workflow: A Comprehensive Guide

## API Naming Convention

All API methods use \`Namespace.camelCase()\` with British spelling (e.g., \`Colour\` not \`Color\`).

## Step 1: API Method Research

1. Identify all API methods you'll need for your code
2. Use \`search_hise\` to find methods by keyword
3. Use \`list_scripting_namespaces\` to see available namespaces
4. Use \`list_ui_components\` for UI-related methods

## Step 2: Verify Method Parameters

1. Call \`hise_verify_parameters\` with method names to get correct signatures

\`\`\`javascript
hise_verify_parameters(["fillRect", "print", "setTimerCallback", "setValue"])
\`\`\`

This returns method signatures with example values:
\`\`\`javascript
{
  "fillRect": ["Graphics.fillRect(Rectangle(0, 0, 100, 100))"],
  "print": ["Console.print(\"message\")"],
  "setTimerCallback": ["ScriptPanel.setTimerCallback(function() {})"],
  "setValue": ["ScriptSlider.setValue(value)"]
}
\`\`\`

## Step 3: Write Code

- Use the exact signatures returned by \`hise_verify_parameters\`
- Handle multiple matches by context:
  - \`Content.getComponent()\` returns ScriptSlider, ScriptPanel, etc.
  - Paint routine \`g\` uses Graphics methods
  - \`Message.*\` in MIDI callbacks

## Step 4: Validate Syntax

1. Use the HiseScript style guide (\`get_resource('hisescript-style')\`) as a reference
2. Follow syntax rules carefully
3. Prefer:
   - \`inline function\` over regular functions
   - Range-based loops (\`for x in array\`)
   - Explicit type conversions
   - Explicit variable declarations

## Step 5: Compile and Test

1. Use \`hise_runtime_set_script\` to compile
2. Review any compilation errors or warnings
3. If errors occur, use the style guide to identify and fix syntax issues

## Pro Tips

- Use \`hise_runtime_screenshot\` to visually debug UI components
- Use \`hise_runtime_get_component_properties\` to check component states
- When in doubt, consult the documentation or ask for help
`
  },
  {
    id: 'laf-functions-style',
    name: 'LAF Functions Style Guide',
    description: 'How to customize UI component appearance using LookAndFeel functions - load this before writing LAF code',
    content: `# LAF Functions Style Guide

> **Prerequisites:** Review the HiseScript Style Guide (\`get_resource('hisescript-style')\`) for variable declarations, inline functions, and other language fundamentals before writing LAF code.

## Basic Pattern

\`\`\`javascript
// 1. Create a LookAndFeel object
const var laf = Content.createLocalLookAndFeel();

// 2. Register drawing functions
laf.registerFunction("drawToggleButton", function(g, obj)
{
    // g = Graphics object (see graphics-style-api-todo)
    // obj = component state and properties
    g.fillAll(obj.bgColour);
    g.setColour(obj.textColour);
    g.drawAlignedText(obj.text, obj.area, "centred");
});

// 3. Assign to component
Button1.setLocalLookAndFeel(laf);
\`\`\`

## Multi-Component Pattern

When styling multiple components, use a single LAF object with an array:

\`\`\`javascript
// Collect components (can mix types - each picks relevant functions)
const var UIComponents = [Content.getComponent("Button1"),
                          Content.getComponent("Button2"),
                          Content.getComponent("Knob1"),
                          Content.getComponent("Knob2")];

const var laf = Content.createLocalLookAndFeel();

// Register for buttons
laf.registerFunction("drawToggleButton", function(g, obj)
{
    g.fillAll(Colours.white);
    
    // Branch by obj.id for component-specific styling
    if(obj.id == "Button2")
        g.fillAll(Colours.blue);
    
    g.setColour(Colours.black);
    g.drawAlignedText(obj.text, obj.area, "centred");
});

// Register for knobs
laf.registerFunction("drawRotarySlider", function(g, obj)
{
    // Knob drawing code...
});

// Apply to all - each component uses the functions it needs
for(c in UIComponents)
    c.setLocalLookAndFeel(laf);
\`\`\`

## Component Organization

### Level 1: Native UI Components
ScriptButton, ScriptSlider, ScriptTable, ScriptComboBox, etc.
Use list_laf_functions("ScriptButton") directly

### Level 2: FloatingTile ContentTypes  
For ScriptFloatingTile, LAF functions depend on the ContentType property.
Check ContentType (e.g., "PresetBrowser"), then use list_laf_functions("PresetBrowser")

### Global UI Elements
PopupMenu, AlertWindow, Scrollbar, etc.
Use list_laf_functions("PopupMenu") directly

## Workflow

1. Get component type (or ContentType for FloatingTiles)
2. Call list_laf_functions(type) to see available functions
3. Call query_laf_function(name) to get obj properties
4. Write drawing code using Graphics API (see graphics-style-api-todo)
5. Apply code using hise_runtime_set_script (see below)

## Applying LAF Code

Use \`hise_runtime_set_script\` with the callbacks parameter to write new LAF code:

\`\`\`javascript
// Only onInit is updated, other callbacks remain unchanged
hise_runtime_set_script({
  moduleId: "Interface",
  callbacks: { "onInit": "const var laf = Content.createLocalLookAndFeel();\\n..." }
})
\`\`\`

Use \`hise_runtime_edit_script\` only for fixing specific lines in existing code (e.g., after a compile error).

## The obj Parameter

Every LAF function receives obj with component state. Common properties:
- obj.id - Component ID (use for branching in multi-component LAF)
- obj.area - Bounds as [x, y, width, height]
- obj.hover / obj.over - Mouse hover state
- obj.down / obj.clicked - Mouse pressed state
- obj.value - Current component value
- obj.enabled - Whether component is enabled
- obj.bgColour, obj.itemColour1, obj.textColour - Component colours

Use query_laf_function(functionName) for the complete property list.

## Graphics API

The g parameter is a Graphics object. See graphics-style-api-todo for available methods.
`
  }
];

/**
 * Format a style guide as Markdown for human/agent readability
 */
export function formatStyleGuideAsMarkdown(guide: StyleGuide): string {
  return guide.content;
}