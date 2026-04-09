---
title: "How to indicate the state of the sustain pedal on your UI"
summary: "How to show sustain pedal state on a UI button using Synth.isSustainPedalDown() in the onController callback."
channel: "David Healey"
videoId: "i1xzGD19h2A"
url: "https://youtube.com/watch?v=i1xzGD19h2A"
publishDate: "2023-07-01"
views: 0
likes: 0
duration: 127
domain: "ui"
---

# How to indicate the state of the sustain pedal on your UI — David Healey

## Introduction

This recipe shows how to add a visual sustain pedal indicator to your HISE interface using a button and `Synth.isSustainPedalDown()`.

## Sustain Pedal State on a UI Button [00:00]

Add a button component and reference it in your script. In the `onController` callback, read the sustain pedal state and apply it directly to the button value:

```javascript
const var Button1 = Content.getComponent("Button1");

function onController()
{
    Button1.setValue(Synth.isSustainPedalDown());
}
```

`Synth.isSustainPedalDown()` returns `1` when held and `0` when released — this maps directly to a button's on/off state, so no manual CC64 parsing is needed. The button illuminates when the pedal is depressed and turns off on release.
