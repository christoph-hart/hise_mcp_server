---
title: "How to import vectors into HISE"
summary: "Shows how to convert SVG path data using the HISE Producer tool, load it into a Path object, and draw or fill it on a Panel with proper centering."
channel: "David Healey"
videoId: "OHqAijNUabU"
url: "https://youtube.com/watch?v=OHqAijNUabU"
publishDate: "2022-01-01"
views: 0
likes: 0
duration: 704
domain: "ui"
---

# How to import vectors into HISE — David Healey

## Introduction

This recipe covers the full workflow for using vector graphics in HISE: extracting path data from SVG files, converting it with the Producer tool, loading into a Path object, and drawing/filling on a Panel.

## Get a vector file and download Producer [00:22]

Obtain an SVG file (Font Awesome icons, Inkscape exports, logos). Download the HISE source — the `producer` executable is at `Tools/producer/`.

## Extract and convert path data from SVG [01:25]

1. Open the SVG in a text editor. Find the `<path d="…Z"` element.
2. Copy everything inside the `d` quotes.
3. Open Producer > Tools > SVG Path Converter.
4. Paste the `d` string. A preview renders immediately.
5. Click "Copy" — copies the HISE-ready numeric array to clipboard.

For compound SVGs: each `<path>` is a separate shape. `<rect>` elements have no path data — draw them with `g.fillRect()`. Pasting multiple paths together preserves relative positions.

## Load path data into HISE [03:03]

```javascript
const var myPath = Content.createPath();
const var pathData = [/* paste numeric array from Producer */];
myPath.loadFromData(pathData);
```

## Draw or fill the path on a Panel [05:23]

```javascript
const var Panel1 = Content.getComponent("Panel1");

Panel1.setPaintRoutine(function(g)
{
    g.setColour(0xFF888888);
    g.fillAll();

    // Option A: outline
    g.setColour(0xFF0000FF);
    g.drawPath(myPath, [10, 10, 200, 200], 5); // area, strokeThickness

    // Option B: filled shape
    g.setColour(0xFF0000FF);
    g.fillPath(myPath, [10, 10, 200, 200]);
});
```

To centre the shape:

```javascript
var x = this.getWidth() / 2 - 100;
var y = this.getHeight() / 2 - 100;
g.fillPath(myPath, [x, y, 200, 200]);
```
