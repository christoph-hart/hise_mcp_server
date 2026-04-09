---
title: "How to display a preset name in HISE"
summary: "Shows how to display the current preset name in a Label using Engine.getCurrentUserPresetName(), with a fallback default for fresh loads and a knob callback as a post-init hook."
channel: "David Healey"
videoId: "ra5Wrmi_z2Y"
url: "https://youtube.com/watch?v=ra5Wrmi_z2Y"
publishDate: "2021-12-11"
views: 0
likes: 0
duration: 730
domain: "scripting"
---

# How to display a preset name in HISE — David Healey

## Introduction

This recipe shows how to display the active preset name in a Label, with a default fallback for fresh loads when no preset has been selected yet.

## Setup — preset browser and label [00:00]

Add a Preset Browser floating tile and a Label. Create at least one preset in the browser. Disable "Save In Preset" on the label.

## Engine.getCurrentUserPresetName() [02:30]

Returns the active preset name. Calling this in `onInit` returns an empty string because HISE doesn't auto-load a preset on startup.

```javascript
Console.print(Engine.getCurrentUserPresetName()); // empty on fresh load
```

## Using a knob callback as a post-init hook [05:00]

HISE triggers every control's callback after `onInit` completes, provided the control has "Save In Preset" enabled and no Processor ID set. Use this to run code that needs a valid preset context.

## Displaying the preset name with a default fallback [07:30]

```javascript
const var myLabel = Content.getComponent("Label1");

inline function onKnob1Control(component, value)
{
    if (Engine.getCurrentUserPresetName() == "")
        myLabel.set("text", "Default Preset");
    else
        myLabel.set("text", Engine.getCurrentUserPresetName());
}
```

The label shows the default name on fresh load and updates automatically whenever a preset is selected.
