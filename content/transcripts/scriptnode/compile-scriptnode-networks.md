---
title: "How to compile scriptnode networks in HISE"
summary: "How to compile ScriptNode networks into a native DLL and load them as Hardcoded Master Effects for lower CPU overhead and simpler UI wiring."
channel: "David Healey"
videoId: "24vH-oxX1m4"
url: "https://youtube.com/watch?v=24vH-oxX1m4"
publishDate: "2022-11-19"
views: 0
likes: 0
duration: 412
domain: "scriptnode"
---

# How to compile scriptnode networks in HISE — David Healey

## Introduction

This recipe shows how to compile one or more ScriptNode networks into a native DLL, then load them as Hardcoded Master Effects for lower CPU overhead and simpler UI wiring.

## Enable Compilation and Export [00:00]

1. Open each network in the ScriptNode editor.
2. Click **Node Properties** and set **Allow Compilation** to enabled. Save the preset.
3. Networks with compilation disabled are excluded from the DLL (useful for networks depending on external HISE modulator data, which cannot compile).

Go to **Export > Compile DSP Networks as DLL**. Choose Debug or Release to match your plugin export config. HISE generates a build script — on some platforms it must be run manually.

## Build Outputs and Handling Errors [02:30]

After compilation, two artefacts appear:

| Location | Contents |
|---|---|
| `DspNetworks/Binaries/dll/` | Single DLL containing all compiled networks |
| `AdditionalSourceCode/nodes/` | C++ header files per compiled node |

All enabled networks compile into **one DLL per project**. If you modify and recompile, delete stale headers in `AdditionalSourceCode/nodes/` to avoid version mismatches.

Networks referencing external HISE data (e.g. modulators feeding into a node) will fail to compile — split into a compiled DSP network and an uncompiled wrapper that supplies external data.

## Loading as Hardcoded Master Effects [05:00]

Close and reopen HISE. Add a **Hardcoded Master Effect** module (not Script FX) to the FX chain and select the compiled network by name. Macro controls exposed in ScriptNode appear as standard processor parameters.

Wire UI knobs via Processor ID / Parameter ID — no manual scripting needed. Set knob ranges to match the parameter ranges. For multiple instances of the same network, add separate Hardcoded Master Effect modules — each maintains independent state from the same DLL.
