---
title: "How to make a custom performance meter in HISE || cpu | ram | voices"
summary: "Build a custom Panel-based performance meter displaying live CPU usage, RAM usage, and voice count with per-metric colours and layout control, using timer callbacks and the Graphics API."
channel: "David Healey"
videoId: "3koLQE2FHi4"
url: "https://youtube.com/watch?v=3koLQE2FHi4"
publishDate: "2024-09-07"
views: 438
likes: 10
duration: 667
domain: "ui"
---

# How to make a custom performance meter in HISE — David Healey

## Introduction

This recipe walks through building a custom performance meter Panel in HISE that displays live CPU usage, RAM consumption, and active voice count. You'll learn why a Panel with timer and paint callbacks offers more flexibility than the built-in PerformanceLabel FloatingTile, and how to use `Engine.getCpuUsage()`, `Engine.getMemoryUsage()`, and `Engine.getNumVoices()` with custom drawing for full visual control.

## Building a Panel-based performance meter with a timer callback [00:00]

The built-in `PerformanceLabel` FloatingTile only allows text colour and font customisation. Use a ScriptPanel instead for full control over layout, colours, and formatting.

1. Add a Panel to your interface and name it (e.g. `pnlPerformance`).
2. Get a script reference via right-click > "Create script variable definition".
3. Use the panel's own timer — no separate Timer object needed. An interval of 100-200ms gives smooth updates without excessive overhead.

```javascript
const var pnlPerformance = Content.getComponent("pnlPerformance");

// Timer callback polls engine stats and triggers repaint
inline function onPerformanceTimer()
{
    this.repaint();
}

pnlPerformance.setTimerCallback(onPerformanceTimer);
pnlPerformance.startTimer(200); // interval in milliseconds
```

## Displaying live CPU usage with setPaintRoutine and Engine.doubleToString [02:30]

1. Use `Engine.getCpuUsage()` inside the paint routine to read the current CPU load (returns 0.0–100.0).
2. Use `Engine.doubleToString(value, digits)` to format the value with a specific number of decimal places. The built-in performance meter uses 1 decimal place; pass `2` for more precision.
3. Set the panel's `textColour` property in the interface designer, then read it in the paint routine via `this.get("textColour")`.

```javascript
inline function onPerformancePaint(g)
{
    local a = this.getLocalBounds(0);

    // Read the textColour property set in the interface designer
    g.setColour(this.get("textColour"));

    // Format CPU to 2 decimal places
    local cpuText = Engine.doubleToString(Engine.getCpuUsage(), 2) + "%";
    g.drawAlignedText(cpuText, a, "centred");
}

pnlPerformance.setPaintRoutine(onPerformancePaint);
```

Note: `this.getLocalBounds(0)` returns the full panel area as `[x, y, w, h]`, which `drawAlignedText` accepts directly. The paint routine does not start executing until `startTimer` is called and the first `repaint()` fires.

## Adding RAM usage and voice count to the performance display [05:00]

- `Engine.getMemoryUsage()` returns loaded sample memory in MB. It only shows non-zero values when a Sampler with loaded samples is present.
- `Engine.getNumVoices()` returns the total active voice count as an integer — no formatting needed.

Concatenate all three metrics into a single label string with pipe separators:

```javascript
inline function onPerformancePaint(g)
{
    local a = this.getLocalBounds(0);
    g.setColour(this.get("textColour"));

    local cpu    = Engine.doubleToString(Engine.getCpuUsage(), 2) + "%";
    local ram    = Engine.doubleToString(Engine.getMemoryUsage(), 1) + " MB";
    local voices = Engine.getNumVoices();

    g.drawAlignedText(cpu + " | " + ram + " | " + voices + " v", a, "centred");
}

pnlPerformance.setPaintRoutine(onPerformancePaint);
```

## Drawing each metric with custom position and colour [07:30]

Instead of a single concatenated string, draw each metric at a separate Y position for full layout and per-metric colour control:

```javascript
inline function onPerformancePaint(g)
{
    local w = this.getWidth();

    // CPU — white
    g.setColour(Colours.white);
    g.drawAlignedText("CPU: " + Math.round(Engine.getCpuUsage()) + "%",
                      [10, 0, w, 25], "left");

    // RAM — red
    g.setColour(Colours.red);
    g.drawAlignedText("RAM: " + Math.round(Engine.getMemoryUsage()) + " MB",
                      [10, 30, w, 25], "left");

    // Voices — red
    g.drawAlignedText("Voices: " + Engine.getNumVoices(),
                      [10, 60, w, 25], "left");
}

pnlPerformance.setPaintRoutine(onPerformancePaint);
```

Each `g.setColour()` call affects all subsequent draw operations until the next colour change. Font family, size, and weight can also be changed per-metric using `g.setFont()`.

## Timer interval best practices and font customisation [10:00]

- Set the timer interval to 200–250ms. 100ms is the minimum worth considering; anything faster wastes CPU without meaningful visual benefit.
- Only call `this.repaint()` when the displayed value has actually changed, to avoid redundant paint cycles.
- Use `g.setFont()` inside the paint routine to vary font family, size, and weight per metric for a polished layout.
