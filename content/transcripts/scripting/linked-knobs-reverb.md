---
title: "Linked knobs controlling reverb"
summary: "Shows how to link multiple knobs to control reverb parameters through a shared helper function, avoiding the .changed() pitfall when programmatically setting knob values."
channel: "David Healey"
videoId: "yHwDBSHIIBM"
url: "https://youtube.com/watch?v=yHwDBSHIIBM"
publishDate: "2022-11-05"
views: 626
likes: 21
duration: 291
domain: "scripting"
---

# Linked knobs controlling reverb — David Healey

## Introduction

This recipe demonstrates how to link multiple knobs so a master control scales each one proportionally. The key pattern is extracting control callback logic into a reusable helper function, which avoids the common `.changed()` pitfall when programmatically updating knob values.

## Linked knobs pattern — using a shared function instead of .changed() [00:00]

**The scenario:** Two reverb modules, each with a room-size knob (A and B). A master knob links both. When linked, the master scales each knob proportionally to its individually-set maximum — e.g. if knob A is at 25 and knob B is at 43, the master at full produces A=25 and B=43.

**Why `.changed()` fails:** Calling `.changed()` on a knob after programmatically setting its value does trigger the callback, but it can reset knobs back to zero rather than propagating the correct value. Do not use `.changed()` to chain control callbacks.

**Solution:** Extract the parameter-setting logic into a standalone `inline function`, then call it directly from both the individual knob callbacks and the master knob callback.

```javascript
// References to reverb effect modules
const var Reverb1 = Synth.getEffect("Reverb1");
const var Reverb2 = Synth.getEffect("Reverb2");

// References to the individual room-size knobs
const var KnobA = Content.getComponent("KnobA");
const var KnobB = Content.getComponent("KnobB");
const var MasterKnob = Content.getComponent("MasterKnob");

// Standalone helper — sets room size on a reverb by index
inline function setReverb(index, value)
{
    local rev = (index == 0) ? Reverb1 : Reverb2;
    rev.setAttribute(rev.RoomSize, value);
}

// Individual knob callbacks set the corresponding reverb directly
inline function onKnobAControl(component, value)
{
    setReverb(0, value);
}

inline function onKnobBControl(component, value)
{
    setReverb(1, value);
}

KnobA.setControlCallback(onKnobAControl);
KnobB.setControlCallback(onKnobBControl);

// Master knob: scale against each knob's stored maximum,
// then call setReverb directly — no .changed() needed
inline function onMasterControl(component, value)
{
    setReverb(0, value * KnobA.getValue());
    setReverb(1, value * KnobB.getValue());
}

MasterKnob.setControlCallback(onMasterControl);
```

## Scaling linked values with per-knob maximums [02:30]

When using `setValue()` to programmatically update a linked knob, it does **not** fire that knob's control callback. You must call the helper function (`setReverb`) explicitly for each linked knob rather than relying on callback propagation.

Store per-knob maximum values in an array at init scope. In the master callback, compute each linked value as `masterValue * (knobMax[i] / masterMax)` so each reverb reaches its individual ceiling at master maximum.

**Key takeaway:** Always extract control callback logic into a named function. This makes the logic callable from multiple sites (direct knob interaction, master link, preset loading) without duplicating code or fighting `.changed()` behaviour.
