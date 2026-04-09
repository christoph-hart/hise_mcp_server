---
title: "Controlling an XY pad with sliders"
summary: "How to add two knobs that bidirectionally control the X and Y position of a Panel-based XY pad, keeping both mouse and knob input in sync."
channel: "David Healey"
videoId: "jgi_AE-I_1s"
url: "https://youtube.com/watch?v=jgi_AE-I_1s"
publishDate: "2022-12-03"
views: 0
likes: 0
duration: 361
domain: "ui"
---

# Controlling an XY pad with sliders — David Healey

## Introduction

This recipe shows how to add two knobs that bidirectionally control the X and Y position of a Panel-based XY pad, keeping both mouse dragging and knob input in sync.

## Setting Up Knobs for XY Control [00:00]

Add two knobs with range 0.0-1.0 (matching the Panel's normalised data range), middle position 0.5:

```javascript
const var pnlXY = Content.getComponent("pnlXY");
const var knbXY = [];

for (i = 0; i < 2; i++)
{
    knbXY.push(Content.getComponent("knbXY" + i));
    knbXY[i].setControlCallback(onKnbXYControl);
}
```

## Knob Callback — Drive the Panel [02:30]

When either knob moves, write both X and Y into the panel's data object and trigger its update:

```javascript
inline function onKnbXYControl(component, value)
{
    pnlXY.data.x = knbXY[0].getValue();
    pnlXY.data.y = knbXY[1].getValue();
    pnlXY.changed();
}
```

## Panel Callback — Drive the Knobs [05:00]

Inside the panel's mouse callback, update the knobs so dragging the dot keeps them in sync:

```javascript
// Inside the panel's mouse callback, after updating data.x and data.y:
knbXY[0].setValue(pnlXY.data.x);
knbXY[1].setValue(pnlXY.data.y);
```

`setValue()` updates the knob display without re-firing its control callback, so there is no recursive loop. The panel's `changed()` call propagates values to any connected modulators and repaints.
