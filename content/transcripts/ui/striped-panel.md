---
title: "How to paint a striped panel in HISE"
summary: "How to draw alternating-colour vertical, horizontal, or diagonal stripes on a Panel using a paint routine loop with g.fillRect and g.rotate."
channel: "David Healey"
videoId: "nmB_Ml-XWGg"
url: "https://youtube.com/watch?v=nmB_Ml-XWGg"
publishDate: "2024-04-27"
views: 0
likes: 0
duration: 292
domain: "ui"
---

# How to paint a striped panel in HISE — David Healey

## Introduction

This recipe shows how to draw alternating-colour stripes on a Panel using its paint routine. It covers vertical, horizontal, and diagonal (rotated) stripe patterns using a simple loop with modulo-based colour alternation.

## Paint a Striped Panel Using a Loop and Paint Routine [00:00]

1. Add a Panel and get a script reference (right-click the Panel in the Interface Editor, choose "Create script variable definition").

2. Assign a paint routine. Use `this.getLocalBounds(0)` to get the panel's `[x, y, w, h]` array, then loop through stripe count, alternating colours with modulo:

```javascript
const var Panel1 = Content.getComponent("Panel1");

Panel1.setPaintRoutine(function(g)
{
    local a = this.getLocalBounds(0); // [x, y, w, h]
    local numStripes = 10;
    local stripeWidth = a[2] / numStripes;

    for (local i = 0; i < numStripes; i++)
    {
        // Alternate between itemColour and itemColour2
        if (i % 2 == 0)
            g.setColour(this.get("itemColour"));
        else
            g.setColour(this.get("itemColour2"));

        g.fillRect([i * stripeWidth, 0, stripeWidth, a[3]]);
    }
});
```

3. Set stripe colours via the Panel's `itemColour` and `itemColour2` properties (e.g. `0xFFFF0000` and `0xFFFFFFFF`). These are read at paint time so they can be changed dynamically.

## Horizontal and Diagonal Stripe Variations [02:30]

**Horizontal stripes** — swap the axes:

```javascript
local stripeHeight = a[3] / numStripes;
g.fillRect([0, i * stripeHeight, a[2], stripeHeight]);
```

**Diagonal stripes at 45 degrees** — rotate the graphics context before drawing vertical stripes:

```javascript
// Add before the stripe loop, inside the paint routine:
g.rotate(Math.toRadians(45), a[2] / 2, a[3] / 2);
// Then draw vertical stripes as normal — they appear at 45 degrees.
// Note: rotation clips at panel edges; stripes near corners will be cut.
```

`Math.toRadians()` converts degrees to radians — HISE expects radians for `g.rotate()`.
