---
title: "Make Your HISE Instruments Respond to Velocity"
summary: "How to add velocity-to-gain modulation using a Velocity Modulator and share it across multiple sound generators with a Global Modulator Container."
channel: "David Healey"
videoId: "zroQrv-MGWc"
url: "https://youtube.com/watch?v=zroQrv-MGWc"
publishDate: "2024-01-06"
views: 0
likes: 0
duration: 236
domain: "audio"
---

# Make Your HISE Instruments Respond to Velocity — David Healey

## Introduction

This recipe shows how to make a HISE instrument respond to MIDI velocity by adding a Velocity Modulator to the gain chain, connecting it to a UI Table for curve editing, and sharing a single velocity curve across multiple sound generators using a Global Modulator Container.

## Adding Velocity-to-Gain Modulation [00:00]

1. Unlock the module tree (click the pencil icon).
2. In the sound generator's **Gain Modulation** section, click + and choose **Voice Start > Velocity Modulator**.
3. Enable **Use Table** on the modulator to edit the velocity curve. Right-click table nodes to remove them.

To connect the velocity modulator to a UI Table control:
1. Add a Table component to the interface (right-click canvas > Add New Table).
2. In the Table's **Processor ID** dropdown, select the Velocity Modulator.
3. Compile — the table is now linked; edits in either location are reflected in the other.

## Sharing a Velocity Modulator Across Multiple Sound Generators [02:30]

To avoid duplicating velocity controls per generator, use a **Global Modulator Container**:

1. Add a Global Modulator Container before the sound generators (right-click a generator in the module tree > Add Processor Before This Module > Global Modulator Container).
2. Inside the container's modulators section, add a **Voice Start Modulator** (table type) once and enable Use Table.
3. On each individual sound generator, add a **Voice Start > Global Voice Start** modulator to its Gain Modulation section and point it at the shared modulator.
4. Connect one UI Table to the global velocity modulator — it now controls all linked generators simultaneously. No scripting required.

**Why use a global modulator:** A single table drives all generators at once. The per-generator slot also provides a secondary gain curve layer on top of the global one, enabling independent sub-level velocity shaping without duplicating the primary mapping.
