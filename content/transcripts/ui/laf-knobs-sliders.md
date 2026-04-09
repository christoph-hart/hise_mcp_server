---
title: "Look and Feel Knobs and Sliders"
summary: "Complete guide to customising rotary knobs, horizontal sliders, and vertical sliders using drawRotarySlider and drawLinearSlider LAF functions, with canvas rotation for knob indicators and style-based orientation detection."
channel: "David Healey"
videoId: "PykrsXv8aqg"
url: "https://youtube.com/watch?v=PykrsXv8aqg"
publishDate: "2022-07-09"
views: 0
likes: 0
duration: 1831
domain: "ui"
---

# Look and Feel Knobs and Sliders — David Healey

## Introduction

This recipe covers how to customise all three slider styles in HISE using Look and Feel: rotary knobs via `drawRotarySlider`, and horizontal/vertical sliders via `drawLinearSlider` with style-based orientation detection.

## Rotary slider (knob) — drawRotarySlider [02:55]

Register the LAF callback and draw two concentric ellipses for the knob body, then use `g.rotate()` to position a value indicator.

```javascript
const var LAF = Engine.createGlobalScriptLookAndFeel();

LAF.registerFunction("drawRotarySlider", function(g, obj)
{
    var a = obj.area;

    // Outer circle — background colour
    g.setColour(obj.bgColour);
    g.fillEllipse(a);

    // Inner circle — itemColour1, inset by 10px
    g.setColour(obj.itemColour1);
    g.fillEllipse([10, 10, a[2] - 20, a[3] - 20]);

    // Rotate canvas for value indicator
    var start = 2.5; // radians — 7 o'clock position at value 0
    var end = start * 2.0 * obj.valueNormalized - start;
    g.rotate(end, [a[2] / 2, a[3] / 2]);

    // Indicator rectangle (drawn at fixed coords, canvas rotates under it)
    var indicatorW = 8;
    var indicatorH = 30;
    g.setColour(obj.itemColour2);
    g.fillRoundedRectangle([(a[2] / 2) - (indicatorW / 2), 8, indicatorW, indicatorH], 5);
});
```

**How the rotation formula works:**

| Term | Purpose |
|---|---|
| `start` (2.5 rad) | Where the indicator sits at value 0 (~7 o'clock) |
| `start * 2.0` | Total sweep in radians (full arc from 7 o'clock to 5 o'clock) |
| `* obj.valueNormalized` | Scales to 0–1 regardless of slider's actual min/max |
| `- start` | Shifts rotation so 0 begins at the start position |

`g.rotate(angle, [cx, cy])` rotates the entire canvas around the centre point. Changing `start` moves both endpoints; changing the multiplier changes the total arc.

## Horizontal slider — drawLinearSlider with obj.style == 2 [14:20]

`drawLinearSlider` handles both horizontal and vertical sliders. Use `obj.style` to distinguish: `2` = horizontal, `3` = vertical, `9` = range. Don't use width/height ratio — a horizontal slider can be taller than it is wide.

```javascript
LAF.registerFunction("drawLinearSlider", function(g, obj)
{
    var a = obj.area;
    g.fillAll(obj.bgColour);
    g.setColour(obj.itemColour1);

    if (obj.style == 2) // Horizontal
    {
        var padW = a[2] / 4;
        var x = (a[2] - padW - 4) * obj.valueNormalized + 2;
        g.fillRoundedRectangle([x, 2, padW, a[3] - 4], 5);
    }
    else if (obj.style == 3) // Vertical
    {
        // ... see below
    }
});
```

`obj.valueNormalized` is always 0–1, so bipolar sliders (e.g. -1 to 1) work without extra mapping.

## Vertical slider — drawLinearSlider with obj.style == 3 [25:38]

The y-axis is inverted (y=0 is the top), so the position calculation must be reversed:

```javascript
    else if (obj.style == 3) // Vertical
    {
        var padH = a[3] / 4;
        var px = a[0] + 2;
        var pw = a[2] - 4;

        // Inverted y-axis + top/bottom inset
        var y = (a[3] + 4) - (a[3] + 2) * obj.valueNormalized - padH;

        g.fillRoundedRectangle([px, y, pw, padH], 5);
    }
```

Without inversion, the paddle moves downward as value increases — the opposite of expected behaviour. The small offset asymmetry (`+4` and `+2`) creates equal top and bottom insets.
