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
  "print": ["Console.print(\\"message\\")"],
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

Use \`hise_runtime_edit_script\` to modify existing code - it works like the native mcp_edit tool (find exact string, replace with new string). For multiple edits, use \`compile: false\` on all but the last call.

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

## Graphics API

The g parameter is a Graphics object. Load \`get_resource('graphics-api-style')\` for complete drawing method reference.
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

## Screenshot Best Practices

When verifying graphics changes with \`hise_runtime_screenshot\`:

| Scenario | Parameters | Token Cost |
|----------|------------|------------|
| Routine verification | \`id: "ComponentId", scale: 0.5\` | ~750-1,000 |
| Detailed inspection | \`id: "ComponentId", scale: 1.0\` | ~2,000-3,000 |
| Layout verification | \`scale: 0.5\` (full interface) | ~15,000-20,000 |
| Full interface | \`scale: 1.0\` | ~50,000-80,000 |

**Recommendations:**
- **Always target specific components** when verifying drawing code changes
- **Use \`scale: 0.5\`** for routine verification (4x fewer tokens than 1.0)
- **Reserve full interface screenshots** only for layout or positioning tasks
- **Verify iteratively** - screenshot after each significant change, not at the end

\`\`\`javascript
// Efficient: target component at half scale
hise_runtime_screenshot({ id: "Knob1", scale: 0.5 })

// Expensive: full interface at full scale
hise_runtime_screenshot({ scale: 1.0 })
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
    event.clicked     // Mouse button just pressed
    event.mouseUp     // Mouse button just released  
    event.rightClick  // Right mouse button
    event.doubleClick // Double click detected
    
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

## Triggering Repaints

\`\`\`javascript
this.repaint();    // Inside callbacks - repaint this panel
panel.repaint();   // From outside - repaint specific panel
\`\`\`

## Getting Panel Properties

\`\`\`javascript
this.get("width")         // Panel width
this.get("height")        // Panel height  
this.get("bgColour")      // Background colour
this.get("itemColour")    // Item colour 1
this.get("itemColour2")   // Item colour 2
this.get("textColour")    // Text colour
this.get("enabled")       // Enabled state
this.get("text")          // Text property

this.getLocalBounds(margin)  // Rectangle with margin
\`\`\`

## Setting Panel Properties

\`\`\`javascript
p.set("width", 200);
p.set("height", 100);
p.set("allowCallbacks", "All Callbacks");
p.set("enabled", true);
\`\`\`

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

## TODO: Topics to Expand

- Control callbacks (setValue, getValue, changed)
- Broadcaster integration  
- External file includes
- Complex mouse interaction patterns (dragging, resizing)
- Keyboard focus and key handling
- Performance optimization (partial repaints)
- Animation easing functions
`
  }
];

/**
 * Format a style guide as Markdown for human/agent readability
 */
export function formatStyleGuideAsMarkdown(guide: StyleGuide): string {
  return guide.content;
}
