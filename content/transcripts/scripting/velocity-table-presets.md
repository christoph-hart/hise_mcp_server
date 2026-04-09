---
title: "Creating velocity table presets in HISE | How to save and restore table shapes"
summary: "How to save and restore velocity modulator table shapes using base64 strings and radio buttons with restoreFromBase64."
channel: "David Healey"
videoId: "B8haT135CmI"
url: "https://youtube.com/watch?v=B8haT135CmI"
publishDate: "2023-02-04"
views: 0
likes: 0
duration: 558
domain: "scripting"
---

# Creating velocity table presets in HISE — David Healey

## Introduction

This recipe shows how to build a table preset system using radio buttons and base64 strings to save and restore velocity modulator table shapes at runtime.

## Setup — Module Tree and Script References [00:00]

1. Add a **Sine Wave Generator** to the module tree.
2. Under **Gain Modulation > Voice Start**, add a **Velocity Modulator** and enable **Use Table**.
3. Right-click the velocity modulator header and select **Create typed table script reference** to get a `TableProcessor` reference.

Add two buttons (`BTN_Vel0`, `BTN_Vel1`) with **Radio Group** set to `1` and **saveInPreset** disabled. Add a **Table** component with **Processor ID** set to the velocity modulator — this links the UI table to the modulator.

## Capturing Table Shapes as Base64 Strings [02:30]

Select a table shape, then press **Ctrl+C** while the table has the green outline. This copies the shape as a base64 string. Store shapes in an array:

```javascript
const var shapes = [
    "wBAAAA...",  // shape 0 — paste from Ctrl+C
    "wBAAAA...",  // shape 1 — paste from Ctrl+C
];
```

## Button Callback to Restore Table Shapes [05:00]

```javascript
const var btnVel = [];

for (i = 0; i < 2; i++)
    btnVel.push(Content.getComponent("BTN_Vel" + i));

inline function onBTN_VelControl(component, value)
{
    local index = btnVel.indexOf(component);

    if (value)
        VelocityModulator1.restoreFromBase64(0, shapes[index]);
}

for (i = 0; i < 2; i++)
    btnVel[i].setControlCallback(onBTN_VelControl);
```

Key points:
- `restoreFromBase64(tableIndex, base64String)` is a method on **TableProcessor** references. The first argument is the table index (use `0` for single-table modulators).
- The `if (value)` guard is required because radio group buttons fire callbacks on both the activated and deactivated button.
- To add more presets: add a button, copy a new shape with Ctrl+C, append to `shapes`, update the loop count.
