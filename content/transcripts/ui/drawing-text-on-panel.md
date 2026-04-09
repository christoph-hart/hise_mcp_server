---
title: "HISE: Drawing text on a panel"
summary: "Covers the three Graphics text-drawing methods available in panel paint routines: drawText, drawAlignedText, and drawFittedText with multi-line wrapping and horizontal scaling."
channel: "David Healey"
videoId: "eLY5XuG5kTA"
url: "https://youtube.com/watch?v=eLY5XuG5kTA"
publishDate: "2022-10-08"
views: 0
likes: 0
duration: 265
domain: "ui"
---

# HISE: Drawing text on a panel — David Healey

## Introduction

This recipe covers the three methods for drawing text inside a panel's paint routine: `drawText` for simple centred single-line text, `drawAlignedText` for explicit alignment, and `drawFittedText` for multi-line wrapping with control over line count and horizontal scaling.

## Drawing text on a panel — core API [00:00]

Use the panel's paint routine to draw text with three `Graphics` methods. Get the panel bounds once and reuse across calls.

```javascript
// Inside paintRoutine: function(g)
var area = this.getLocalBounds(0); // returns [x, y, w, h]

g.fillAll(0xFF000000); // black background
g.setColour(0xFFFFFFFF); // white text

// 1. drawText — single line, auto-centred, truncates with "..." if too long
g.drawText("Your text here", area);

// 2. drawAlignedText — single line with explicit alignment
g.drawAlignedText("Your text here", area, "left"); // "left" | "centred" | "right"

// 3. drawFittedText — multi-line with alignment, line limit, and horizontal scale
var t = "Long text string goes here...";
g.drawFittedText(t,       // text
                 area,    // bounds array
                 "left",  // alignment: "left" | "centred" | "right"
                 5,       // maxLines: wraps up to this many lines, then truncates
                 1.0);    // horizontalScale: 1.0 = no squash
```

## drawFittedText — maxLines and horizontal scaling [02:30]

- **maxLines** caps how many lines the text may occupy. Text beyond that cap is truncated. Setting `maxLines = 1` makes it behave like `drawText` but with controllable alignment.
- **horizontalScale** (float, 0.0–1.0) squashes glyphs horizontally to force text into the available width. `1.0` = no squashing; `0.0` = renderer chooses default. The effect is only visible when text is long relative to panel width.

```javascript
// Equivalent to drawText but left-aligned:
g.drawFittedText(t, area, "left", 1, 1.0);

// Wrap over up to 5 lines, allow renderer to squash horizontally:
g.drawFittedText(t, area, "left", 5, 0.0);
```
