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
| Local variables | \`const\`, \`let\`, \`var\` | \`local\` (in functions) |
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

## Variable Declaration

| Context | Keyword | Notes |
|---------|---------|-------|
| Global/onInit | \`const\` | Fixed references, resolved at compile time |
| Global/onInit | \`reg\` | Mutable globals, realtime-safe (32 per namespace) |
| Global/onInit | \`var\` | Avoid in audio callbacks |
| Inline functions/callbacks | \`local\` | Required for all local variables |
| For loop iterator | (none) | \`for(i = 0; ...)\` - no keyword |

\`\`\`javascript
// Wrong
inline function process(value) {
    var x = value * 2;
    const y = x + 1;
    let z = 0;
}

// Right
inline function process(value) {
    local x = value * 2;
    local y = x + 1;
    local z = 0;
}
\`\`\`

## No \`class\` Keyword

Use factory functions returning objects:

\`\`\`javascript
// Wrong
class Filter {
    constructor() { this.cutoff = 1000; }
    reset() { this.cutoff = 1000; }
}

// Right
inline function createFilter() {
    local obj = {};
    obj.cutoff = 1000;
    obj.reset = function() { this.cutoff = 1000; };
    return obj;
}
const filter = createFilter();
\`\`\`

## No \`new\` Operator

\`\`\`javascript
// Wrong
var obj = new Object();
var arr = new Array(10);

// Right
var obj = {};
var arr = [];
\`\`\`

## No \`let\` Keyword

\`\`\`javascript
// Wrong
let x = 5;

// Right (choose based on context)
var x = 5;    // global, mutable
const x = 5;  // global, fixed
reg x = 5;    // global, realtime-safe
local x = 5;  // inside functions
\`\`\`

## No Default Parameters

Every parameter must be provided - create separate functions for different arities:

\`\`\`javascript
// Wrong
inline function convert(freq, minFreq = 20) { }

// Right - separate functions
inline function convertDefault(freq) {
    return convert(freq, 20, 20000);
}

inline function convert(freq, minFreq, maxFreq) {
    // all params required
}
\`\`\`

## No Arrow Functions

\`\`\`javascript
// Wrong
const fn = (x) => x * 2;
const callback = () => { };

// Right
inline function fn(x) { return x * 2; }
function callback() { }
\`\`\`

## No Template Literals

\`\`\`javascript
// Wrong
Console.print(\`Value: \${x}, Status: \${status}\`);

// Right
Console.print("Value: " + x + ", Status: " + status);
\`\`\`

## No Destructuring or Spread

\`\`\`javascript
// Wrong
const {cutoff, resonance} = filterSettings;
const allItems = [...array1, ...array2];
const [first, second] = myArray;

// Right
const cutoff = filterSettings.cutoff;
const resonance = filterSettings.resonance;
const allItems = array1.concat(array2);
const first = myArray[0];
const second = myArray[1];
\`\`\`

## Inline Functions vs Regular Functions

| Aspect | \`inline function\` | \`function\` |
|--------|-------------------|-------------|
| Parameters | Max 5 | Unlimited |
| Recursion | No | Yes |
| Realtime-safe | Yes | No (allocates scope) |
| Use in audio callbacks | Yes | Avoid |
| Variables inside | \`local\` | \`var\` |

**Rule of thumb:** 
- Use \`inline function\` by default (99% of cases)
- Use \`function\` only when you need recursion or >5 parameters
- Never call regular \`function\` from MIDI/audio callbacks

## Inline Functions - Capturing

When using callbacks inside functions, capture outer variables explicitly:

\`\`\`javascript
inline function setup(input) {
    Engine.showYesNoWindow("Title", "Msg", function [input](ok) {
        Console.print(input);  // works - input was captured
    });
}
\`\`\`

## Undefined Parameters Forbidden

Functions cannot be called with undefined parameters:

\`\`\`javascript
// Wrong - throws error
var x;
myFunction(x);

// Right
if (isDefined(x))
    myFunction(x);
\`\`\`

## Loops - Prefer Range-Based

\`\`\`javascript
// Verbose
for (i = 0; i < array.length; i++)
    Console.print(array[i]);

// Better - range-based
for (element in array)
    Console.print(element);

// Objects iterate over keys
for (key in {hello: 1, world: 2})
    Console.print(key);  // prints "hello", "world"
\`\`\`

Declare iterator as \`local\` in nested inline functions to avoid conflicts:

\`\`\`javascript
inline function process() {
    local i;
    for (i = 0; i < 5; i++) { }
}
\`\`\`

## MIDI Callbacks

Use \`Message\` namespace, not event objects:

\`\`\`javascript
// Wrong
function onNoteOn(event) {
    event.pitch += 12;
}

// Right
function onNoteOn() {
    local note = Message.getNoteNumber();
    Message.setNoteNumber(note + 12);
}
\`\`\`

## Console Methods

\`\`\`javascript
// Assertions with message
Console.assertWithMessage(x > 0, "x must be positive");

// Debugging objects/arrays - use trace()
Console.print(trace(myObject));
\`\`\`

## Semicolons Required

HiseScript requires semicolons - they are NOT optional.

## Avoid Globals

- Avoid \`global\` variables when possible
- Never use globals for functions - use namespaces
- Globals impact portability and obscure program flow

\`\`\`javascript
// Wrong
global g_myFunction = function() { };
global g_value = 5;

// Right
namespace MyModule {
    const VALUE = 5;
    inline function myFunction() { }
}
\`\`\`

## Namespaces

Use for organization (no performance penalty):

\`\`\`javascript
namespace MyFilter {
    const CUTOFF_MIN = 20;
    reg currentValue = 0;
    
    inline function process(x) {
        local result = x * 2;
        return result;
    }
}
\`\`\`

**Important:** \`var\` does NOT respect namespace scope - use \`const\` or \`reg\` inside namespaces.

## Type Safety (Optional)

Add type hints for safer code:

\`\`\`javascript
reg:int counter = 0;
counter = "string";  // Compile error

inline function setVolume(level:double) { }

inline function:int getCount() {
    return 5;
}
\`\`\`

Types: \`int\`, \`double\`, \`string\`, \`Array\`, \`Object\`, \`Function\`

## Reserved Keywords

### API Namespaces (do not use as names)

\`Array\`, \`Buffer\`, \`Console\`, \`Content\`, \`Date\`, \`Engine\`, \`Effect\`, \`File\`, \`Math\`, \`Message\`, \`MidiList\`, \`Modulator\`, \`Path\`, \`Sampler\`, \`Sample\`, \`Settings\`, \`String\`, \`Synth\`, \`Timer\`

### Built-in Functions (do not override)

\`parseInt\`, \`parseFloat\`, \`trace\`, \`isDefined\`

### Built-in Properties

\`root\`

## Common API Namespaces

- \`Content.*\` - UI components
- \`Synth.*\` - Sound engine
- \`Engine.*\` - Global engine
- \`Message.*\` - MIDI messages
- \`Console.*\` - Debugging
- \`Math.*\` - Mathematical functions
`
  }
];

/**
 * Format a style guide as Markdown for human/agent readability
 */
export function formatStyleGuideAsMarkdown(guide: StyleGuide): string {
  return guide.content;
}
