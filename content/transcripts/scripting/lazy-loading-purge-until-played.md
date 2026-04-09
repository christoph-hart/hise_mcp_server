---
title: "How to add Lazy Loading (purge until played) to your HISE instruments."
summary: "How to implement lazy loading (purge until played) in HISE samplers using scripting, reducing RAM usage by keeping samples purged until first triggered by MIDI input."
channel: "David Healey"
videoId: "l0Yp9fp-aBw"
url: "https://youtube.com/watch?v=l0Yp9fp-aBw"
publishDate: "2024-09-21"
views: 206
likes: 6
duration: 435
domain: "scripting"
---

# How to add Lazy Loading (purge until played) to your HISE instruments. — David Healey

## Introduction

This recipe shows how to add lazy loading — also known as "purge until played" — to HISE sampler instruments. Lazy loading keeps all samples purged from RAM until they are first triggered, dramatically reducing initial memory usage for large libraries. You'll implement a toggle button that applies lazy load across all samplers in your project using a reusable scripted approach.

## Implementing lazy load for multiple samplers with a UI toggle [00:00]

Lazy load (called "Purge Until Played" in some samplers) keeps all samples purged from RAM until first triggered. RAM usage drops to zero on load and grows only as notes are played — ideal for any library exceeding ~50 MB.

**Important quirk:** Use `Synth.getChildSynth(id)` to get sampler references when setting the Purged attribute via script. `Synth.getSampler(id)` returns a Sampler handle that does not correctly apply the purge attribute change — use `Synth.getChildSynth(id)` instead to get a ChildSynth reference.

```javascript
// Collect all sampler IDs at init scope
const var samplerIDs = Synth.getIdList("Sampler");

// Build array of ChildSynth references (NOT getSampler — see note above)
const var samplers = [];
for (id in samplerIDs)
    samplers.push(Synth.getChildSynth(id));

// Reusable function to apply lazy load state to all samplers.
// Can be called from the button callback, on init, preset load, etc.
inline function setLazyLoadState(value)
{
    for (s in samplers)
    {
        if (value)
            s.setAttribute(s.Purged, 2); // 2 = lazy load (purge until played)
        else
            s.setAttribute(s.Purged, 0); // 0 = no purging, load all samples
    }
}

// Wire a toggle button to control lazy loading
const var btnLazyLoad = Content.getComponent("btnLazyLoad");

inline function onBtnLazyLoadControl(component, value)
{
    setLazyLoadState(value);
}
btnLazyLoad.setControlCallback(onBtnLazyLoadControl);
```

`s.Purged` is the ChildSynth attribute constant for the sampler's purge state. Value `2` enables lazy load; value `0` disables it (loads all samples into RAM).

## Visual feedback in the mapping editor [05:00]

The mapping editor colour-codes samples by purge state:

- **Gray** — lazy-loaded (purge until played), waiting for first trigger
- **Red** — explicitly purged, no playback trigger
- **White** — fully loaded into RAM

This lets you confirm lazy loading is active without scripting. Apply lazy loading to any library exceeding ~50 MB RAM — HISE loads samples fast enough on modern drives that first-play latency is not a practical concern.
