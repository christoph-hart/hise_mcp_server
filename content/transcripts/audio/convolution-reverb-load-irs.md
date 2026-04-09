---
title: "How to load IRs into HISE's convolution reverb effect"
summary: "How to load impulse response files into a Convolution Reverb effect, populate a ComboBox with IR names, and handle selection with automatic preset save/restore."
channel: "David Healey"
videoId: "qR1jYrqQXrY"
url: "https://youtube.com/watch?v=qR1jYrqQXrY"
publishDate: "2023-04-08"
views: 0
likes: 0
duration: 356
domain: "audio"
---

# How to load IRs into HISE's convolution reverb effect — David Healey

## Introduction

This recipe shows how to load impulse response files into HISE's Convolution Reverb, populate a ComboBox with their names, and wire up the selection callback.

## Setup — AudioSampleProcessor Reference and Loading IRs [00:00]

Place all IR `.wav` files in the project's `AudioFiles` folder. Get an audio-sample reference to the Convolution Reverb (not the generic effect reference):

```javascript
const var convReverb = Synth.getAudioSampleProcessor("Convolution Reverb1");
```

Pre-load all audio files at init to register them with HISE:

```javascript
const var IRS = Engine.loadAudioFilesIntoPool();
```

## Populating a ComboBox with IR Names [02:30]

Strip the project-folder wildcard prefix and `.wav` extension for display:

```javascript
const var cmbIR = Content.getComponent("CMB_IR");
cmbIR.set("text", "Load Impulse");

cmbIR.setItems("");
for (x in IRS)
    cmbIR.addItem(x.replace("{PROJECT_FOLDER}", "").replace(".wav", ""));
```

## ComboBox Callback — Loading the Selected IR [05:00]

ComboBox values are 1-based but arrays are 0-based — subtract 1 when indexing:

```javascript
inline function onCMB_IRControl(component, value)
{
    if (value > 0)
        convReverb.setFile(IRS[value - 1]);
}

cmbIR.setControlCallback(onCMB_IRControl);
```

No extra work is needed for preset save/restore — as long as **saveInPreset** is enabled on the ComboBox, the selected IR is stored and restored automatically with user presets.
