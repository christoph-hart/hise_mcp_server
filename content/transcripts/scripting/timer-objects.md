---
title: "HISE Timer objects"
summary: "Complete guide to Engine.createTimerObject() covering creation, start/stop/reset controls, real-time speed changes via knob, inverted delay mapping, and combining multiple animations into a single timer callback."
channel: "David Healey"
videoId: "dOA9fhBenU8"
url: "https://youtube.com/watch?v=dOA9fhBenU8"
publishDate: "2022-05-14"
views: 0
likes: 0
duration: 1244
domain: "scripting"
---

# HISE Timer objects — David Healey

## Introduction

This recipe covers `Engine.createTimerObject()` — one of three timer types in HISE (alongside Synth Timer and Panel Timer). You'll set up start/stop/reset controls, change speed in real time via a knob with inverted delay mapping, and learn when to combine multiple animations into a single callback.

## Project setup — UI components [00:00]

Create a Label (`lblCount`, font size 72, not editable, default text `"0"`), three Buttons (`btnStart`, `btnStop` in radio group 1, `btnReset` as momentary), and a Knob (`knbSpeed`, Normalized Percentage mode, min 0.0, max 0.98). Turn off Save Preset on all controls.

Setting knob max to `0.98` prevents the timer interval from going below the 11 ms minimum.

## Timer object creation and callback [04:32]

```javascript
const var lblCount = Content.getComponent("lblCount");
const var btnStart = Content.getComponent("btnStart");
const var btnStop = Content.getComponent("btnStop");
const var btnReset = Content.getComponent("btnReset");
const var knbSpeed = Content.getComponent("knbSpeed");

const var t = Engine.createTimerObject();
reg count = 0;

t.setTimerCallback(function()
{
    count++;
    lblCount.setValue(count);
});
```

Minimum timer interval is **11 ms** — faster values cause a runtime error.

## Types of timers in HISE [05:06]

Three timer types: **Timer Object** (`Engine.createTimerObject()`), **Synth Timer** (`Synth.startTimer()` — audio thread), **Panel Timer** (`panel.startTimer()`). Timer Objects run on the UI thread and are best for non-audio-critical tasks.

## Start and stop buttons [12:06]

```javascript
inline function onBtnStartControl(component, value)
{
    if (value)
        t.startTimer(1000 - 1000 * knbSpeed.getValue());
}

inline function onBtnStopControl(component, value)
{
    if (value)
        t.stopTimer();
}

btnStart.setControlCallback(onBtnStartControl);
btnStop.setControlCallback(onBtnStopControl);
```

Calling `t.startTimer()` while already running restarts it with the new interval.

## Reset button [14:39]

```javascript
inline function onBtnResetControl(component, value)
{
    if (value)
    {
        count = 0;
        lblCount.setValue(count);
    }
}

btnReset.setControlCallback(onBtnResetControl);
```

Reset does not stop the timer — counting resumes from 0 if still running.

## Real-time speed change with inverted knob [16:24]

Invert the knob so turning it up increases speed (decreases delay):

- Formula: `delay = 1000 - 1000 * knobValue`
- At 0.0 → 1000 ms (slowest). At 0.98 → ~20 ms (fast, safe above 11 ms minimum).

```javascript
inline function onKnbSpeedControl(component, value)
{
    if (btnStart.getValue())
        t.startTimer(1000 - 1000 * value);
}

knbSpeed.setControlCallback(onKnbSpeedControl);
```

## Combining multiple animations into a single timer [20:04]

You can create multiple Timer Objects via `Engine.createTimerObject()`. However, for animations sharing the same interval, combine them into a single timer callback — this is more CPU-efficient. Keep total concurrent timers reasonable (3–4 max).
