---
title: "How to quickly get the area of a panel | getLocalBounds"
summary: "Demonstrates using getLocalBounds() to get a panel's bounds array with automatic margin/inset calculation, replacing manual coordinate math in paint routines."
channel: "David Healey"
videoId: "0izdwn7UcV0"
url: "https://youtube.com/watch?v=0izdwn7UcV0"
publishDate: "2022-07-30"
views: 0
likes: 0
duration: 294
domain: "ui"
---

# How to quickly get the area of a panel | getLocalBounds — David Healey

## Introduction

This recipe shows how to use `getLocalBounds()` to simplify coordinate math in paint routines. Instead of manually calculating inset rectangles, pass a margin value and get a correctly centred bounds array.

## Getting a panel's full area [00:08]

In any paint routine, capture the panel's full internal bounds into a variable for reuse:

```javascript
// Inside paintRoutine: function(g)
var a = this.getLocalBounds(0); // returns [x, y, width, height]
```

`getLocalBounds(margin)` returns `[x, y, width, height]` representing the panel's internal coordinate space. Passing `0` returns the full bounds.

## Filling the panel and drawing inset rectangles [01:05]

```javascript
g.setColour(0xFFFF0000); // 0xAARRGGBB
g.fillRect(a); // fills the entire panel
```

To draw a smaller inset rectangle (e.g. centred with 50px padding on all sides), pass a margin value instead of manually calculating offsets:

```javascript
// Without getLocalBounds — manual and error-prone:
// g.fillRect([a[0] + 50, a[1] + 50, a[2] - 100, a[3] - 100]);

// With getLocalBounds — pass the shrink amount directly:
var inner = this.getLocalBounds(50);
g.setColour(0xFFFF0000);
g.fillRect(inner);
```

The margin value shrinks the rect equally on all four sides and re-centres it automatically.

## Adding a drop shadow behind an inset rectangle [02:35]

Draw the shadow first (larger bounds), then the fill on top (smaller bounds). Draw order matters — paint the shadow before the foreground so it sits underneath.

```javascript
// Shadow — slightly inset from full panel edge
g.setColour(0x55000000); // semi-transparent black
g.fillRect(this.getLocalBounds(10));

// Main fill — more inset
g.setColour(0xFFFF0000);
g.fillRect(this.getLocalBounds(50));
```
