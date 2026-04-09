---
title: "How to make a mic mixer in HISE"
summary: "Builds a multi-mic mixer with per-channel volume, pan, and purge controls using merged multi-mic samples, Simple Gain FX modules, and 6-channel routing."
channel: "David Healey"
videoId: "sV9aMTphmDE"
url: "https://youtube.com/watch?v=sV9aMTphmDE"
publishDate: "2022-02-05"
views: 0
likes: 0
duration: 1468
domain: "audio"
---

# How to make a mic mixer in HISE — David Healey

## Introduction

This recipe builds a multi-mic mixer with per-channel volume, pan, and purge controls. You'll merge multi-mic samples, route through Simple Gain FX modules, and configure 6-channel output.

## Mapping and merging multi-mic samples [00:32]

1. Add a Sampler. Drag all sample files into the editor and use the file name token parser.
2. Select all samples > right-click > Tools > "Merge into multi-mic samples". Set separator to `_`, choose the mic-position segment, set detection to "Mapping and file name".
3. All samples per mic position must be exactly the same length.

## Trimming samples [03:23]

If merged samples play incorrectly, go to Sampler Settings > "Purge All" > Enabled, then Disabled to reload. Right-click > Tools > "Trim Sample Start" (trim the close-mic position). Save the sample map.

## Building the channel-strip controls [05:48]

Create per-channel controls: one Slider for volume (mode: Decibel), one Slider for pan (mode: Pan), one Button for purge. Name them `Pan0`, `VolumeSlider0`, `Purge0`. Duplicate twice — HISE auto-increments the trailing digit.

## Purge controls with shared callback [07:30]

```javascript
const var btnPurge = [];
const var sampler1 = Synth.getChildSynth("Sampler1");

for (var i = 0; i < 3; i++)
    btnPurge[i] = Content.getComponent("Purge" + i);

inline function onPurgeMicPosition(component, value)
{
    local idx = btnPurge.indexOf(component);
    local micName = sampler1.asSampler().getMicPositionName(idx);
    sampler1.asSampler().purgeMicPosition(micName, value == 1);
}

for (var i = 0; i < 3; i++)
    btnPurge[i].setControlCallback(onPurgeMicPosition);
```

Mic positions are ordered alphabetically (Close=0, Decca=1, Hall=2).

## Routing volume and pan via Simple Gain [17:09]

1. Add three Simple Gain FX modules (`SimpleGain0`, `SimpleGain1`, `SimpleGain2`).
2. Connect UI knobs via Processor ID / Parameter ID: Volume → Gain, Pan → Balance.
3. Open the routing matrix. Change the container channel count to 6. Right-click > "All channels to stereo" for monitoring.
4. In the Sampler routing, right-click > "All channels" to connect all 6 channels.
5. Assign each Simple Gain to its mic pair: ch 1&2 (Close), ch 3&4 (Decca), ch 5&6 (Hall).

## Extra definitions for multi-output export [22:20]

In Project Settings > Extra Definitions, add:

```
HISE_NUM_PLUGIN_CHANNELS=6
```
