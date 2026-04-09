---
title: "How to use global modulators in HISE | One modulator, multiple targets"
summary: "How to set up a Global Modulator Container in HISE to share a single modulator (LFO, random, MIDI controller) across multiple sound generators, reducing CPU usage and keeping modulation in sync."
channel: "David Healey"
videoId: "Y2XhAEE1IBI"
url: "https://youtube.com/watch?v=Y2XhAEE1IBI"
publishDate: "2025-06-07"
views: 321
likes: 10
duration: 289
domain: "audio"
---

# How to use global modulators in HISE — David Healey

## Introduction

This recipe covers how to use HISE's Global Modulator Container to share a single modulator across multiple sound generators. Instead of duplicating modulators on each generator, you create one source modulator and route it to as many targets as needed — reducing CPU usage, keeping modulation in sync, and allowing per-target curve shaping via tables.

## Using Global Modulators to share one LFO across multiple sound generators [00:00]

1. Global modulators solve the problem of managing duplicate modulators across multiple sound generators (Samplers, sine waves, etc.). Instead of maintaining separate LFOs with identical settings on each generator, one Global modulator drives all targets simultaneously. This also reduces CPU usage.

2. Add a **Global Modulator Container** to your signal chain. It must be placed *before* the sound generators that will use it. Right-click the first sound generator and choose "Add processor before this module", then select Global Modulator Container.

3. Inside the Global Modulator Container, click the **Global Modulators** tab, then press the plus button to add a modulator (e.g. an LFO). This modulator is generic — it has no fixed target parameter at this stage.

4. On each sound generator that should receive the modulation, go to the relevant modulation slot (e.g. Pitch > Time Variant) and add a **Global Time Variant Modulator** (not a standard LFO). In the dropdown that appears, select the LFO you added to the container, then assign the target parameter (e.g. Pitch).

5. Each Global Time Variant Modulator connection also exposes a **table** for per-target customization of the LFO's effect, allowing different response curves per generator while still sharing the same source modulator.

6. Repeat step 4 for every additional sound generator that should share the same LFO. All generators now respond to one modulator; changing the source LFO's settings updates all targets at once.

## Applying a single global modulator to multiple targets (pitch, gain, effects) [02:30]

1. To share one LFO across multiple sound generators, add a **Global Time Variant Modulator** to each generator's pitch chain and select the same named LFO from the list. Both generators now track the same LFO, reducing CPU usage and keeping modulation in sync.

2. Independent per-generator shaping is still available: each Global Time Variant Modulator slot exposes its own **Table** to remap the LFO curve before it reaches that target, without affecting other targets.

3. A single global modulator is not limited to one chain type. Add it to a gain chain (or an effects chain) using the same Global Time Variant Modulator and select the same LFO — adjust the intensity slider per-target as needed.

4. This pattern scales to any modulator type, not just LFOs. Two especially useful cases:
   - **Random modulators**: assign the same random value simultaneously across many destinations so they move together rather than independently.
   - **MIDI Controller modulators** (e.g. mod wheel): add a global MIDI controller modulator to the gain chain of every Sampler that should respond to that CC. One controller drives all of them without duplicating modulator instances or scripting.
