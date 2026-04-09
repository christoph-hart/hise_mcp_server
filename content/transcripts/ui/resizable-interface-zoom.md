---
title: "Resizeable interface in HISE | UI Zoom/Scale"
summary: "How to add a drag-to-resize zoom handle to your HISE interface using the ZoomHandler script and a pnlZoom panel."
channel: "David Healey"
videoId: "_9-7LMOUCfY"
url: "https://youtube.com/watch?v=_9-7LMOUCfY"
publishDate: "2024-05-19"
views: 0
likes: 0
duration: 302
domain: "ui"
---

# Resizeable interface in HISE | UI Zoom/Scale — David Healey

## Introduction

This recipe shows how to add a drag-to-resize zoom handle to your HISE plugin interface using the ready-made ZoomHandler script. The user drags a small handle in the bottom-right corner to scale the UI up or down within a defined range.

## Setting Up the Zoom Handler Script and Drag Handle [00:00]

1. Add a background Panel covering the full interface size (cosmetic only).

2. Include the external `ZoomHandler` script in your project via the script include mechanism. This script handles all drag-resize logic internally.

3. Add a Panel named exactly `pnlZoom` as a **top-level control** (last in the component list). Set its size to 10x10 pixels and position it in the **bottom-right corner** of the interface. The ZoomHandler script automatically detects this panel by name and wires up its paint routine and mouse callback.

4. Open `ZoomHandler.js` and set the properties to match your project:

```javascript
// Inside ZoomHandler.js — edit these values:
const var INTERFACE_WIDTH = 600;   // match your actual interface width
const var INTERFACE_HEIGHT = 600;  // match your actual interface height

const var MIN_ZOOM = 0.5;
const var MAX_ZOOM = 2.0;
const var STEP_SIZE = 0.1;  // smaller = smoother scaling increments
```

5. Compile. If no error is thrown, `pnlZoom` was found correctly.

## Configuring Interface Properties and Testing [02:30]

1. Set interface dimensions in the interface properties panel: **Interface Width** and **Interface Height** must match the values in your ZoomHandler script.

2. Set **Minimum Zoom**, **Maximum Zoom**, and **Zoom Step** in the same properties panel. A step of `0.1` gives smooth-but-stepped behaviour.

3. The `pnlZoom` Panel must have its **allowCallbacks** property set to **"Clicks, Hover and Dragging"** — this enables the mouse interaction the zoom script relies on.

4. Test zooming by running as a **Standalone app** — the zoom behaviour is not visible inside the HISE editor itself.
