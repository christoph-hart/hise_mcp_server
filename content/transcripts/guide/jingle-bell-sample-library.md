---
title: "How I made a sample library VST with HISE | Jingle Bell virtual instrument"
summary: "Complete walkthrough of building a sample library VST in HISE from scratch: sample mapping, interface design with AHDSR/reverb controls, scripting with namespaces, keyboard colouring, and preset browser setup."
channel: "David Healey"
videoId: "hD1RWA5fwRQ"
url: "https://youtube.com/watch?v=hD1RWA5fwRQ"
publishDate: "2022-12-25"
views: 0
likes: 0
duration: 3220
domain: "guide"
---

# How I made a sample library VST with HISE | Jingle Bell virtual instrument — David Healey

## Introduction

This is a complete walkthrough of building a sample library VST in HISE — from naming samples for auto-mapping, through interface design with AHDSR and reverb controls, to scripting with namespaces, keyboard key colouring, and preset browser setup.

## Sample Naming Convention for Auto-Mapping [00:00]

Use a consistent naming pattern so HISE's file name token parser can auto-map:

```
<instrument>_<type>_<noteNumber>_<dynamic>_<roundRobin>
```

Example: `JingleBells_Type1_60_Dynamic1_RR1.wav`

In the token parser, assign: note number = **Key**, dynamic = **Velocity** (Custom), round robin = **Group** (Custom). Set the desired RR group count on the sampler before importing.

## Mapping Samples and Editing Sample Maps via XML [00:00]

1. Drag samples into the sampler and configure the token parser.
2. When an articulation has fewer round robins than the target group count, edit the sample map XML directly (`SampleMaps/articulations.xml`): duplicate `<sample>` entries and update their `RRGroup` attributes. Restart HISE to reload.
3. After mapping, add a **Velocity Modulator** to the sampler's Gain section (intensity ~0.7-1.0).
4. Trim sample starts via **Tools > Trim Sample Start** (threshold ~-26 dB).
5. For unpitched percussion, spread each sample zone across 2-3 adjacent semitones for tonal variation.

## Building the Interface — AHDSR and Reverb Controls [14:20]

**AHDSR Envelope:**
1. Add an **AHDSR Envelope** module to the modulation chain.
2. Add a **FloatingTile** (type: AHDSRGraph) linked to the envelope via `ProcessorId`.
3. Add 5 knobs (A, H, D, S, R) connected to the envelope parameters via Processor ID / Parameter ID.

**Reverb:**
1. Add a **SimpleReverb** effect at the Container level.
2. Add 3 knobs (Wet, Damp, Room) connected to the reverb parameters.

**Preset Browser:**
Add a FloatingTile (type: PresetBrowser), set columns to 2, enable save/folder/edit buttons.

## Scripting — Look and Feel, Paint Routines, and Namespaces [25:15]

Style knobs with a shared Look and Feel in a `LookAndFeel` namespace:

```javascript
namespace LookAndFeel
{
    const var laf = Content.createLocalLookAndFeel();

    laf.registerFunction("drawRotarySlider", function(g, obj)
    {
        // Custom rotary drawing logic
    });

    for (x in Content.getAllComponents("knb"))
        x.setLocalLookAndFeel(laf);
}
```

Draw panel backgrounds and knob labels using paint routines that read from component properties (`this.get("text")`, `this.get("bgColour")`) so the same routine works across panels.

## Colouring Keyboard Keys by Mapped Range [48:35]

```javascript
namespace Keyboard
{
    for (local i = 0; i < 128; i++)
    {
        if (i >= 59 && i <= 82)
            Engine.setKeyColour(i, Colours.withAlpha(Colours.green, 0.5));
        else
            Engine.setKeyColour(i, Colours.withAlpha(Colours.black, 0.2));
    }
}
```

## Moving Namespaces to External Files [51:15]

For larger projects, select a namespace block in the editor, right-click > **Move selection to external file**. HISE creates a separate file and inserts an include statement. Benefits: each file opens in its own tab, F5 saves changes immediately, and code is reusable across projects.
