---
title: "Auto colour keys based on sample mapping in HISE"
summary: "How to automatically colour keyboard keys to reflect which notes have samples mapped, updating dynamically when sample maps change using a Panel loading callback."
channel: "David Healey"
videoId: "H1OCC-EDl14"
url: "https://youtube.com/watch?v=H1OCC-EDl14"
publishDate: "2023-09-02"
views: 0
likes: 0
duration: 647
domain: "ui"
---

# Auto colour keys based on sample mapping in HISE — David Healey

## Introduction

This recipe shows how to automatically tint keyboard keys based on which MIDI notes have samples mapped across one or more Samplers. The colours update dynamically whenever a sample map is loaded or cleared, using a Panel's `setLoadingCallback`.

## Project and Sampler Setup with Dynamic Sampler References [00:20]

1. Set up a standard HISE project with sample maps. Add one or more Sampler modules to your instrument.

2. Retrieve all Sampler IDs dynamically rather than hard-coding references:

```javascript
const var samplerIDs = Synth.getIdList("Sampler");
const var samplers = [];

for (id in samplerIDs)
    samplers.push(Synth.getSampler(id));
```

3. Add a **Floating Tile** to your interface with `ContentType` set to `Keyboard`. Set `lowKey` and `keyWidth` to show the relevant range.

4. Add an invisible **Panel** (e.g. `pnlPreload`) — it is only used for its loading callback, not for display.

## Colouring Keys Based on Mapped Notes Using a Loading Callback [04:03]

Register `setLoadingCallback` on the Panel. It fires whenever HISE loads or unloads a sample map. When loading finishes (`isPreloading == false`), iterate all 128 notes and check each Sampler:

```javascript
const var pnlPreload = Content.getComponent("pnlPreload");

inline function setKeyColours()
{
    // Reset all keys to a dim default
    for (local i = 0; i < 128; i++)
        Engine.setKeyColour(i, Colours.withAlpha(Colours.black, 0.4));

    // Highlight keys that have samples mapped in any Sampler
    for (local i = 0; i < 128; i++)
    {
        for (s in samplers)
        {
            if (s.isNoteNumberMapped(i))
            {
                Engine.setKeyColour(i, Colours.withAlpha(Colours.blue, 0.2));
                break; // no need to check remaining samplers for this note
            }
        }
    }
}

pnlPreload.setLoadingCallback(function(isPreloading)
{
    if (!isPreloading)
        setKeyColours();
});

// Also call at init so keys are correct before any user interaction
setKeyColours();
```

Key API details:
- `Synth.getIdList("Sampler")` — returns an array of string IDs for all Sampler modules.
- `Synth.getSampler(id)` — returns a Sampler scripting object by ID string.
- `Sampler.isNoteNumberMapped(noteNumber)` — returns true if any sample covers that MIDI note (0-127) in the current sample map.
- `Engine.setKeyColour(noteNumber, colour)` — sets the tint of a single piano key. Colour format: `0xAARRGGBB`. Pass `0x00000000` to clear a custom colour.
- Always reset all 128 keys before highlighting to prevent stale colours from a previous sample map.
- The loading callback fires on both load and clear, so colours stay in sync automatically.
