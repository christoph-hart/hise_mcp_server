---
title: "HISE Custom mouse cursor"
summary: "Shows how to set a custom mouse cursor on a ScriptPanel using an SVG path, with colour tinting and hit-point positioning, and how to apply it instrument-wide."
channel: "David Healey"
videoId: "zyapPgEN9kw"
url: "https://youtube.com/watch?v=zyapPgEN9kw"
publishDate: "2022-08-20"
views: 0
likes: 0
duration: 277
domain: "ui"
---

# HISE Custom mouse cursor — David Healey

## Introduction

This recipe shows how to set a custom mouse cursor on a ScriptPanel using an SVG path converted to path data, with colour tinting and configurable hit-point positioning.

## Setting up a custom mouse cursor on a Panel [00:00]

1. Convert an SVG icon to path data using the HISE Path Converter tool. Bootstrap Icons is a good free source for icon SVGs.

2. Create a `Path` object from the data and apply it with `setMouseCursor`:

```javascript
const var svgData = [/* numbers from Path Converter */];

const var cursor = Content.createPath();
cursor.loadFromData(svgData);

const var Panel1 = Content.getComponent("Panel1");

Panel1.setMouseCursor(cursor, Colours.green, [0.5, 0.5]);
// arg 1: Path object (the icon shape)
// arg 2: colour (0xAARRGGBB or Colours constant)
// arg 3: hit-point [x, y] in 0.0–1.0 — [0.5, 0.5] centres the hotspot
```

## Applying the cursor instrument-wide and handling child components [02:30]

To apply the custom cursor across the entire instrument UI, resize the Panel to cover the full UI dimensions. Any area under that Panel shows the custom cursor.

- Child components placed *inside* the Panel automatically inherit the Panel's cursor.
- Sibling components (not children) revert to the default system arrow when hovered.
- To keep a consistent cursor over all controls, parent every control inside the full-size Panel.
- Alternatively, call `setMouseCursor` on multiple Panels individually for different cursors per region.
