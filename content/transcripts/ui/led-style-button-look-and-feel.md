---
title: "How I made this LED style button in HISE using Look and Feel"
summary: "Step-by-step recipe for drawing a realistic LED toggle button entirely in HiseScript using a local Look and Feel, covering layered gradient fills, radial gradients, drop shadow glow effects, and interactive hover/press feedback."
channel: "David Healey"
videoId: "--8UcfOLZiE"
url: "https://youtube.com/watch?v=--8UcfOLZiE"
publishDate: "2024-12-14"
views: 10591
likes: 146
duration: 3697
domain: "ui"
---

# How I made this LED style button in HISE using Look and Feel — David Healey

## Introduction

This recipe walks through creating a realistic LED-style toggle button in HISE using only HiseScript drawing — no images required. The button is built up from layered gradient-filled circles, rim highlights, and a radial-gradient LED dome, with a glowing drop-shadow effect for the ON state and opacity-based hover/press feedback. All colours are driven by component properties, making the LAF reusable across differently-coloured button instances.

## Setting Up a Local Look and Feel for a Toggle Button [00:00]

1. Add a Button in the Interface Designer, name it `BTN_LED`, and set its size to 200×200. All dimensions in this tutorial are hardcoded for 200×200 — rescaling requires adjusting every value.

2. Use a **local** Look and Feel rather than global. Local LAF only affects the controls it is explicitly assigned to, keeping per-control customisation isolated.

3. Register the `drawToggleButton` function. The button disappears from the UI immediately after registration because HISE now expects your code to draw it entirely.

```javascript
// Get a script reference to the button
const var BTN_LED = Content.getComponent("BTN_LED");

// Create a local LAF — named to match the button it belongs to
const var laf_BTN_LED = Content.createLocalLookAndFeel();
BTN_LED.setLocalLookAndFeel(laf_BTN_LED);

// Create a path for the highlight glow (must be at init scope, not inside the callback)
const var p = Content.createPath();
p.addEllipse([0, 0, 10, 10]);

laf_BTN_LED.registerFunction("drawToggleButton", function(g, obj)
{
    // obj properties available:
    // obj.area       -> [x, y, w, h]
    // obj.over       -> bool (mouse hover)
    // obj.down       -> bool (mouse pressed)
    // obj.value      -> bool (on/off state)
    // obj.bgColour, obj.itemColour1, obj.itemColour2, obj.textColour

    local a = obj.area;
    local c1;
    local c2;

    // ... all drawing code goes inside this callback
});
```

Note: LAF `registerFunction` callbacks use plain `function(g, obj)` — this is the exception to the `inline function` rule, because LAF callbacks are not called from the audio thread.

Use `Console.print(trace(obj))` during development to inspect all available properties.

## Drawing the Outer Ring with Gradient Fills [05:00]

The button is built as concentric circles, each drawn with gradient fills to create depth. Declare `c1` and `c2` once and reassign them for each gradient — avoids repeated local declarations.

1. **Outer circle — vertical gradient** from semi-transparent background colour to fully transparent:

```javascript
c1 = Colours.withAlpha(obj.bgColour, 0.5);
c2 = 0x00000000; // fully transparent

g.setGradientFill([c1, a[0], a[1],
                   c2, a[0], a[1] + a[3]]);
g.fillEllipse([a[0] + 4, a[1] + 4, a[2] - 8, a[3] - 8]);
```

`Colours.withAlpha(colour, alpha)` takes a packed `0xAARRGGBB` colour and replaces the alpha channel with the supplied float (0.0–1.0). Using `obj.bgColour` keeps the paint routine data-driven — change the colour in the Properties panel without touching code.

2. **Outer shell — diagonal gradient** (top-left dark to bottom-right transparent) for 3D shading:

```javascript
c1 = Colours.withAlpha(obj.bgColour, 0.5);
c2 = 0x00000000;

// Diagonal: gradient coords go from top-left to bottom-right of the inset circle
g.setGradientFill([c1, a[0] + 4, a[1] + 4,
                   c2, a[2] - 8, a[3] - 8]);
g.fillEllipse([a[0] + 4, a[1] + 4, a[2] - 8, a[3] - 8]);
```

3. **Bottom highlight arc** — a stroked ellipse with a vertical gradient that only illuminates the lower portion:

```javascript
c1 = Colours.withAlpha(Colours.white, 0.05); // very subtle; use 0.5 while authoring
c2 = 0x00000000;

g.setGradientFill([c1, a[2] / 2, a[3],       // bottom-center
                   c2, a[2] / 2, a[3] - 50]); // 50px up from bottom
g.drawEllipse([a[0], a[1], a[2] - 5, a[3] - 5], 10);
```

`g.drawEllipse` strokes an outline (not a fill). The line thickness is the last parameter. The `-5` positions this ellipse just outside the inner circle so the highlight sits on the outer edge.

**Inset math pattern:** To inset a circle by N pixels on each side, add N to x/y and subtract 2N from width/height: `+4` on position means `-8` on dimensions.

## Drawing the Button Body and Rim Highlights [15:00]

1. **Inner background circle** — flat colour with alpha transparency:

```javascript
g.setColour(Colours.withAlpha(obj.bgColour, 0.5));
g.fillEllipse([a[0] + 15, a[1] + 15, a[2] - 30, a[3] - 30]);
```

2. **Button body** — vertical gradient that darkens toward the bottom for 3D depth:

```javascript
c1 = Colours.withAlpha(obj.itemColour1, 0.5);
c2 = Colours.withAlpha(obj.itemColour1, 0.3);

g.setGradientFill([c1, a[2] / 2, a[1],       // top center
                   c2, a[2] / 2, a[1] + a[3]]); // bottom center
g.fillEllipse([a[0] + 25, a[1] + 25, a[2] - 50, a[3] - 50]);
```

Note: The UI editor calls this "Item Colour" but the LAF `obj` property is `obj.itemColour1`.

3. **Top highlight ring** — stroked ellipse with a vertical gradient visible only at the top:

```javascript
c1 = Colours.withAlpha(Colours.white, 0.1);
c2 = 0x00000000;

g.setGradientFill([c1, a[2] / 2, 0,    // gradient start: top-center
                   c2, a[2] / 2, 100]); // gradient end: 100px down

// +2 / -2 compensates for half the stroke thickness (4/2=2) so the stroke stays inside
g.drawEllipse([a[0] + 25 + 2, 25 + 2, a[2] - 50 - 2, a[3] - 50 - 2], 4);
```

**Common mistake:** If you get "argument amount mismatch", you forgot to wrap the area in `[]`. `fillEllipse` and `drawEllipse` take a single array argument, not four separate values.

## Painting the LED Circle with Radial Gradients [25:00]

`g.setGradientFill` takes an optional 7th element: pass `true` to make the gradient radial. Without it (or with 6 elements), the gradient is linear.

For a radial gradient, the coordinate pairs mean:
- `x1, y1`: the center point where colour C1 originates
- `x2, y2`: a point on the outer edge where C2 ends

1. **LED body — radial gradient** from a highlight centre to a dark edge:

```javascript
c1 = Colours.withAlpha(obj.itemColour1, 0.8);
c2 = Colours.withAlpha(Colours.black, 0.3);

g.setGradientFill([c1, a[2] / 2, a[3] / 2,        // centre of circle
                   c2, a[0] + 75, a[1] + 75,       // outer radius point
                   true]);                           // radial mode
g.fillEllipse([a[0] + 75, a[1] + 75, a[2] - 150, a[3] - 150]);
```

2. **LED low-highlight arc** — linear gradient from bottom upward, drawn as a stroked ellipse:

```javascript
c1 = Colours.withAlpha(Colours.white, 0.3);
c2 = 0x00000000;

g.setGradientFill([c1, a[2] / 2, a[3],         // bottom centre
                   c2, a[2] / 2, a[3] - 95]);   // 95px up
g.drawEllipse([a[0] + 75, a[1] + 75, a[2] - 150, a[3] - 150], 2);
```

**Tip:** To verify placement, temporarily replace `g.setGradientFill()` with `g.setColour(Colours.red)` to see the raw shape, then restore the gradient.

## Adding a Diffused Highlight Using drawDropShadowFromPath [35:00]

`g.drawDropShadowFromPath` paints a soft, feathered glow from any path shape — useful for "inner glow" or "soft highlight" effects. The path version lets you use any shape as the source; the blur radius controls spread, opacity controls strength.

The path must be created at init scope (not inside the callback) to avoid per-repaint allocation:

```javascript
// Already created at init scope:
// const var p = Content.createPath();
// p.addEllipse([0, 0, 10, 10]);

// Inside the LAF callback — off-state highlight:
c1 = Colours.withAlpha(Colours.white, 0.3);

g.drawDropShadowFromPath(
    p,                                              // path shape
    [a[0] + 90, a[1] + 88, a[2] - 190, a[3] - 190], // draw area (offset for one-sided glint)
    c1,                                              // colour
    10,                                              // blur radius — higher = more diffuse
    [0, 0]                                           // offset [x, y]
);
```

The draw area is intentionally offset from centre to create a one-sided glint effect. Centering both offset values (e.g. both at 90) would produce a centered shadow; shifting them asymmetrically pushes the highlight to one side. This highlight is static — it renders on both ON and OFF states as a permanent surface reflection.

## Drawing the ON State with Layered Gradients and LED Glow [40:00]

When the button is pressed (`obj.value == true`), several layers change: the background darkens, highlights take on the LED colour (`obj.itemColour2`), and the LED glows outward. All effects are achieved by adding `if (obj.value)` branches to existing draw sections.

1. **Darkening overlay** on the button body — stacked over the existing fill:

```javascript
if (obj.value)
{
    c1 = Colours.withAlpha(Colours.black, 0.1);
    c2 = Colours.withAlpha(Colours.black, 0.3);

    g.setGradientFill([c1, a[2] / 2, a[1],
                       c2, a[2] / 2, a[1] + a[3]]);
    g.fillEllipse([a[0] + 25, a[1] + 25, a[2] - 50, a[3] - 50]);
}
```

2. **Upper and lower highlight bands** tinted with the LED colour:

```javascript
if (obj.value)
{
    c1 = Colours.withAlpha(obj.itemColour2, 0.08);
    c2 = 0x00000000;

    // Upper highlight
    g.setGradientFill([c1, a[2] / 2, a[1],
                       c2, a[2] / 2, a[1] + 50]);
    g.drawEllipse([a[0] + 25, a[1] + 25, a[2] - 50, a[3] - 50], 4);

    // Lower highlight — gradient direction inverted (bottom to top)
    g.setGradientFill([c1, a[2] / 2, a[1] + a[3],
                       c2, a[2] / 2, a[1] + a[3] - 100]);
    g.drawEllipse([a[0] + 25, a[1] + 25, a[2] - 50, a[3] - 50], 4);
}
```

3. **Illuminated LED — radial gradient with triple-layered drop shadows:**

```javascript
if (obj.value)
{
    // Create a path for the LED glow
    local pL = Content.createPath();
    pL.addEllipse(a);

    // Radial gradient: LED colour at centre fading to black at edge
    c1 = Colours.withAlpha(obj.itemColour2, 0.8);
    c2 = Colours.withAlpha(Colours.black, 0.3);

    g.setGradientFill([c1, a[2] / 2, a[3] / 2,
                       c2, a[0] + 75, a[1] + 75,
                       true]);
    g.fillEllipse([a[0] + 75, a[1] + 75, a[2] - 150, a[3] - 150]);

    // Three layered drop shadows — progressively larger radius = soft outer glow
    local glowCol = Colours.withAlpha(obj.itemColour2, 0.8);
    local glowArea = [a[0] + 81, a[1] + 81, a[2] - 163, a[3] - 163];

    g.drawDropShadowFromPath(pL, glowArea, glowCol, 5, [0, 0]);  // tight core
    g.drawDropShadowFromPath(pL, glowArea, glowCol, 20, [0, 0]); // mid halo
    g.drawDropShadowFromPath(pL, glowArea,
        Colours.withAlpha(Colours.white, 0.5), 50, [0, 0]);       // wide white bloom
}
```

Layering shadows at radii 5 / 20 / 50 approximates physical light falloff: a bright core, a mid halo, and a soft ambient bloom. Each pass is cheap and together they produce a convincing LED glow without texture assets.

4. **Top highlight — vary opacity and radius by state** using ternary expressions:

```javascript
local highlightOpacity = obj.value ? 0.5 : 0.3;
local shadowRadius = obj.value ? 5 : 10;
```

A tighter radius looks sharper/brighter when ON; a larger one looks diffuse/dim when OFF.

## Adding Hover and Press Feedback via Opacity Modulation [55:00]

The background is a black circle drawn behind all other layers. Because every layer above it has some transparency, changing the background opacity bleeds through the entire stack — so you only need to touch one colour value to affect the entire button appearance. This is the key insight: use the background layer as a global dimmer.

```javascript
// Background circle opacity — handles all three visual states in one expression
// obj.value = 1 when ON, obj.over = 1 when hovering, obj.down = 1 when pressed
local bgOpacity = obj.value ? (1.0 - obj.down * 0.3) : (obj.over ? 0.7 : 0.5);

g.setColour(Colours.withAlpha(0xFF000000, bgOpacity));
g.fillEllipse([a[0] + 15, a[1] + 15, a[2] - 30, a[3] - 30]);
```

Increasing the subtracted value (e.g. `0.7` instead of `0.3`) makes the click darken the button more dramatically. Adjust until the feedback feels right.

## Making the LED Button Reusable with Colour Properties [60:00]

By driving all colours from component properties (`obj.bgColour`, `obj.itemColour1`, `obj.itemColour2`), any number of buttons can share the same LAF object while each displays a different colour. Set each button's colour properties independently in the Interface Designer or via script:

```javascript
BTN_LED.set("itemColour2", 0xFFFF0000); // red LED
```

The LAF callbacks read these properties at paint time, so all gradient layers — the LED fill, the rim highlights, the diffuse glow — update automatically. No additional code is needed per button instance.

**Techniques summary:**
- Radial gradients for the LED dome fill
- Linear gradients for rim lighting and depth
- Layering multiple semi-transparent gradient passes to build 3D depth
- `drawDropShadowFromPath` for diffuse/bloom glow effects
- Opacity modulation on the base layer for hover/press feedback propagation
