---
title: "HISE: How to set opacity within a paint routine"
summary: "Shows how to use Colours.withAlpha() to control colour opacity at draw time within a panel paint routine."
channel: "David Healey"
videoId: "od2lXa1ilOs"
url: "https://youtube.com/watch?v=od2lXa1ilOs"
publishDate: "2022-09-17"
views: 0
likes: 0
duration: 157
domain: "ui"
---

# HISE: How to set opacity within a paint routine — David Healey

## Introduction

A quick recipe showing how to use `Colours.withAlpha()` to control colour opacity at draw time, keeping the source colour solid while varying transparency per draw call.

## Setting opacity within a paint routine using Colours.withAlpha() [00:00]

Use `Colours.withAlpha()` to control a colour's opacity at draw time.

```javascript
// Inside the panel's paint routine (g is the Graphics object):
g.fillAll(this.get("bgColour"));

// Draw a rectangle using item colour at controlled opacity
g.setColour(Colours.withAlpha(this.get("itemColour"), 0.5)); // 0.0–1.0
g.fillRect(this.getLocalBounds(50)); // 50px inset on all sides
```

- `Colours.withAlpha(colour, alpha)` — first arg is the colour value, second is opacity (0.0 = transparent, 1.0 = fully opaque).
- Use this instead of embedding alpha in the hex colour when you need the same colour at multiple opacity levels within one paint routine.
- The panel's `bgColour`/`itemColour` properties remain solid; opacity is applied only at paint time.
