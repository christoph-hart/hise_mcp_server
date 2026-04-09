---
title: "How to change sample maps with presets in HISE"
summary: "Shows how to tie sample map selection to presets using a ComboBox populated from Sampler.getSampleMapList(), with automatic loading via preset browser restore."
channel: "David Healey"
videoId: "eQ7YvIeS5lY"
url: "https://youtube.com/watch?v=eQ7YvIeS5lY"
publishDate: "2021-12-04"
views: 0
likes: 0
duration: 888
domain: "audio"
---

# How to change sample maps with presets in HISE — David Healey

## Introduction

This recipe ties sample map selection to presets. A ComboBox populated from `Sampler.getSampleMapList()` drives sample map loading, and the preset browser restores the ComboBox value to reload the correct map.

## Get sample map list and populate a ComboBox [00:34]

```javascript
const var sampleMaps = Sampler.getSampleMapList();
const var cmbSampleMap = Content.getComponent("cmbSampleMap");
cmbSampleMap.set("items", sampleMaps.join("\n"));
```

## Load sample maps on ComboBox selection [02:15]

Get a typed Sampler reference with `.asSampler()`. ComboBox values are 1-based; array indices are 0-based:

```javascript
const var sampler1 = Synth.getChildSynth("Sampler1").asSampler();

inline function onCmbSampleMapControl(component, value)
{
    sampler1.loadSampleMap(sampleMaps[value - 1]);
}

cmbSampleMap.setControlCallback(onCmbSampleMapControl);
```

## Add a preset browser and link to the sample map [08:47]

1. Add a FloatingTile, set content type to **PresetBrowser**.
2. Enable **Save in Preset** on the ComboBox.
3. Create presets: set the combo to each sample map and save as a preset.
4. When a preset loads, it restores the ComboBox value, triggering the callback to load the correct sample map.

Hide the ComboBox (`visible = false`) before distribution — end users interact only through the preset browser.

## Scaling to multiple samplers [13:48]

```javascript
inline function onPresetComboControl(component, value)
{
    local idx = value - 1;
    sampler1.loadSampleMap(sampleMapsA[idx]);
    sampler2.loadSampleMap(sampleMapsB[idx]);
}
```
