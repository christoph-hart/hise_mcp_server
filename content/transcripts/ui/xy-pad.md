---
title: "How to make an XY pad in HISE"
summary: "Builds an XY pad control from a ScriptPanel with mouse tracking, normalised 0-1 data storage, clamped dot rendering, and wiring to LFO modulators via CC Modulator default values."
channel: "David Healey"
videoId: "NYc44pKQHxA"
url: "https://youtube.com/watch?v=NYc44pKQHxA"
publishDate: "2022-10-22"
views: 764
likes: 33
duration: 1045
domain: "ui"
---

# How to make an XY pad in HISE — David Healey

## Introduction

This recipe walks through building a custom XY pad control using a ScriptPanel. You'll set up mouse tracking, normalise coordinates to a 0–1 range, clamp the dot within bounds, and wire the X/Y values to LFO modulators via CC Modulator default values.

## Panel setup and drawing the XY dot [00:00]

Create a Panel component in the interface designer. Name it `PlXY`. Set a background colour and an item colour (e.g. grey background, red dot). Set **Allow Callbacks** to "All Callbacks".

```javascript
const var PlXY = Content.getComponent("PlXY");
const var size = 30; // dot diameter in pixels

PlXY.setPaintRoutine(function(g)
{
    g.fillAll(this.get("bgColour"));
    g.setColour(this.get("itemColour"));

    // Convert normalised 0–1 data back to pixel coordinates
    var x = this.data.x * (this.getWidth() - size);
    var y = this.data.y * (this.getHeight() - size);

    g.fillEllipse([x, y, size, size]);
});
```

Inside `setPaintRoutine`, `this` refers to the panel itself, giving access to its properties like `bgColour` and `itemColour`.

## Capturing mouse input and storing normalised coordinates [02:30]

Set up the mouse callback to respond to both click and drag. Store normalised 0–1 values on the panel's `data` object, then call `this.changed()` to trigger the control callback.

```javascript
PlXY.setMouseCallback(function(event)
{
    if (event.clicked || event.drag)
    {
        // Normalise pixel position to 0–1 and clamp to bounds
        this.data.x = Math.range(event.x / this.getWidth(), 0.0, 1.0);
        this.data.y = Math.range(event.y / this.getHeight(), 0.0, 1.0);

        this.changed();  // triggers the control callback
        this.repaint();  // redraws the dot at the new position
    }
});
```

- `panel.data` is a built-in plain object on every ScriptPanel — add any custom properties freely.
- Dividing by `getWidth()`/`getHeight()` produces resolution-independent 0–1 values.
- `Math.range(value, 0.0, 1.0)` clamps so dragging outside the panel doesn't produce out-of-range values.

## Wiring the control callback [05:00]

Register a control callback using `inline function`. Inside control callbacks, use `component` (not `this`) to reference the panel.

```javascript
inline function onPlXYControl(component, value)
{
    Console.print("x: " + component.data.x + "  y: " + component.data.y);
    component.repaint();
}

PlXY.setControlCallback(onPlXYControl);
```

The normalised `data.x` and `data.y` values (0–1) are directly usable as multipliers for parameters — no further scaling needed at the output stage.

## Clamping the dot position within panel bounds [07:30]

When drawing the dot, subtract the dot size from the available range so the circle doesn't overflow the panel edge:

```javascript
// Inside paintRoutine
var drawnX = this.data.x * (this.getWidth() - size);
var drawnY = this.data.y * (this.getHeight() - size);
g.fillEllipse([drawnX, drawnY, size, size]);
```

The `data.x`/`data.y` values remain as clean 0–1 for downstream modulation. The pixel offset adjustment is only applied at draw time.

## Wiring the XY pad to LFO modulators via CC Modulator default values [10:00]

Add an LFO to a synth, then add two CC Modulator child modulators — one on Intensity, one on Frequency. Assign each an unused CC number (e.g. 94, 95) that won't conflict with hardware controllers. This exploits the CC Modulator's built-in smoothing.

```javascript
// Get references to the two CC modulators
const var mods = [
    Synth.getMidiProcessor("MIDI Controller 1"),
    Synth.getMidiProcessor("MIDI Controller 2")
];

inline function onPlXYControl(component, value)
{
    local x = component.data.x;  // 0.0 (left) to 1.0 (right)
    local y = component.data.y;  // 0.0 (top) to 1.0 (bottom)

    // X drives Intensity modulator (0–127)
    mods[0].setAttribute(mods[0].DefaultValue, 127 * x);

    // Y drives Frequency modulator — flip axis so bottom=low, top=high
    mods[1].setAttribute(mods[1].DefaultValue, 127 - (127 * y));
}

PlXY.setControlCallback(onPlXYControl);
```

Y must be flipped because screen Y increases downward (top=0, bottom=1), so without inversion "higher on screen" would map to higher values incorrectly for frequency.
