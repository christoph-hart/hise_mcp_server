---
title: "Making a microtuning script module in HISE"
summary: "How to build a reusable microtuning ScriptProcessor module that applies per-pitch-class cent offsets via a SliderPack, and connect it to a separate interface script using SliderPackData."
channel: "David Healey"
videoId: "s8qDFAQaUHM"
url: "https://youtube.com/watch?v=s8qDFAQaUHM"
publishDate: "2025-06-28"
views: 244
likes: 9
duration: 963
domain: "scripting"
---

# Making a microtuning script module in HISE — David Healey

## Introduction

This recipe walks through building a self-contained microtuning ScriptProcessor module in HISE. You will create a script-based MIDI processor that applies per-pitch-class cent offsets using a SliderPack, convert cent values to coarse/fine detune on MIDI messages, and connect the module to a separate interface script using `Engine.createAndRegisterSliderPackData()`. This is Part 2 of a series — Part 1 covers the concept and UI side.

## Setting up a microtuning ScriptProcessor module [00:00]

1. Add the microtuning script as a **ScriptProcessor** inside the target sound generator's MIDI processor chain. If the tuning needs to affect multiple sound generators, place them inside a Container and add the ScriptProcessor at the Container level — MIDI processors at the container level apply to all child generators.

2. Name the ScriptProcessor `microtuner`.

3. Declare all UI components **programmatically in the script** rather than using the drag-and-drop editor. Components created in the editor exist only in that project; components declared in code travel with the script when copied to another project.

4. Set the interface height, then create the SliderPack:

```hiscript
Content.setHeight(125);

const var slp_microtune = Content.addSliderPack("microtune", 0, 0);
```

## Configuring SliderPack properties for microtuning [02:30]

The SliderPack acts as an internal data store (one slider per semitone). The user never sees this copy directly — it mirrors a visible interface control. Naming convention: prefix the variable (`slp_`) for readability, but keep the component name clean for cross-script references.

All `Content.addXXX()` component-creation functions are discoverable in the API browser under `Content`.

```hiscript
const var slp_microtune = Content.addSliderPack("microtune", 0, 0);

slp_microtune.set("defaultValue", 0);
slp_microtune.set("sliderAmount", 12);  // one slider per semitone (C through B)
slp_microtune.set("min", 0);
slp_microtune.set("max", 100);          // +100 cents max deviation
slp_microtune.set("stepSize", 5);       // 5-cent increments; reduce for finer resolution
```

Alternative: use `setPropertiesFromJSON()` for bulk property assignment.

## Computing per-note microtuning offsets from SliderPack values [05:00]

Define a helper function that reads the offset for a given pitch class from the SliderPack, combines it with any existing coarse/fine tuning on the note, then splits the result back into coarse (semitones) and fine (cents) for application to the MIDI event.

```hiscript
// Call from onNoteOn, passing the note's current tuning state and pitch class index (0-11).
inline function changeTune(currentCoarse, currentFine, index)
{
    local microValue = slp_microtune.getSliderValueAt(index);

    if (microValue == 0)
        return;

    // Combine existing tuning (coarse semitones -> cents) with the micro offset
    local newTuning = (currentCoarse * 100) + currentFine + microValue;

    // Split combined cents back into semitones + remainder
    local newCoarse = Math.floor(newTuning / 100);
    local newFine = newTuning - (newCoarse * 100);

    Message.setCoarseDetune(newCoarse);
    Message.setFineDetune(newFine);
}
```

The coarse-to-cents conversion (`coarse * 100`) is necessary because HISE stores coarse detune in semitones and fine detune in cents independently. Combining them first, then splitting with `Math.floor`, ensures the cents remainder never exceeds one semitone.

## Applying microtuning in the MIDI callbacks [07:30]

In `onNoteOn`, convert the MIDI note number to a pitch class index (0-11 via modulo 12, where C=0), read any existing tuning already on the message, then call the helper to apply the offset on top:

```hiscript
function onNoteOn()
{
    local index = Message.getNoteNumber() % 12;
    local currentCoarse = Message.getCoarseDetune();
    local currentFine = Message.getFineDetune();

    changeTune(currentCoarse, currentFine, index);
}

function onNoteOff()
{
    // Apply microtuning to note-off too — needed for release-trigger samplers
    local index = Message.getNoteNumber() % 12;
    local currentCoarse = Message.getCoarseDetune();
    local currentFine = Message.getFineDetune();

    changeTune(currentCoarse, currentFine, index);
}
```

Reading `Message.getCoarseDetune()` / `Message.getFineDetune()` before writing ensures the microtuning offsets stack correctly with any other pitch processing already in the chain rather than replacing it.

## Connecting the microtuning module to an interface SliderPack [10:00]

The microtuning script is designed as a self-contained, reusable module with no dependency on a specific UI. Any interface can connect to it independently.

Two methods exist for exposing the SliderPack to other scripts:

1. **`registerAtParent()`** — unreliable and can cause crashes. Avoid this approach.
2. **`Engine.createAndRegisterSliderPackData()`** — the recommended method, covered in the next section.

## Using SliderPackData to reliably link interface and script SliderPacks [12:30]

Use `Engine.createAndRegisterSliderPackData()` instead of `registerAtParent()` for connecting a SliderPack UI component to a Script FX module's slider pack. The `registerAtParent()` approach is unreliable and can fail silently; the data object method has no known failure cases.

In the **microtuning script** (the MIDI processing module):

```hiscript
const var sliderPackData = Engine.createAndRegisterSliderPackData(0);
```

The index passed to `createAndRegisterSliderPackData()` must be unique per slider pack within the same script — use 0 for the first, 1 for the second, etc.

In the **interface script**, bind the visible SliderPack to the same data object:

```hiscript
slp_microtune.referToData(sliderPackData);
```

Both the UI component and the processing script now reference the same underlying data. Changing the slider pack on the interface updates the script's values automatically.

## Separating UI and MIDI processing scripts with Synth.deferCallbacks() [15:00]

In a multi-script HISE project, separate UI concerns from real-time MIDI processing:

1. In the **interface script**, call `Synth.deferCallbacks(true)` at init. This moves callback execution to the message thread, preventing any real-time processing in that script's MIDI callbacks — which is almost always correct for a UI-only script.

2. Do **not** add `Synth.deferCallbacks(true)` to scripts that perform real-time MIDI processing (like the microtuner). Those scripts must run at full speed on the audio thread.

This separation ensures the UI script handles only UI concerns while dedicated MIDI/processing scripts handle time-critical work independently.
