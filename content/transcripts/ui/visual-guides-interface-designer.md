---
title: "Adding visual guides to the interface designer"
summary: "How to use Content.addVisualGuide to draw temporary alignment lines and rectangles in the HISE Interface Designer for layout debugging."
channel: "David Healey"
videoId: "mEka2RSXywc"
url: "https://youtube.com/watch?v=mEka2RSXywc"
publishDate: "2024-03-03"
views: 0
likes: 0
duration: 132
domain: "ui"
---

# Adding visual guides to the interface designer — David Healey

## Introduction

This recipe shows how to use `Content.addVisualGuide()` to draw temporary alignment lines and rectangles directly in the HISE Interface Designer — useful for checking layout during development.

## Adding Visual Guides at Runtime [00:25]

Use `Content.addVisualGuide()` to overlay lines or rectangles in the Interface Designer. Pass a 2-element array for lines or a 4-element array for rectangles:

```javascript
// Horizontal line at y=200
Content.addVisualGuide([0, 200], Colours.white);

// Vertical line at x=100
Content.addVisualGuide([100, 0], Colours.white);

// Rectangle at (10, 10), size 100x100
Content.addVisualGuide([10, 10, 100, 100], Colours.red);

// Clear all guides — pass any non-array value
Content.addVisualGuide(0, 0);
```

Key points:
- `[0, y]` = horizontal line, `[x, 0]` = vertical line, `[x, y, w, h]` = rectangle.
- The colour parameter accepts hex values (`0xFFFFFFFF`) or `Colours.*` constants.
- Guides are visual-only and non-destructive — they have no effect on the compiled plugin.
- Do not pass a 2-element array with both values non-zero (e.g. `[50, 100]`) — it produces an undefined guide type.
