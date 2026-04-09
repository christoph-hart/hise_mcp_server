---
title: "Sharing paint routines | Efficient paint routines"
summary: "How to eliminate repetitive paint routine code by extracting shared drawing logic into an inline function and adding panel-specific extras on top."
channel: "David Healey"
videoId: "jO-KOEcJRKo"
url: "https://youtube.com/watch?v=jO-KOEcJRKo"
publishDate: "2023-07-15"
views: 0
likes: 0
duration: 796
domain: "ui"
---

# Sharing paint routines | Efficient paint routines — David Healey

## Introduction

This recipe shows how to reduce duplicated paint routine code across multiple panels by extracting the shared drawing logic into a reusable inline function, then adding panel-specific extras on top.

## Setting Up a Basic Panel Paint Routine [00:47]

When a paint routine is assigned, HISE stops drawing the panel's default background — you must fill it manually. Use `this` inside the paint routine to reference the current panel.

```javascript
const var Panel1 = Content.getComponent("Panel1");

Panel1.setPaintRoutine(function(g)
{
    local area = this.getLocalBounds(0);
    g.setColour(this.get("bgColour"));
    g.fillAll(this.get("bgColour"));
});
```

## Drawing a Title with a Coloured Header Bar [02:00]

Use the panel's `itemColour` for the header background and `textColour` for the text. Retrieve the panel's `text` property dynamically rather than hard-coding:

```javascript
Panel1.setPaintRoutine(function(g)
{
    local area = this.getLocalBounds(0);

    g.setColour(this.get("bgColour"));
    g.fillAll(this.get("bgColour"));

    // Coloured header bar
    g.setColour(this.get("itemColour"));
    g.fillRect([area[0], area[1], area[2], 28]);

    // Title text from the panel's text property
    g.setColour(this.get("textColour"));
    g.drawText(this.get("text"), [area[0], area[1], area[2], 25], "centred");
});
```

Set each panel's text via properties:
```javascript
Panel1.set("text", "REVERB");
Panel2.set("text", "EQ");
Panel3.set("text", "CHORUS");
```

## Eliminating Repetition with a Shared Inline Function [06:05]

Extract shared paint logic into an `inline function` at script scope. Use `local` for variables inside inline functions. Call the shared function from each panel's paint routine:

```javascript
inline function drawPanelBackground(g)
{
    local ar = this.getLocalBounds(0);

    g.setColour(this.get("bgColour"));
    g.fillAll(this.get("bgColour"));

    g.setColour(this.get("itemColour"));
    g.fillRect([ar[0], ar[1], ar[2], 28]);

    g.setColour(this.get("textColour"));
    g.drawText(this.get("text"), [ar[0], ar[1], ar[2], 25], "centred");
}

Panel1.setPaintRoutine(function(g) { drawPanelBackground(g); });
Panel2.setPaintRoutine(function(g) { drawPanelBackground(g); });
Panel3.setPaintRoutine(function(g) { drawPanelBackground(g); });
```

## Adding Panel-Specific Extras on Top of the Shared Routine [10:17]

Each panel keeps its own paint routine, so panel-specific drawing goes after the shared call:

```javascript
Panel2.setPaintRoutine(function(g)
{
    drawPanelBackground(g);

    // Panel-specific: white outline around the header bar
    var area = this.getLocalBounds(0);
    g.setColour(this.get("textColour"));
    g.drawRect([area[0], area[1], area[2], 28], this.get("borderSize"));
});
```

Variables declared in the inline function are not accessible in the outer paint routine — redeclare `area` locally if needed.
