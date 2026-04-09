---
title: "HISE round robin techniques"
summary: "Comprehensive guide to round robin in HISE covering built-in sequential cycling, scripted sequential with group filtering, random selection, and velocity-based RR without using groups."
channel: "David Healey"
videoId: "UIqqlV5mgG4"
url: "https://youtube.com/watch?v=UIqqlV5mgG4"
publishDate: "2022-02-19"
views: 0
likes: 0
duration: 1099
domain: "audio"
---

# HISE round robin techniques — David Healey

## Introduction

This recipe covers all round robin techniques available in HISE: built-in sequential cycling, scripted sequential with group filtering, random selection, and velocity-based RR for when groups are needed for articulations.

## Built-in sequential round robin [00:00]

Map samples to the same key/velocity range. Set "RR Groups" in Sampler Settings to the number of samples. Assign each sample to a different RR Group (1–4). HISE auto-cycles groups sequentially — no scripting needed. Add a dedicated non-deferred script for real-time RR logic.

## Scripted sequential RR with group filtering [05:19]

```javascript
const var Sampler1 = Synth.getSampler("Sampler1");
Sampler1.enableRoundRobin(false);
reg counter = 0;
const var disabledGroups = []; // e.g. [1, 3] to skip groups

function onNoteOn()
{
    counter = (counter + 1) % 4;
    if (disabledGroups.contains(counter))
        counter = (counter + 1) % 4;
    Sampler1.setActiveGroup(counter + 1); // 1-based
}
```

Populate `disabledGroups` via UI controls to let users skip unwanted takes.

## Random round robin [12:07]

Replace the sequential counter with `Math.randInt()`. Upper bound is exclusive.

```javascript
function onNoteOn()
{
    Sampler1.setActiveGroup(Math.randInt(1, 5)); // generates 1–4
}
```

## Velocity-based round robin without groups [15:06]

Use this when RR groups are needed for articulations. Map each sample to a unique single-velocity slot (sample 1 → vel 1, etc.). Keep all samples in Group 1.

```javascript
const var Sampler1 = Synth.getSampler("Sampler1");
Sampler1.enableRoundRobin(false);
reg counter = 0;

function onNoteOn()
{
    counter = (counter + 1) % 4;
    Message.setVelocity(counter + 1);
}
```

Replace sequential counter with `Math.randInt(1, 5)` for random playback. The same principle applies using `Message.setNoteNumber()` for key-range-separated samples.
