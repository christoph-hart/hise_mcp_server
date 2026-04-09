---
title: "How to make a transposer in HISE | Real time and non real time threads"
summary: "How to build a MIDI transposer using a two-script architecture: a deferred UI script for display and a non-deferred ScriptProcessor for real-time Message.setTransposeAmount calls."
channel: "David Healey"
videoId: "1fhhmJulNQo"
url: "https://youtube.com/watch?v=1fhhmJulNQo"
publishDate: "2023-02-11"
views: 0
likes: 0
duration: 834
domain: "scripting"
---

# How to make a transposer in HISE | Real time and non real time threads — David Healey

## Introduction

This recipe builds a MIDI transposer while explaining HISE's two-thread model. It demonstrates why real-time MIDI processing and GUI updates must live in separate scripts, and how to link them together.

## Threads in HISE — Audio Thread vs Message Thread [00:00]

All script callbacks run on one of two threads:

- **Audio thread**: `onNoteNumber`, `onNoteOff`, `onController`, `onTimer`. Must not be blocked with slow operations.
- **Message thread**: `onInit`, `onControl`, mouse callbacks. Cannot be moved to the audio thread.

GUI updates must run on the message thread. Real-time MIDI processing must run on the audio thread. Mixing them causes audio glitches or scripting errors.

## Deferring the UI Script to the Message Thread [02:30]

Add `Synth.deferCallbacks(true)` at the top of `onInit` in your main interface script. This moves all callbacks onto the message thread, making GUI updates safe:

```javascript
// UI script — onInit
Synth.deferCallbacks(true);

const var lblNote = Content.getComponent("lbl_note");
const var knbTranspose = Content.getComponent("knb_transpose");
```

Attempting `Message.setTransposeAmount()` in a deferred script produces an error — this is the correct signal to separate your code.

## Separate ScriptProcessor for Real-Time MIDI [05:00]

Create a second ScriptProcessor (e.g. `Transposer`) alongside the UI script. Do **not** defer it. Add the transpose knob programmatically so the module is self-contained and portable:

```javascript
// Transposer script — onInit (non-deferred)
const var knbTranspose = Content.addKnob("Transpose", 0, 0);
knbTranspose.setRange(-12, 12, 1);
```

```javascript
// Transposer script — onNoteNumber (audio thread)
function onNoteNumber()
{
    Message.setTransposeAmount(knbTranspose.getValue());
}
```

## Linking the UI Knob to the Transposer Script [10:00]

**Method 1 — Processor ID / Parameter ID (simplest):** Select the UI knob in the Interface Designer, set *Processor ID* to `Transposer` and *Parameter ID* to `Transpose`. The knobs are now linked with no extra scripting.

**Method 2 — Custom callback (when the knob drives multiple targets):**

```javascript
// UI script
const var transposer = Synth.getMidiProcessor("Transposer");

inline function onKnbTransposeControl(component, value)
{
    transposer.setAttribute(transposer.Transpose, value);
}

Content.getComponent("knb_transpose").setControlCallback(onKnbTransposeControl);
```

## Recommended Architecture Pattern [12:30]

- Always place `Synth.deferCallbacks(true)` at the top of `onInit` in the main interface script.
- Keep all `Message.*` calls and audio-thread logic in a dedicated secondary ScriptProcessor.
- Build secondary module UIs via `Content.addKnob()` / `Content.addButton()` in scripting rather than the Interface Designer, so the module is portable across projects.
