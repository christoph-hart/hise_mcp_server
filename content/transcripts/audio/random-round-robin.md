---
title: "HISE: Simple Random Round Robin"
summary: "Implements random round-robin sample group selection using Sampler.enableRoundRobin(false) and Sampler.setActiveGroup() with Math.randInt, plus a UI knob to set the group count."
channel: "David Healey"
videoId: "ZbHncYOagvg"
url: "https://youtube.com/watch?v=ZbHncYOagvg"
publishDate: "2022-05-28"
views: 0
likes: 0
duration: 1099
domain: "audio"
---

# HISE: Simple Random Round Robin — David Healey

## Introduction

This recipe replaces HISE's default sequential round-robin with random group selection. You'll disable the built-in round-robin, use `Math.randInt()` to pick a random group on each note, and add a UI knob to control the group count.

## Sampler configuration for round robin [00:50]

1. Create a Sampler and import round-robin samples with each recording mapped to a separate group.
2. By default HISE cycles through groups sequentially. To use random selection, you must disable default round-robin via script.

## Script — random group selection [06:15]

Add a MIDI Script Processor inside the Sampler module. Right-click the Sampler and choose "Create script variable declaration" to get a reference, then call `.asSampler()` to access sampler methods.

```javascript
const var mySampler = Synth.getChildSynth("Sampler1").asSampler();

mySampler.enableRoundRobin(false);

const var NUM_GROUPS = 3;

function onNoteOn()
{
    local groupNum = Math.randInt(1, NUM_GROUPS);
    mySampler.setActiveGroup(groupNum);
}

function onNoteOff()
{
    // Optionally randomise release-trigger samples too
    local groupNum = Math.randInt(1, NUM_GROUPS);
    mySampler.setActiveGroup(groupNum);
}
```

- `Sampler.setActiveGroup(n)` uses **1-based** group indices.
- True random means the same group can repeat consecutively. For non-repeating behaviour, additional tracking is required.

## Interface — knob to set group count [12:00]

Add a programmatic UI knob so the group count is adjustable without editing the script.

```javascript
Content.setWidth(600);
Content.setHeight(150);

const var knobGroups = Content.addKnob("knobGroups", 0, 0);
knobGroups.setRange(1, 50, 1);
knobGroups.set("text", "Round Robin Groups");

function onNoteOn()
{
    local groupNum = Math.randInt(1, knobGroups.getValue());
    mySampler.setActiveGroup(groupNum);
}
```

Setting the knob higher than your actual group count produces a "not a valid group index" error. You can also dial it down to use fewer groups than recorded.
