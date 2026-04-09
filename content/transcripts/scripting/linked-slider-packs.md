---
title: "How to link slider packs in HISE"
summary: "Shows how to link multiple SliderPack components to a shared data object using Engine.createSliderPackData() and referToData(), including cross-script linking with global variables."
channel: "David Healey"
videoId: "-0IEeFLTO5Q"
url: "https://youtube.com/watch?v=-0IEeFLTO5Q"
publishDate: "2022-01-22"
views: 0
likes: 0
duration: 347
domain: "scripting"
---

# How to link slider packs in HISE — David Healey

## Introduction

This recipe shows how to link multiple SliderPack components so they share the same underlying data, both within a single script and across scripts using global variables.

## Linking two slider packs on the same interface [01:37]

Create a shared data object and point both slider packs at it using `referToData()`:

```javascript
const var sliderPack1 = Content.getComponent("SliderPack1");
const var sliderPack2 = Content.getComponent("SliderPack2");

const var sliderPackData = Engine.createSliderPackData();

sliderPack1.referToData(sliderPackData);
sliderPack2.referToData(sliderPackData);
```

Both packs now share the same data — editing one updates the other.

## Cross-script linking with global variables [03:57]

To link a slider pack from a second script, declare the shared data object as a `global` variable (not `const var`) so other scripts can access it.

Main interface script:

```javascript
global g_sliderPackData = Engine.createSliderPackData();

sliderPack1.referToData(g_sliderPackData);
sliderPack2.referToData(g_sliderPackData);
```

Secondary script:

```javascript
const var sliderPack1 = Content.getComponent("SliderPack1");
sliderPack1.referToData(g_sliderPackData);
```

Compile the main interface script first to register the global variable, then compile the secondary script. All packs will be linked.
