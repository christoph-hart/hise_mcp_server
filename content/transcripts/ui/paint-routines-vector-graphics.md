---
title: "HISE Paint Routines + vector graphics."
summary: "A comprehensive guide to drawing vector graphics in HISE using paint routines, covering shapes (lines, rectangles, circles, triangles), text rendering, fonts, drop shadows, gradients, and building interactive button menus with mouse callbacks."
channel: "David Healey"
videoId: "ZjRRcOmTtqI"
url: "https://youtube.com/watch?v=ZjRRcOmTtqI"
publishDate: "2019-12-30"
views: 1752
likes: 52
duration: 4630
domain: "ui"
---

# HISE Paint Routines + vector graphics. — David Healey

## Introduction

This recipe covers how to draw vector graphics directly in HISE using paint routines on Panel components. You will learn to draw primitive shapes (lines, rectangles, circles, triangles), render and style text with custom fonts, apply drop shadows and gradients, and build a fully interactive vertical button menu with mouse callbacks and hover states. Vector graphics in HISE are resolution-independent, use far less RAM than image strips, and render in real time — making them ideal for scalable plugin GUIs.

## Assigning a Paint Routine to a Panel and Using the Graphics Object [06:50]

```js
PNL_canvas.setPaintRoutine(function(g)
{
    // g (graphics object) is provided by HISE — all drawing commands are on it.
    // Full list browsable in the API collection under "Graphics".

    // Fill the entire panel area with a solid color (no coordinates needed).
    // Hex format: 0xAARRGGBB — AA=alpha, FF=opaque, 7D≈50%
    g.fillAll(0xFFFF0000); // fully opaque red
});
```

Once a paint routine is assigned, the panel relies entirely on it for rendering — if the routine is empty, the panel will be invisible.

## Drawing Lines with g.drawLine() [10:30]

```js
// g.drawLine(x1, x2, y1, y2, thickness) — thickness is a float
// Inside a paint routine, `this` refers to the owning panel.

// Set stroke color first — note British spelling: setColour
// Applies to all subsequent draw calls until overridden. Does not leak between panels.
g.setColour(0xFFFFFFFF); // white

// Horizontal line, full width, at y=50
g.drawLine(0, this.getWidth(), 50, 50, 10.0);

// Inset from edges
g.drawLine(100, this.getWidth() - 100, 50, 50, 5.0);

// Diagonal line: different y1/y2. Vertical line: same x1/x2.
```

## Drawing and Filling Rectangles (Outlines, Fills, and Rounded Corners) [16:34]

All area parameters use the same `[x, y, width, height]` format across every shape function.

```js
var area = [50, 50, 200, 100];

// --- Sharp rectangles ---
g.setColour(0xFF000000);
g.fillRect(area);                    // filled — no border parameter

g.setColour(0xFFFFFFFF);
g.drawRect(area, 2.0);              // outline — borderSize is a float

// --- Rounded rectangles ---
// cornerSize: 0 = sharp, higher = more rounding, very high ≈ circle
g.setColour(0xFF000000);
g.fillRoundedRectangle(area, 8);    // filled rounded

g.setColour(0xFFFFFFFF);
g.drawRoundedRectangle(area, 8, 2.0); // outline rounded — cornerSize, then borderSize
```

Z-order is determined by draw call order — later calls paint over earlier ones. To combine a fill with an outline (e.g. black fill, white border), draw the fill first, then the outline on top.

## Drawing Circles and Ellipses with fillEllipse and drawEllipse [24:43]

Naming convention: `fill` = solid shape, `draw` = outline. Consistent across all shape types.

```js
// Same [x, y, width, height] format as rectangles
g.setColour(0xFFFF0000);
g.fillEllipse([50, 50, 100, 100]);       // circle (equal width/height)
g.fillEllipse([50, 50, 200, 100]);       // oval (different width/height)

g.setColour(0xFFFFFFFF);
g.drawEllipse([50, 50, 100, 100], 2.0);  // circle outline — extra param is stroke thickness
```

## Drawing Triangles with fillTriangle and Converting Degrees to Radians [27:19]

```js
// fillTriangle(area, angle) — angle is in RADIANS, not degrees
// At angle 0, base sits at the bottom (point up)
g.fillTriangle([50, 50, 100, 100], 0);

// Flip upside down (base at top)
g.fillTriangle([50, 50, 100, 100], Math.toRadians(180));

// Rotate 90 degrees
g.fillTriangle([50, 50, 100, 100], Math.toRadians(90));
```

## Drawing Text and Changing Fonts [30:42]

Use `g.drawAlignedText()` (not the older `g.drawText()`) — it supports justification.

```js
// Set font and color before drawing (same pattern as setColour)
g.setFont("Arial", 24);
g.setColour(0xFFFFFFFF);

// drawAlignedText(text, [x, y, width, height], alignment)
// Valid alignments: "left", "centred", "right" — note British spelling
g.drawAlignedText("Hello", [100, 50, 200, 50], "centred");

// Position relative to panel bottom — 50px tall text area flush with bottom edge
g.drawAlignedText("Bottom", [100, this.getHeight() - 50, 200, 50], "left");
```

Alignment strings must match exactly including capitalisation. Text color follows the last `g.setColour()` call.

## Loading Custom Fonts with Engine.loadFontAs() [34:24]

Use `loadFontAs()` (not `loadFont()`) — the older command causes cross-platform naming issues. `loadFontAs` lets you assign an explicit ID.

```js
// In onInit — load fonts at startup. One call per font, no limit.
// Path uses {PROJECT_FOLDER} wildcard; keep fonts in Images/Fonts/
Engine.loadFontAs("{PROJECT_FOLDER}Fonts/OxygenBold.ttf", "oxygen");
Engine.loadFontAs("{PROJECT_FOLDER}Fonts/OxygenLight.ttf", "oxygenLight");
```

```js
// In a paint routine — reference fonts by the ID you assigned, not the filename
g.setFont("oxygen", 24);

// Drawing text with a background: paint background FIRST, then text on top.
// Restore text color after setting the background fill, or text inherits it.
var area = [50, 50, 200, 40];
g.setColour(0xFF333333);
g.fillRoundedRectangle(area, 5);  // use fill, not draw (outline)
g.setColour(0xFFFFFFFF);          // restore text color
g.drawAlignedText("Label", area, "centred");
```

Justification options: `"left"`, `"right"`, `"centred"`, `"centredTop"`, `"centredBottom"` — positions text within the bounds rectangle you define.

## Adding Drop Shadows to UI Elements [41:21]

Use `g.drawDropShadow()` for painted shapes; `g.addDropShadowFromAlpha()` is for imported images only.

```js
// Draw shadow BEFORE the background so it appears behind it.
// Color is passed directly — no g.setColour() needed. Radius controls fuzziness.
var bgArea = [50, 50, 200, 100];

// Shrink the shadow area slightly so the fuzzy edge extends beyond the background.
// If areas match exactly, the blur starts at the boundary and is barely visible.
// Shrink by 10px total, offset by 5px to re-center.
var shadowArea = [55, 55, 190, 90];
g.drawDropShadow(shadowArea, 0xFF000000, 10);

// Background must be fully opaque — semi-transparent fills let the shadow bleed through
g.setColour(0xFF444444);
g.fillRoundedRectangle(bgArea, 5);
```

## Using setGradientFill to Apply Linear Gradient Fills [44:42]

`setGradientFill` only defines the fill state — it does not draw anything. You must draw a shape afterwards (same pattern as `setColour`). Works with any shape: rect, circle, rounded rect, etc.

```js
// setGradientFill([color1, x1, y1, color2, x2, y2])
// x1/y1 → x2/y2 defines the gradient direction (like drawing a line)

// Vertical gradient, full panel height — keep x1 == x2 for straight vertical
// (differing x values will angle the gradient diagonally)
g.setGradientFill([0xFFFF0000, this.getWidth() / 2, 0,       // red at top
                   0xFF0000FF, this.getWidth() / 2, this.getHeight()]); // blue at bottom

// Now draw a shape to apply the gradient
g.fillRect([0, 0, this.getWidth(), this.getHeight()]);
```

## Building a Vertical Button Menu Panel with Paint Routines [49:22]

```js
// Define labels at top level — easy to change without touching paint logic
const var labels = ["Item 1", "Item 2", "Item 3", "Kristoff"];

const var ROW_HEIGHT = 50;
const var GAP = 10;

PNL_menu.setPaintRoutine(function(g)
{
    g.fillAll(0x80000000); // half-opacity black background
    g.setFont("Oxygen", 18);

    // Compute Y once per iteration — reuse for both rect and text
    for (var i = 0; i < labels.length; i++)
    {
        var y = i * (ROW_HEIGHT + GAP);

        g.setColour(0xFFAAAAAA);
        g.fillRect([0, y, this.getWidth(), ROW_HEIGHT]);

        g.setColour(0xFFFFFFFF);
        g.drawAlignedText(labels[i], [10, y, this.getWidth(), ROW_HEIGHT], "left");
    }
});
```

Inside a paint routine, `this` always refers to the owning panel. If you reuse a routine across multiple panels, `this` resolves to whichever panel is currently being painted. Set the panel height to exactly fit `labels.length * (ROW_HEIGHT + GAP)` once the item count is fixed.

## Implementing Mouse Callbacks for Interactive Button Panels [59:11]

Enable mouse callbacks in the panel properties first — they are disabled by default to save CPU. Set to "Clicks Only" initially, or "Clicks and Hover" if you want hover highlighting.

```js
PNL_menu.setMouseCallback(function(e)
{
    // Calculate which virtual button was hit from Y position
    // (gaps between drawn buttons count as valid hit areas)
    var value = parseInt(e.y / this.getHeight() * labels.length);

    if (e.clicked)
    {
        this.setValue(value);  // prefer `this` over explicit panel name
        this.repaint();        // without this, visual state won't update
    }
    else
    {
        // Hover — requires "Clicks and Hover" callback mode
        // e.hover: 1 = inside panel, 0 = outside
        this.data.hoverIndex = value;  // this.data stores arbitrary persistent state
        this.repaint();
    }
});
```

In the paint routine, compare loop index `i` against `this.getValue()` for the selected item and `this.data.hoverIndex` for hover highlighting — change the background color accordingly.

## Per-Item Hover Tracking, Callback Levels, and Drag Callbacks [71:35]

1. Separate hover index from click value: The panel's `value` tracks which item was clicked; a separate `this.data.hoverIndex` tracks which item is currently hovered. These must be independent because the selected item and the hovered item can differ simultaneously.

2. Set `this.data.hoverIndex = value` before the `if` statement in the mouse callback, so it is updated on every mouse event regardless of whether the click branch or the hover branch executes.

3. If hover highlighting only updates when the mouse enters or leaves the panel (not while moving within it), the callback level is set too low. Change `allowCallbacks` to `"All Callbacks"` to receive move events within the panel boundary.

4. Beyond hover and mouse-up, the panel callback system also provides mouse-down, mouse-down-with-hover, mouse-up-with-hover, and drag states — giving up to six distinct button states for a single panel item.

5. Drag callbacks enable custom sliders and knobs drawn entirely with paint routines, reacting to click-and-drag gestures.

6. RAM advantage of vectors over image strips: a PNG knob strip with 64 frames loads all 64 frames into RAM as uncompressed bitmaps, potentially consuming hundreds of MB for high-resolution graphics. A vector paint routine renders only the current frame on demand; only one frame occupies RAM at any time, with negligible processing overhead.
