---
title: "How to use buttons to trigger samples in HISE | Basic drum pad"
summary: "Builds a button-based drum pad with shared callbacks, indexOf for button identification, 2D grid mapping using modulo and Math.floor, and sequential/random multi-sample triggering."
channel: "David Healey"
videoId: "5PmEgPVsGvA"
url: "https://youtube.com/watch?v=5PmEgPVsGvA"
publishDate: "2022-01-29"
views: 0
likes: 0
duration: 1559
domain: "scripting"
---

# How to use buttons to trigger samples in HISE — David Healey

## Introduction

This recipe builds a button-based drum pad interface. You'll use shared callbacks with `indexOf` for button identification, 2D grid mapping with modulo and `Math.floor`, and both random and sequential multi-sample triggering.

## Single button triggering a sample [00:15]

Add a Sampler and map samples starting at MIDI note 60. Add a momentary Button (`btn_trigger0`, Save in Preset off).

```javascript
const var btn_trigger0 = Content.getComponent("btn_trigger0");
reg eventId = -1;

inline function onBtn_trigger0Control(component, value)
{
    if (value)
        eventId = Synth.playNote(60, 64);
    else
        Synth.noteOffByEventId(eventId);
}

btn_trigger0.setControlCallback(onBtn_trigger0Control);
```

## Multi-button drum pad with shared callback [08:58]

Gather buttons into an array and use `indexOf` to determine which was pressed:

```javascript
const var btnTrigger = [];
reg eventId = -1;

for (var i = 0; i < 4; i++)
{
    btnTrigger[i] = Content.getComponent("btn_trigger" + i);
    btnTrigger[i].setControlCallback(onBtnTriggerControl);
}

inline function onBtnTriggerControl(component, value)
{
    local index = btnTrigger.indexOf(component);

    if (value)
        eventId = Synth.playNote(60 + index, 64);
    else
        Synth.noteOffByEventId(eventId);
}
```

## 2D grid — rows and columns using modulo and Math.floor [20:49]

For a grid with velocity layers (rows) and note lanes (columns), derive both from the button index:

```javascript
inline function onBtnTriggerControl(component, value)
{
    local index = btnTrigger.indexOf(component);

    if (value)
    {
        local noteOffset = index % 4;                  // column: 0-3
        local velocityOffset = Math.floor(index / 4);  // row: 0 or 1
        eventId = Synth.playNote(60 + noteOffset, 1 + velocityOffset);
    }
    else
    {
        Synth.noteOffByEventId(eventId);
    }
}
```

## Random and sequential multi-sample triggering [21:39]

**Random:** fire a random note and velocity each press:

```javascript
reg seqEventId = -1;

inline function onBtnSeqTriggerControl(component, value)
{
    if (value)
    {
        local noteOffset = Math.randInt(0, 4);
        local velocityOffset = Math.randInt(0, 2);
        seqEventId = Synth.playNote(60 + noteOffset, 1 + velocityOffset);
    }
    else
    {
        Synth.noteOffByEventId(seqEventId);
    }
}
```

**Sequential:** cycle through notes in order using a persistent counter:

```javascript
reg noteOffset = 0;

inline function onBtnSeqTriggerControl(component, value)
{
    if (value)
    {
        noteOffset = (noteOffset + 1) % 4;
        seqEventId = Synth.playNote(60 + noteOffset, 2);
    }
    else
    {
        Synth.noteOffByEventId(seqEventId);
    }
}
```
