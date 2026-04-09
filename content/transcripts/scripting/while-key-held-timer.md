---
title: "HISE While Key Held"
summary: "Shows how to repeat an action while a MIDI key is held using Engine.createTimerObject(), since HISE has no blocking wait statement."
channel: "David Healey"
videoId: "hVF2vkmrpME"
url: "https://youtube.com/watch?v=hVF2vkmrpME"
publishDate: "2022-02-26"
views: 0
likes: 0
duration: 416
domain: "scripting"
---

# HISE While Key Held — David Healey

## Introduction

HISE has no blocking `wait` statement. This recipe shows how to repeat an action while a MIDI key is held by using a timer that starts on note-on and self-stops when the key is released.

## Timers vs while-key-held [00:00]

Two timer types available:
- `Synth.startTimer()` — built-in synth timer, interval in **seconds**
- `Engine.createTimerObject()` — standalone timer, interval in **milliseconds** (most common)

Minimum interval for `Engine.createTimerObject()` is ~11 ms.

## While-key-held with an Engine timer [01:25]

```javascript
const var triggerKey = 60; // Middle C

const var timer = Engine.createTimerObject();

timer.setTimerCallback(function()
{
    // Stop as soon as key is released
    if (!Synth.isKeyDown(triggerKey))
    {
        timer.stopTimer();
        return;
    }

    // Action to repeat while key is held
    Synth.playNote(60, 60);
});

function onNoteOn()
{
    if (Message.getNoteNumber() == triggerKey)
    {
        Message.ignoreEvent(true); // suppress direct sample trigger
        timer.startTimer(500);     // 500 ms interval
    }
}
```

- `Message.ignoreEvent(true)` prevents the incoming note from triggering the sampler directly.
- `Synth.isKeyDown(triggerKey)` returns `false` once the key is released, so the timer stops itself.
- Always call `timer.stopTimer()` at some point — a timer left running permanently wastes CPU.
