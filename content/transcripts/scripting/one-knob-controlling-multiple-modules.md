---
title: "One Knob to Rule Them All!"
summary: "How to use a single UI knob to control the same parameter across multiple effect modules, using both direct scripting and a reusable secondary ScriptProcessor architecture."
channel: "David Healey"
videoId: "ylWbVR77Nhg"
url: "https://youtube.com/watch?v=ylWbVR77Nhg"
publishDate: "2025-03-01"
views: 614
likes: 26
duration: 840
domain: "scripting"
---

# One Knob to Rule Them All! — David Healey

## Introduction

This recipe shows how to connect a single UI knob to multiple effect modules in HISE — specifically, controlling the Gain parameter of several Simple Gain effects simultaneously. It covers the basic scripting approach (collecting module references into an array and iterating in a callback), then progresses to a cleaner architecture using a dedicated secondary ScriptProcessor that exposes its own parameters, making the controller reusable across projects.

## Connecting a UI knob to a module parameter without scripting [00:00]

1. To connect a single knob to one module parameter, set the knob's **mode** (e.g. "Decibel" for gain, which auto-fills the correct dB range), then assign the target in the knob's **Processor ID** and **Parameter** fields. No scripting required for single-target connections.

2. The Processor ID / Parameter field method supports only one target. To drive multiple modules from one knob, you must use scripting instead — the two approaches are mutually exclusive. Clear the Processor ID field (select the empty entry at the top of the list) before writing any scripting logic.

3. Rename modules to zero-indexed names (e.g. `Simple Gain0`, `Simple Gain1`) before referencing them in script. Starting from zero keeps the names consistent with array indices.

## Collecting multiple effects into an array and creating a knob callback [02:30]

Use `right-click > Create script variable definition` on any UI control and `right-click > Create custom callback definition` on the knob to generate boilerplate, then paste into the script.

```javascript
// Collect both Simple Gain effects into an array for unified control.
// Effects must be named "Simple Gain0" and "Simple Gain1" in the module tree.
const var simpleGain = [];

for (i = 0; i < 2; i++)
{
    simpleGain.push(Synth.getEffect("Simple Gain" + i));
}

// Reference the shared gain knob
const var knbGain = Content.getComponent("knbGain");

// Callback fires whenever the knob moves
inline function onKnbGainControl(component, value)
{
    Console.print(value); // verify knob is responding before wiring effects
}

knbGain.setControlCallback(onKnbGainControl);
```

The `setControlCallback()` pattern with a separately-defined `inline function` is required — anonymous `function()` syntax allocates on every call and is not audio-thread safe.

## Forwarding a single knob value to multiple module parameters using setAttribute [05:00]

Extend the callback to iterate over the module array and call `setAttribute` on each one. This scales automatically as long as modules follow the same naming convention.

To discover the correct attribute constant for any module, right-click the module's parameter knob in the HISE UI and look at the label. For Simple Gain, the gain control is `x.Gain`. Use `fx.AttributeName` notation rather than magic integers.

```javascript
inline function onKnbGainControl(component, value)
{
    // Forward the knob value to every Simple Gain in the array
    for (x in simpleGain)
    {
        x.setAttribute(x.Gain, value);
    }
}

knbGain.setControlCallback(onKnbGainControl);
```

To extend this to more Simple Gain instances, increase the loop count when building the `simpleGain` array. The callback requires no changes.

## Discovering parameter IDs and moving logic into a secondary ScriptProcessor [07:30]

To find the correct parameter name for any module (not just Simple Gain), right-click the module in HISE and select **Dump Parameter ID and values**. The Console prints all parameter names and their current values. Use the printed name directly as the attribute constant.

To keep the project modular, move the knob-to-module logic out of the main interface script into a dedicated secondary ScriptProcessor:

1. Add a Script Processor to the module tree and name it clearly (e.g. "gain controller") by Shift-clicking its name field.
2. Secondary scripts do not use the Interface Designer — build the UI purely through scripting so the script is self-contained and reusable across projects.

```javascript
// Secondary ScriptProcessor: "gain controller"
// Target modules must follow a naming convention: "Simple Gain0", "Simple Gain1", etc.
const var numModules = 2;

const var simpleGain = [];

for (i = 0; i < numModules; i++)
{
    simpleGain.push(Synth.getEffect("Simple Gain" + i));
}

// Create the knob via script — no Interface Designer needed
const var knbGain = Content.addKnob("gain", 0, 0);
knbGain.setMode("Decibel");

inline function onGainControl(component, value)
{
    for (x in simpleGain)
    {
        x.setAttribute(x.Gain, value);
    }
}

knbGain.setControlCallback(onGainControl);
```

Update `numModules` when adding more modules. The rest adapts automatically.

## Connecting the main interface knob to the secondary script's parameter [10:00]

In a secondary script, use `Content.addKnob()` instead of `Content.getComponent()`. The name passed to `Content.addKnob()` becomes the parameter ID exposed to the parent script.

1. Name the knob after the parameter it controls (e.g. `"gain"` not `"knbGain"`), because this name becomes the visible parameter ID in the processor's parameter list.
2. Set the mode with `knbGain.setMode("Decibel")` so the range is correct from the start.
3. To connect the main interface knob to this secondary script's parameter, select the main interface knob and set its **Processor** to the gain controller script and its **Parameter ID** to `gain` — matching the name string passed to `Content.addKnob()`.

This approach keeps the main interface script clean — it just points a knob at a processor parameter, and the secondary script handles all the multi-module routing internally.

## Scaling the modular controller pattern to additional parameters [12:30]

When naming UI controls in a secondary script, use the parameter's property name (e.g. `gain`) rather than the widget name (e.g. `knbGain`). The property name is what appears in the parameter list, making the connection self-documenting.

This pattern scales to any number of parameters: to expose all parameters of a module (e.g. a Simple Gain effect or an AHDSR envelope), add each parameter as a separately named control in the secondary script. The parent script then has a single master controller driving multiple module instances through one scripted interface — a reusable, debuggable module pattern applicable to any multi-instance scenario (gain, envelopes, filters, etc.).
