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
    description: 'Comprehensive REPL-tested HiseScript language reference - variable types, realtime safety, syntax rules, and common LLM errors',
    content: `# HiseScript Style Guide

> Load get_resource('graphics-api-style') for drawing methods. Load get_resource('laf-functions-style') before writing LAF code. Load get_resource('scriptpanel-style') for panel setup patterns.

## Diagnostics

HISE provides a custom LSP server with precise, HiseScript-aware diagnostics including runtime inspection. LSP warnings and errors are highly accurate - treat them as compile errors and fix them immediately. Do not ignore LSP diagnostics expecting code to compile successfully; the LSP and compiler share the same parser.

## JavaScript vs HiseScript

HiseScript is based on JavaScript but is its own language. ES6+ features do not exist. The engine is designed for realtime audio safety - many differences exist for this reason.

| Feature | JavaScript | HiseScript |
|---------|-----------|------------|
| Variable declaration | \`const\`, \`let\`, \`var\` | \`var\`, \`const var\`, \`reg\`, \`local\`, \`global\` |
| Undeclared assignment | Creates global silently | **Compile error** (except for loop counters) |
| Arrow functions | \`() => {}\` | All forms: \`() => expr\`, \`x => expr\`, \`(x, y) => expr\`, block body \`(x) => { return x; }\`. Expands to regular function - **not realtime-safe**. |
| Classes / new | \`class Foo {}\`, \`new Foo()\` | Not supported - use factory functions |
| Template literals | \`Hello \${x}\` | \`"Hello " + x\` |
| Default parameters | \`fn(x = 5)\` | Not supported |
| Destructuring | \`const {a} = obj\` | Not supported |
| Spread operator | \`[...arr]\` | Not supported |
| === / !== | Strict equality | Not supported - use \`==\` / \`!=\` |
| Prototype chain | \`Object.prototype\` | Not supported |
| try/catch | Exception handling | Not supported |
| async/await | Promises | Not supported |
| Module system | import/export | \`include("File.js")\` + namespaces |

## Variable Types

Every variable **must** be declared with a keyword. Choose based on scope and realtime safety:

| Keyword | Scope | Mutable | Realtime-safe | Notes |
|---------|-------|---------|---------------|-------|
| \`var\` | Global (from onInit) | Yes | **No** - allocates at runtime | Least efficient. Never use on audio thread. |
| \`const var\` | Global | No | Yes (inlined at compile) | Default for references and fixed values. |
| \`reg\` | Global | Yes | **Yes** - pre-allocated | Max 32 per scope (each namespace gets its own 32). Use for mutable audio-thread state. |
| \`local\` | Function/callback body | Yes | **Yes** (inside inline function) | Cannot be declared in onInit. Temporary storage inside functions. |
| \`global\` | Cross-script (all processors) | Yes | No | Equivalent to \`Globals.name\`. Always use \`Globals.\` prefix for clarity. |

\`\`\`javascript
// WRONG - var inside audio callback
function onNoteOn()
{
    var x = Message.getNoteNumber(); // Allocates memory!
}

// RIGHT - reg or local inside inline function
reg noteNumber = 0;
function onNoteOn()
{
    noteNumber = Message.getNoteNumber();
}
\`\`\`

### const var Naming

\`\`\`javascript
const var NUM_BUTTONS = 8;              // UPPER_CASE for simple values
const var Knob1 = Content.getComponent("Knob1"); // PascalCase for references
\`\`\`

### reg Type Annotations

reg variables support optional type constraints. Violations produce compile errors (development only - zero overhead in exported plugin).

\`\`\`javascript
reg:int noteNumber = 60;
reg:number gain = -6.0;      // int or double
reg:string label = "Hello";
\`\`\`

| Identifier | Accepts |
|-----------|---------|
| \`int\` | Integer |
| \`double\` | Float |
| \`number\` | int or double (preferred) |
| \`string\` | String |
| \`Array\` | Array |
| \`JSON\` | JSON object |
| \`object\` | JSON object or HISE script object (component reference, etc.) |

## Data Types

Five primitive types: Number, String, Boolean, undefined, null.

- Numbers have no int/float distinction at the language level
- Strings use single or double quotes - **not realtime-safe** (allocates memory). Never concatenate or print strings on the audio thread.
- 0 is falsy. All non-zero numbers are truthy.
- undefined means "not assigned". null means "explicitly empty".
- Colours are 32-bit hex integers in \`0xAARRGGBB\` format (alpha first). Always include alpha: \`0xFFFF0000\` (red), not \`0xFF0000\`. Use \`Colours.red\` etc. for named colours. See \`get_resource('graphics-api-style')\` for full colour API.

### Division by Zero (Audio Safety)

Division by zero does **not** follow IEEE 754. Both \`1/0\` and \`0/0\` return a special non-finite numeric value (not \`Infinity\` or \`NaN\`). This value propagates through arithmetic - \`(1/0) + 5\` is still non-finite, not \`5\`. This is intentional: leaking \`Infinity\`/\`NaN\` into the audio signal path can damage speakers.

- Guard with \`isFinite(x)\` before using results that could involve division by zero
- \`isNaN(1/0)\` is \`false\` - division by zero is not \`NaN\`
- \`NaN\` only arises from math functions: \`Math.sqrt(-1)\`, \`Math.log(-1)\`. Check with \`isNaN(x)\`.

### Built-in Utility Functions (Not in API Browser)

These must be known by name - they do not appear in autocomplete or the API Browser:

| Function | Purpose |
|----------|---------|
| \`isDefined(v)\` | Returns true if v is not undefined. Preferred over \`v != undefined\`. |
| \`trace(v)\` | Returns a readable string representation of arrays/objects. Essential for debugging nested data. |
| \`obj.clone()\` | Deep-copies an array or object. Without it, assignment copies by reference. |

### Pass-by-Reference

Arrays and objects are passed by reference. Assignment does NOT copy:

\`\`\`javascript
var a = [1, 2, 3];
var b = a;          // b points to the SAME array
b[0] = 99;
Console.print(a[0]); // 99 - a was modified!

var c = a.clone();  // Independent deep copy
c[0] = 0;
Console.print(a[0]); // 99 - a is unaffected
\`\`\`

## Functions

### inline function (Default Choice)

Use inline function for all named, reusable functions. Pre-allocated scope - **realtime-safe**. Supports local variables. Max 5 parameters.

\`\`\`javascript
inline function clampValue(v, lo, hi)
{
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
}
\`\`\`

### No Nesting

\`inline function\` cannot be nested inside another \`inline function\`. Define all \`inline function\`s at file or namespace scope, then reference them by name where needed.

### Type Annotations on Functions

Parameters and return values can be typed:

\`\`\`javascript
inline function setGain(value: number) { /* ... */ }
inline function: int getIndex() { return 3; }
\`\`\`

### Regular function (Anonymous Callbacks Only)

Use plain function for anonymous callbacks in non-realtime contexts (paint routines, dialogs, mouse callbacks). Each call allocates a scope object - **not realtime-safe**.

\`\`\`javascript
// RIGHT - anonymous callback, not on audio thread
Panel1.setPaintRoutine(function(g)
{
    g.fillAll(Colours.red);
});

Engine.showYesNoWindow("Confirm", "Sure?", function(ok)
{
    if (ok) Console.print("Yes");
});

// WRONG - named reusable function as regular function
function myHelper(x) { return x * 2; }  // Use inline function instead
\`\`\`

### Variable Capturing

Inner functions cannot access outer function parameters. Use C++-style capture lists:

\`\`\`javascript
inline function showDialog(presetName)
{
    // WRONG - presetName not accessible inside callback
    Engine.showYesNoWindow("Delete?", "Sure?", function(ok)
    {
        Console.print(presetName); // ERROR
    });

    // RIGHT - capture presetName explicitly
    Engine.showYesNoWindow("Delete?", "Sure?", function [presetName](ok)
    {
        Console.print(presetName); // Works
    });
}
\`\`\`

Multiple captures: \`function [a, b, c](param) { ... }\`

## Loops

### for...in (Default Choice)

**Significantly faster** than index-based for. Use as default whenever index is not needed.

- On **arrays** and **Buffers**: iterates elements directly
- On **objects**: iterates keys

\`\`\`javascript
// Arrays - gives elements
for (name in ["Alice", "Bob", "Charlie"])
    Console.print(name); // Alice, Bob, Charlie

// Objects - gives keys
const var o = { a: 10, b: 20 };
for (k in o)
    Console.print(k + ": " + o[k]); // a: 10, b: 20
\`\`\`

### Index-based for (When Index is Needed)

Counter variable does not need a keyword declaration:

\`\`\`javascript
for (i = 0; i < panels.length; i++)
    panels[i].set("visible", i == selectedIndex);
\`\`\`

### String Concatenation Gotcha in Loops

\`\`\`javascript
// WRONG - without parentheses, string concatenation takes over
Content.getComponent("Button" + i + 1);

// OK - parentheses force arithmetic first
Content.getComponent("Button" + (i + 1));

// SAFEST - parseInt guards against float values like 1.5
Content.getComponent("Button" + parseInt(i + 1));
\`\`\`

If the numeric value could be a float (e.g. from a slider value or calculation), use \`parseInt()\` to avoid names like "Button1.5".

### ComboBox Values Are Floats

ComboBox \`onControl\` values arrive as floats (e.g. \`1.0\` not \`1\`). Use \`parseInt(value)\` before string concatenation or array indexing:

\`\`\`javascript
inline function onComboBoxControl(component, value)
{
    // WRONG - produces "Mode1.0" or fractional index
    local name = "Mode" + value;

    // RIGHT
    local name = "Mode" + parseInt(value);
}
\`\`\`

## Namespaces

Primary organizational tool. Each namespace gets its own scope.

\`\`\`javascript
namespace MyModule
{
    reg myValue = 10;              // Has its own 32-reg allocation
    const var Panel1 = Content.getComponent("Panel1");

    inline function doSomething()
    {
        Console.print(myValue);
    }
}

MyModule.doSomething(); // Access from outside via dot notation
\`\`\`

### Rules

- Cannot be nested
- Names must not collide with HISE classes (Engine, Content, Synth, etc.)
- **var inside a namespace leaks to global scope** - always use \`reg\`, \`const var\`, or \`local\` instead
- Each namespace gets its own allocation of 32 reg variables
- Convention: one namespace per .js file, name matches filename

### External Files

\`\`\`javascript
// onInit - just a series of includes
include("App.js");
include("LookAndFeel.js");
include("Header.js");
include("Settings.js");
\`\`\`

## Realtime Safety

The audio thread must never block. The MIDI callbacks (onNoteOn, onNoteOff, onController) and onTimer all run on the audio thread.

### Safe on Audio Thread

| Feature | Why |
|---------|-----|
| \`reg\` variables | Pre-allocated at compile time |
| \`local\` inside inline function | Pre-allocated at compile time |
| \`const var\` | Inlined at compile time |
| inline function calls | No scope allocation |
| for...in / for loops (fixed iterations) | No allocation |
| Number arithmetic | No allocation |
| \`Message.*\` methods | Designed for audio thread |
| \`Synth.addNoteOn()\`, \`Synth.addVolumeFade()\`, etc. | Designed for audio thread |

### NOT Safe on Audio Thread

| Feature | Why |
|---------|-----|
| \`var\` declarations | Allocates memory at runtime |
| Regular function calls | Allocates scope object |
| String operations (concatenation, formatting) | Allocates memory |
| Array \`.push()\` / resize operations | Allocates memory |
| Object creation \`{}\` | Allocates memory |
| \`Content.getComponent()\` | Lookup operation |

**Exception:** \`Console.print()\` and other \`Console.*\` calls are safe to use in audio-thread callbacks during development - they are completely stripped out in the exported plugin.

### Callback Thread Reference

| Callback | Thread | Notes |
|----------|--------|-------|
| onInit | Scripting | Setup only - runs once at compile/load |
| onNoteOn | **Audio** | Use \`Message.*\` to read/modify MIDI |
| onNoteOff | **Audio** | |
| onController | **Audio** | |
| onTimer | **Audio** | Started with \`Synth.startTimer(seconds)\`. For MIDI-synced timing (arpeggiators, sequencers). |
| onControl | Scripting | Fires for any UI control change |

For UI timers (animations, display updates), use \`Engine.createTimerObject()\` - runs on UI thread, not audio thread.

## Essential Patterns

### Module References

Obtain references in onInit as \`const var\`. Use \`getAttribute()\` / \`setAttribute()\` with named constants:

\`\`\`javascript
const var MySynth = Synth.getChildSynth("Sine Wave Generator1");
const var MyEffect = Synth.getEffect("Delay1");
const var MyMod = Synth.getModulator("LFO1");

// Parameter access uses reference.ParameterName
MySynth.setAttribute(MySynth.SaturationAmount, 0.5);
var sat = MySynth.getAttribute(MySynth.SaturationAmount);
\`\`\`

### Component References

\`\`\`javascript
const var Knob1 = Content.getComponent("Knob1");

// Properties (text, colour, position, visibility...)
Knob1.set("text", "Cutoff");
var label = Knob1.get("text");

// Value (the user-facing control value)
Knob1.setValue(0.5);
var v = Knob1.getValue();
\`\`\`

### Custom Callbacks (Preferred Over onControl)

Assign individual handlers with \`setControlCallback()\`. The function receives (component, value). **Must be an \`inline function\`** - anonymous \`function()\` will not work.

\`\`\`javascript
const var Knob1 = Content.getComponent("Knob1");
const var MySynth = Synth.getChildSynth("Sine Wave Generator1");

inline function onKnob1Control(component, value)
{
    MySynth.setAttribute(MySynth.SaturationAmount, value);
}

Knob1.setControlCallback(onKnob1Control);
\`\`\`

### Component Arrays and Shared Callbacks

Store references in arrays, assign one callback to all. Use component parameter to branch:

\`\`\`javascript
const var NUM_BUTTONS = 4;
var buttons = [];

for (i = 0; i < NUM_BUTTONS; i++)
    buttons[i] = Content.getComponent("Button" + (i + 1));

inline function onButtonControl(component, value)
{
    local idx = buttons.indexOf(component);

    // Radio-group: turn off all others
    for (i = 0; i < buttons.length; i++)
    {
        if (buttons[i] == component) continue;
        buttons[i].setValue(0);
    }
}

for (i = 0; i < NUM_BUTTONS; i++)
    buttons[i].setControlCallback(onButtonControl);
\`\`\`

### No-Code Module Connection

For simple one-to-one connections, set \`processorId\` and \`parameterId\` in the component's Property Editor - no script needed.

## Containers (Audio-Thread-Safe Alternatives to Array)

| Type | Use Case |
|------|----------|
| Buffer | Fixed-size float array - DSP, sample data |
| MidiList | 128-slot integer array - velocity maps, key switches |
| FixObjectArray | Fixed-size structured object array |
| FixObjectStack | Same with push/pop semantics |
| UnorderedStack | Pre-allocated number stack - voice/note tracking |

## Functional Array Methods

\`.map()\`, \`.filter()\`, \`.every()\`, \`.some()\`, \`.find()\`, \`.findIndex()\`, \`.forEach()\` all exist and work with arrow syntax:

\`\`\`javascript
[1, 2, 3].map(x => x * 2);           // [2, 4, 6]
[1, 2, 3, 4].filter(x => x > 2);     // [3, 4]
[{a: 1}, {a: 2}].map(obj => obj.a);   // [1, 2]
[1, 2, 3].every(x => x > 0);         // true
\`\`\`

Arrow functions expand to regular function - **not realtime-safe**. Use for...in on the audio thread.

## Behavioral Differences from JavaScript

These features work but behave differently than in standard JavaScript:

| Feature | JavaScript | HiseScript |
|---------|-----------|------------|
| \`str.replace("a", "b")\` | Replaces **first** occurrence | Replaces **all** occurrences (no replaceAll() needed) |
| \`arr.concat([4, 5])\` | Returns a **new** array | **Mutates** the original array in-place, returns void |
| \`typeof true\` | "boolean" | "number" |
| \`typeof null\` | "object" | "void" |
| \`1/0\` | \`Infinity\` | Non-finite numeric value (propagates through arithmetic) |
| \`0/0\` | \`NaN\` | Non-finite numeric value (propagates through arithmetic) |

## HiseScript Extras (No JS Equivalent)

Features unique to HiseScript that LLMs won't discover from standard JS knowledge:

| Feature | Description |
|---------|-------------|
| \`Math.range(val, lo, hi)\` | Clamp value to range (also available as \`Math.clamp()\`) |
| \`Math.randInt(lo, hi)\` | Random integer in range |
| \`Math.fmod(x, y)\` | Floating-point modulus |
| \`Math.toRadians(deg)\` / \`Math.toDegrees(rad)\` | Angle conversion |
| \`Math.wrap(val, max)\` | Wrap value at boundary |
| \`Array.sortNatural()\` | Natural sort (numbers in strings) |
| \`Engine.doubleToString(num, decimals)\` | Number to string with decimal precision |
| \`Engine.matchesRegex(str, pattern)\` | Boolean regex test |
| \`Engine.getRegexMatches(str, pattern)\` | Array of regex matches |
| \`SyncNotification\` (911) | Dispatch synchronously on calling thread |
| \`AsyncNotification\` (912) | Dispatch asynchronously on UI thread |
| \`AsyncHiPriorityNotification\` (913) | Dispatch async on separate high-priority thread |

## What Doesn't Exist (Common LLM Errors)

| LLM Writes | Correct HiseScript |
|------------|-------------------|
| \`const x = 5\` | \`const var x = 5\` |
| \`let x = 5\` | \`var x = 5\` (or \`reg\`, \`local\`) |
| \`x = 5\` (undeclared) | Must use \`var\`, \`reg\`, \`local\`, \`const var\`, or \`global\` |
| \`class Foo {}\` / \`new Foo()\` | Factory function returning \`{}\` |
| \`template \${lit}\` | \`"string " + lit\` |
| \`const {a, b} = obj\` | \`var a = obj.a; var b = obj.b;\` |
| \`[...arr]\` / \`{...obj}\` | \`arr.clone()\` / manual copy |
| \`arr.splice(i, n)\` | \`arr.removeElement(i)\` |
| \`console.log()\` | \`Console.print()\` |
| \`setTimeout()\` / \`setInterval()\` | \`Engine.createTimerObject()\` or \`panel.startTimer(ms)\` |
| \`this.property\` | \`this.get("property")\` / \`this.set("property", value)\` |
| \`===\` / \`!==\` | \`==\` / \`!=\` |
| \`switch\` without \`break\` | Every case **must** end with \`break\` |
| \`obj.hasOwnProperty("key")\` | \`isDefined(obj.key)\` |
| \`Object.assign({}, obj)\` | \`obj.clone()\` |
| \`Number(str)\` | \`parseInt(str)\` or \`parseFloat(str)\` |
| \`"key" in obj\` (boolean check) | \`isDefined(obj.key)\` - \`in\` only works in \`for...in\` |
| \`fn(undefined)\` / \`fn(null)\` to clear | Pass \`false\`: \`knob.setControlCallback(false)\`, \`knob.setLocalLookAndFeel(false)\` |
`
  },
  {
    id: 'hisescript-code-workflow',
    name: 'HiseScript Code Generation Workflow',
    description: 'LSP-first workflow for writing HiseScript - external file editing, diagnostics, REPL testing, and verification',
    content: `# HiseScript Code Generation Workflow

## API Naming Convention

All API methods use \`Namespace.camelCase()\` with British spelling (e.g., \`Colour\` not \`Color\`).

## Step 0: Discover Classes

If the task involves classes you haven't used before, use \`explore_hise\` to discover which API classes are relevant. It returns class relationships, factory chains (how to obtain instances), and disambiguation guidance (when to use class A vs class B).

## Step 1: Read Current State

Before writing or editing code, understand what exists:

- Run \`hise-cli -script "..."\` (REPL) to read live state, or open the script file on disk to see callbacks and \`include()\`'d \`externalFiles[]\` paths
- Run \`hise-cli -ui\` / \`hise-cli -ui show <id>\` to see existing UI components and their properties
- For external .js files, use \`mcp_read\` to read the file on disk
- Use \`query_scripting_api("ClassName")\` to get a class overview (methods, constants, usage patterns)
- Use \`query_scripting_api("ClassName.method")\` for individual method details

## Step 2: Write or Edit Code

Use \`mcp_edit\` to modify external .js files on disk. Avoid editing inline callbacks - move code to an external file via \`include()\` so you get LSP diagnostics.

1. Edit the file with \`mcp_edit\`
2. Read LSP diagnostics - HISE's LSP server runs automatically and provides precise, HiseScript-aware feedback including parameter counts, method names, and runtime inspection
3. Fix all LSP warnings/errors before proceeding
4. Run \`hise-cli -wizard run recompile\` to apply changes

### Language rules

Load \`get_resource('hisescript-style')\` for variable types, realtime safety, and syntax rules. Key defaults:

- \`inline function\` over regular function (realtime-safe)
- \`for...in\` over index-based for (faster)
- \`const var\` for references, \`reg\` for mutable audio-thread state
- Explicit variable declarations (\`var\`, \`reg\`, \`local\`, \`const var\`)

## Step 3: Handle Errors

If compilation fails or LSP reports issues:

1. Read the error message carefully - HISE error messages are precise
2. Use \`hise_verify_parameters\` (MCP) if the error involves an unknown method or wrong parameter count
3. Run \`hise-cli -script "..."\` to test expressions interactively (note: has side effects — \`Synth.playNote()\` plays a note, \`setValue()\` changes a component)
4. Fix and recompile via \`hise-cli -wizard run recompile\`

## Step 4: Verify (When Needed)

- \`hise-cli -script "..."\` — inspect variables, test return values, check runtime state. **Warning:** Expressions have real side effects — API calls execute, values change, notes play.
- \`hise-cli -ui show <id>\` — check component state
- \`hise-cli -hise screenshot to <path>\` — only when the developer explicitly requests a screenshot. Target specific components with \`at <scale>\` when possible.
`
  },
  {
    id: 'laf-functions-style',
    name: 'LAF Functions Style Guide',
    description: 'How to customize UI component appearance using LookAndFeel functions - load this before writing LAF code',
    content: `# LAF Functions Style Guide

> **Prerequisites:** Review the HiseScript Style Guide (\`get_resource('hisescript-style')\`) for variable declarations, inline functions, and other language fundamentals before writing LAF code. Load the Graphics API Style Guide (\`get_resource('graphics-api-style')\`) for drawing methods.

## Basic Pattern

\`\`\`javascript
// 1. Create a LookAndFeel object
const var laf = Content.createLocalLookAndFeel();

// 2. Register drawing functions
laf.registerFunction("drawToggleButton", function(g, obj)
{
    // g = Graphics object (see graphics-api-style)
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
4. Write drawing code using Graphics API (\`get_resource('graphics-api-style')\`)
5. Apply code using the workflow in \`get_resource('hisescript-code-workflow')\`

## The obj Parameter

Every LAF function receives obj with component state. Common properties:
- obj.id - Component ID (use for branching in multi-component LAF)
- obj.area - Bounds as Rectangle (use Rectangle methods or pass directly to drawing methods)
- obj.hover / obj.over - Mouse hover state
- obj.down / obj.clicked - Mouse pressed state
- obj.value - Current component value
- obj.enabled - Whether component is enabled
- obj.bgColour, obj.itemColour1, obj.textColour - Component colours

Use query_laf_function(functionName) for the complete property list.
`
  },
  {
    id: 'graphics-api-style',
    name: 'Graphics API Style Guide',
    description: 'Drawing methods, colours, gradients, paths, and the Rectangle class - load this before writing any Graphics code',
    content: `# Graphics API Style Guide

> **Prerequisites:** Load \`get_resource('hisescript-style')\` first. Use \`hise_verify_parameters\` to check method signatures.

## The Rectangle Class - Use It Everywhere

All Graphics drawing methods take areas as \`Rectangle\` objects. **Always prefer \`Rectangle()\` over raw arrays.**

\`\`\`javascript
// WRONG - raw array (works but not recommended)
g.fillRect([10, 20, 100, 50]);

// RIGHT - Rectangle class
g.fillRect(Rectangle(10, 20, 100, 50));
\`\`\`

### Creating Rectangles

\`\`\`javascript
// Constructor
var area = Rectangle(x, y, width, height);
var area = Rectangle(0, 0, 100, 80);

// From panel bounds
var area = this.getLocalBounds(0);      // Full panel
var area = this.getLocalBounds(5);      // With 5px margin on all sides
\`\`\`

### Rectangle Methods - Mutating

These methods **modify the original** and return the removed section:

\`\`\`javascript
var area = Rectangle(0, 0, 200, 100);

var leftStrip = area.removeFromLeft(50);   // area is now [50,0,150,100], returns [0,0,50,100]
var topStrip = area.removeFromTop(20);     // area is now [50,20,150,80], returns [50,0,150,20]
var rightStrip = area.removeFromRight(30); // Removes from right edge
var bottomStrip = area.removeFromBottom(10); // Removes from bottom edge
\`\`\`

### Rectangle Methods - Non-Mutating

These return a **new Rectangle**, leaving the original unchanged:

\`\`\`javascript
var area = Rectangle(0, 0, 100, 80);

area.reduced(10)           // Shrink by 10px on all sides
area.reduced(10, 5)        // Shrink by 10px horizontal, 5px vertical
area.expanded(5)           // Grow by 5px on all sides
area.translated(20, 10)    // Move by offset
area.withWidth(50)         // Same position, new width
area.withHeight(30)        // Same position, new height
area.withTrimmedLeft(10)   // Remove 10px from left (doesn't mutate)
area.withTrimmedTop(5)     // Remove 5px from top
area.scaled(0.5, 0.5)      // Scale size and position
area.withCentre(100, 50)   // Move to new centre point
\`\`\`

### Rectangle Methods - Queries

\`\`\`javascript
area.contains([x, y])           // Point hit test
area.contains(otherRect)        // Rectangle containment
area.intersects(otherRect)      // Overlap test
area.getIntersection(otherRect) // Get overlapping area
area.getUnion(otherRect)        // Get bounding rectangle
area.isEmpty()                  // Zero or negative size?
\`\`\`

## Drawing Methods Quick Reference

| Method | Signature |
|--------|-----------|
| \`fillRect\` | \`g.fillRect(Rectangle(x, y, w, h))\` |
| \`drawRect\` | \`g.drawRect(Rectangle(x, y, w, h), borderSize)\` |
| \`fillEllipse\` | \`g.fillEllipse(Rectangle(x, y, w, h))\` |
| \`drawEllipse\` | \`g.drawEllipse(Rectangle(x, y, w, h), lineThickness)\` |
| \`fillRoundedRectangle\` | \`g.fillRoundedRectangle(Rectangle(x, y, w, h), cornerSize)\` |
| \`drawRoundedRectangle\` | \`g.drawRoundedRectangle(Rectangle(x, y, w, h), cornerSize, borderSize)\` |
| \`fillPath\` | \`g.fillPath(path, Rectangle(x, y, w, h))\` |
| \`drawPath\` | \`g.drawPath(path, Rectangle(x, y, w, h), strokeStyle)\` |
| \`drawText\` | \`g.drawText("text", Rectangle(x, y, w, h))\` |
| \`drawAlignedText\` | \`g.drawAlignedText("text", Rectangle(x, y, w, h), "centred")\` |
| \`setFont\` | \`g.setFont("fontName", fontSize)\` |
| \`setFontWithSpacing\` | \`g.setFontWithSpacing("fontName", fontSize, spacing)\` |
| \`fillAll\` | \`g.fillAll(colour)\` |
| \`drawDropShadow\` | \`g.drawDropShadow(Rectangle(x, y, w, h), colour, radius)\` |

### drawLine - Unusual Parameter Order!

\`\`\`javascript
// WRONG - intuitive but incorrect
g.drawLine(x1, y1, x2, y2, thickness);

// RIGHT - x values together, then y values together
g.drawLine(x1, x2, y1, y2, thickness);
\`\`\`

### Convenience Line Methods

\`\`\`javascript
g.drawHorizontalLine(y, x1, x2);  // No thickness param
g.drawVerticalLine(x, y1, y2);    // No thickness param
\`\`\`

## Gradients

Use \`g.setGradientFill(array)\`. There is **NO** \`createLinearGradient()\` method.

### Linear Gradient

\`\`\`javascript
g.setGradientFill([
    Colours.white, 0, 0,      // Start colour, x, y
    Colours.black, 0, 100,    // End colour, x, y
    false                      // false = linear
]);
g.fillRect(Rectangle(0, 0, 100, 100));
\`\`\`

### Radial Gradient

\`\`\`javascript
g.setGradientFill([
    Colours.white, 50, 50,    // Centre colour, x, y
    Colours.black, 0, 0,      // Edge colour (position defines radius)
    true                       // true = radial
]);
\`\`\`

### Multi-Stop Gradient

Add \`colour, position\` pairs after the boolean flag:

\`\`\`javascript
g.setGradientFill([
    Colours.red, 0, 0,
    Colours.blue, 100, 0,
    false,                     // Linear
    Colours.yellow, 0.25,      // 25% position
    Colours.green, 0.5,        // 50% position
    Colours.purple, 0.75       // 75% position
]);
\`\`\`

## Paths

### Creation - Use Content.createPath()

\`\`\`javascript
// WRONG - doesn't exist
var p = g.createPath();
g.beginPath();

// RIGHT
var p = Content.createPath();
\`\`\`

### Building Paths

\`\`\`javascript
var p = Content.createPath();

// Set bounds first (important for scaling)
p.startNewSubPath(0.0, 0.0);
p.startNewSubPath(1.0, 1.0);

// Draw shape (normalized 0-1 coordinates recommended)
p.startNewSubPath(0.0, 0.5);
p.lineTo(0.5, 0.0);
p.lineTo(1.0, 0.5);
p.lineTo(0.5, 1.0);
p.closeSubPath();
\`\`\`

### Drawing Paths

The area parameter scales the path to fit:

\`\`\`javascript
var area = Rectangle(10, 10, 100, 100);

g.fillPath(p, area);
g.drawPath(p, area, 2.0);  // 2.0 = line thickness

// Or with stroke style object
g.drawPath(p, area, {
    "Thickness": 3.0,
    "JointStyle": "curved",    // "mitered", "curved", "beveled"
    "EndCapStyle": "rounded"   // "butt", "square", "rounded"
});
\`\`\`

### Path Methods

| Method | Description |
|--------|-------------|
| \`startNewSubPath(x, y)\` | Start new sub-path (also sets bounds) |
| \`lineTo(x, y)\` | Line to point |
| \`quadraticTo([cx, cy], x, y)\` | Quadratic curve |
| \`cubicTo([c1x, c1y], [c2x, c2y], x, y)\` | Cubic bezier |
| \`closeSubPath()\` | Close current sub-path |
| \`clear()\` | Clear all paths |
| \`addEllipse(Rectangle(x, y, w, h))\` | Add ellipse |
| \`addRectangle(Rectangle(x, y, w, h))\` | Add rectangle |
| \`addRoundedRectangle(Rectangle(x, y, w, h), corner)\` | Add rounded rect |
| \`addArc(Rectangle(x, y, w, h), fromRadians, toRadians)\` | Add arc |
| \`loadFromData("base64...")\` | Load from encoded string |

## Colours

### Hex Format: 0xAARRGGBB

\`\`\`javascript
0xFFFF0000  // Solid red (FF alpha = 100%)
0x80FF0000  // 50% transparent red
0x22FFFFFF  // ~13% white (common for hover overlays)
0x00000000  // Fully transparent
\`\`\`

### Colours Namespace

\`\`\`javascript
// Named colours
Colours.white, Colours.black, Colours.red, Colours.blue, etc.

// WRONG - method chaining doesn't work
colour.withAlpha(0.5);

// RIGHT - use namespace methods
Colours.withAlpha(Colours.red, 0.5);
Colours.withMultipliedBrightness(colour, 1.5);
Colours.withMultipliedSaturation(colour, 0.8);
Colours.mix(Colours.red, Colours.blue, 0.5);  // 50/50 blend

// Convert formats
Colours.fromHsl([h, s, l, a]);  // HSL array to colour
Colours.toHsl(colour);          // Colour to HSL array
\`\`\`

### Component Colours

\`\`\`javascript
this.get("bgColour")      // Background colour
this.get("itemColour")    // Item colour 1
this.get("itemColour2")   // Item colour 2
this.get("textColour")    // Text colour
\`\`\`

## What Doesn't Exist (Common LLM Errors)

| LLM Invents | Use Instead |
|-------------|-------------|
| \`g.createPath()\` | \`Content.createPath()\` |
| \`g.beginPath()\`, \`g.stroke()\`, \`g.fill()\` | Build path, then \`fillPath\`/\`drawPath\` |
| \`g.fillCircle(x, y, r)\` | \`g.fillEllipse(Rectangle(x-r, y-r, r*2, r*2))\` |
| \`g.arc()\` | \`path.addArc()\` then \`g.drawPath()\` |
| \`g.save()\`, \`g.restore()\` | Not needed - no state stack |
| \`Colours.createGradient()\` | \`g.setGradientFill([...])\` |
| \`colour.withAlpha(0.5)\` | \`Colours.withAlpha(colour, 0.5)\` |
`
  },
  {
    id: 'scriptpanel-style',
    name: 'ScriptPanel Style Guide',
    description: 'Panel setup patterns, data storage, callbacks, mouse handling, and timer animation',
    content: `# ScriptPanel Style Guide

> **Prerequisites:** Load \`get_resource('graphics-api-style')\` for drawing methods, \`get_resource('hisescript-style')\` for language basics.

## Panel Factory Pattern

Encapsulate panel setup in a namespace with a \`make()\` function:

\`\`\`javascript
namespace MyComponent
{
    inline function make(name)
    {
        local p = Content.getComponent(name);
        
        // Initialize state
        p.data.value = 0.0;
        p.data.hover = false;
        p.data.path = Content.createPath();
        
        // Enable callbacks
        p.set("allowCallbacks", "Clicks & Hover");  // or "All Callbacks"
        
        // Set up routines
        p.setPaintRoutine(function(g) { /* ... */ });
        p.setMouseCallback(function(event) { /* ... */ });
        
        return p;
    }
}

// Usage
const var myPanel = MyComponent.make("Panel1");
\`\`\`

## Panel Data Storage

Use \`this.data\` to store state accessible across callbacks:

\`\`\`javascript
// In make() - initialize data
p.data.path = Content.createPath();
p.data.currentIndex = 0;
p.data.hover = false;

// In paint routine - read data
if(isDefined(this.data.path))
    g.fillPath(this.data.path, area);

// In mouse callback - write data
this.data.hover = event.hover;
this.repaint();  // Trigger redraw after state change
\`\`\`

## Paint Routine

\`\`\`javascript
p.setPaintRoutine(function(g)
{
    // g = Graphics object (see graphics-api-style)
    // this = the panel
    
    var area = this.getLocalBounds(0);  // Full panel bounds
    
    // Background
    g.fillAll(0xFF222222);
    
    // Content with margin
    g.setColour(Colours.white);
    g.fillRect(area.reduced(10));
    
    // Use component colours
    g.setColour(this.get("itemColour"));
    g.fillEllipse(area.reduced(20));
});
\`\`\`

## Mouse Callback

\`\`\`javascript
p.set("allowCallbacks", "Clicks & Hover");  // Required!

p.setMouseCallback(function(event)
{
    // Mouse state
    event.hover       // Mouse is over panel
    event.clicked     // Mouse button just pressed (mutually exclusive with doubleClick)
    event.mouseUp     // Mouse button just released  
    event.rightClick  // Right mouse button
    event.doubleClick // Double click detected (mutually exclusive with clicked)
    
    // Position
    event.x           // Mouse X coordinate
    event.y           // Mouse Y coordinate
    
    // Drag state
    event.drag        // Mouse is being dragged
    event.dragX       // Horizontal drag delta
    event.dragY       // Vertical drag delta
    
    // Modifier keys
    event.shiftDown
    event.cmdDown     // Cmd on Mac, Ctrl on Windows
    event.altDown
    
    // IMPORTANT: doubleClick and clicked are mutually exclusive.
    // Check doubleClick first with an early return, otherwise it never triggers.
    if(event.doubleClick)
    {
        // Handle double click
        return;
    }
    
    // Common pattern
    this.data.hover = event.hover;
    
    if(event.clicked)
        this.data.clickPos = [event.x, event.y];
    
    this.repaint();  // Always repaint after state changes
});
\`\`\`

## Timer Animation

\`\`\`javascript
p.setTimerCallback(function()
{
    this.data.animValue += 0.1;
    
    if(this.data.animValue >= 1.0)
    {
        this.data.animValue = 0.0;
        this.stopTimer();  // Stop when done
    }
    
    this.repaint();
});

// Control timer
this.startTimer(30);  // Start with 30ms interval
this.stopTimer();     // Stop timer
\`\`\`

## Panel Properties

Use \`this.get(prop)\` / \`p.set(prop, val)\`. Key properties: \`width\`, \`height\`, \`x\`, \`y\`, \`enabled\`, \`text\`, \`allowCallbacks\`, \`bgColour\`, \`itemColour\`, \`itemColour2\`, \`textColour\`. Use \`this.getLocalBounds(margin)\` for a Rectangle of the panel area.

## Storing Paths for Reuse

Create paths once, store in \`data\`, redraw as needed:

\`\`\`javascript
// In make() or separate function
inline function rebuildPath(panel)
{
    var p = panel.data.path;
    p.clear();
    
    p.startNewSubPath(0.0, 0.5);
    p.lineTo(0.5, 0.0);
    p.lineTo(1.0, 0.5);
    p.lineTo(0.5, 1.0);
    p.closeSubPath();
    
    panel.repaint();
}

// In paint routine
p.setPaintRoutine(function(g)
{
    if(isDefined(this.data.path))
        g.fillPath(this.data.path, this.getLocalBounds(5));
});
\`\`\`

## Hit Testing with Rectangle

\`\`\`javascript
p.setMouseCallback(function(event)
{
    var pos = [event.x, event.y];
    
    // Check if click is in a specific area
    var buttonArea = Rectangle(10, 10, 80, 30);
    
    if(buttonArea.contains(pos) && event.clicked)
    {
        // Handle button click
    }
});
\`\`\`
`
  }
];

/**
 * Format a style guide as Markdown for human/agent readability
 */
export function formatStyleGuideAsMarkdown(guide: StyleGuide): string {
  return guide.content;
}
