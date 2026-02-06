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

HiseScript is similar to JavaScript but has critical differences. Review this before writing code.

## Variable Declaration

| Context | Use | Example |
|---------|-----|---------|
| Global scope | \`const\`, \`reg\`, \`var\` | \`const NUM = 5;\` |
| Inside callbacks/functions | \`local\` | \`local x = 90;\` |
| For loops (in functions) | No keyword | \`for(i = 0; i < 10; i++)\` |

**Wrong:** \`var x = 1;\` inside inline function  
**Right:** \`local x = 1;\` inside inline function

**Wrong:** \`for(var i = 0; ...)\` inside function  
**Right:** \`for(i = 0; ...)\` inside function

## Graphics Methods - Array Arguments

All drawing methods take a single array, not separate arguments:

\`\`\`javascript
// Wrong (JavaScript style)
g.fillRect(10, 20, 100, 50);

// Right (HiseScript)
g.fillRect([10, 20, 100, 50]);
\`\`\`

Affected methods: \`fillRect\`, \`drawRect\`, \`drawRoundedRectangle\`, \`fillRoundedRectangle\`, \`drawEllipse\`, \`fillEllipse\`, \`drawLine\`, \`drawDropShadow\`

## Console Assertions

\`\`\`javascript
// Wrong - assertTrue takes only ONE argument
Console.assertTrue(x > 0, "x must be positive");

// Right
Console.assertTrue(x > 0);
// Or for custom message:
Console.assertWithMessage(x > 0, "x must be positive");
\`\`\`

## Semicolons Required

HiseScript requires semicolons - they are NOT optional like in JavaScript.

## No Arrow Functions

Use \`function\` keyword or inline function syntax:

\`\`\`javascript
// Wrong
const fn = () => { };

// Right
inline function fn() { }
// Or
function fn() { }
\`\`\`

## Common Namespaces

- \`Content.*\` - UI components (Content.addButton, Content.getComponent)
- \`Synth.*\` - Sound engine (Synth.addNoteOn, Synth.getNumPressedKeys)
- \`Engine.*\` - Global engine (Engine.getSampleRate, Engine.getHostBpm)
- \`Message.*\` - MIDI messages (Message.getNoteNumber, Message.setVelocity)
- \`Console.*\` - Debugging (Console.print, Console.assertTrue)
`
  }
];

/**
 * Format a style guide as Markdown for human/agent readability
 */
export function formatStyleGuideAsMarkdown(guide: StyleGuide): string {
  return guide.content;
}
