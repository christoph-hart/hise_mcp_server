---
title: "Making a primitive sequencer in HISE with the synth timer"
summary: "Builds a step sequencer using Synth.startTimer with the onTimer callback, SliderPack-driven velocity, modulo-based index wrapping, and tempo-synced timing via Engine.getMillisecondsForTempo."
channel: "David Healey"
videoId: "WAByniRYM1o"
url: "https://youtube.com/watch?v=WAByniRYM1o"
publishDate: "2022-06-04"
views: 0
likes: 0
duration: 1156
domain: "audio"
---

# Making a primitive sequencer in HISE with the synth timer — David Healey

## Introduction

This recipe builds a primitive step sequencer using the Synth Timer, which runs on the audio thread in real time. You'll use a SliderPack for per-step velocity, modulo for index wrapping, and optionally tempo-sync with `Engine.getMillisecondsForTempo`.

## Timer callback setup [00:25]

The `onTimer` callback runs on the audio thread — do not defer the script if you need real-time timing. For production, put timer logic in a separate script from the interface script.

```javascript
const var slpVelocity = Content.getComponent("SliderPack1");

// Fixed note sequence (C major arpeggio)
const var notes = [60, 64, 67, 72];

// Audio-thread counters (reg persists between timer firings)
reg index = 0;
reg counter = 0;
reg id = -99;
```

## On note callback — start and stop the timer [04:28]

Ignore incoming MIDI so notes don't trigger the sampler directly. Start the timer on note-on; stop only when all keys are released.

```javascript
function onNoteOn()
{
    Message.ignoreEvent(true);
    Synth.startTimer(0.5); // seconds, not milliseconds
}

function onNoteOff()
{
    if (!Synth.getNumPressedKeys())
    {
        Synth.stopTimer();

        if (id != -99)
            Synth.noteOffByEventId(id);

        id = -99;
        index = 0;
        counter = 0;
    }
}
```

**Why `!Synth.getNumPressedKeys()`:** Without this check, releasing any single key out of several held stops the timer.

## Timer callback — playing notes and advancing the step [06:17]

```javascript
function onTimer()
{
    // Kill previous note
    if (id != -99)
        Synth.noteOffByEventId(id);

    // Play current step with velocity from SliderPack
    local v = slpVelocity.getSliderValueAt(counter);
    id = Synth.playNote(notes[index], v);

    // Advance both counters with modulo wrap
    index = (index + 1) % notes.length;
    counter = (counter + 1) % slpVelocity.getNumSliders();
}
```

**Why `reg`:** `reg` variables persist between timer firings on the audio thread. `local` would reset every call.

## Modulo operator and tempo sync [07:41]

The modulo operator `%` wraps the counter back to 0 when it reaches the array length, creating a looping sequence.

**Tempo-sync the timer interval:**

```javascript
function onNoteOn()
{
    Message.ignoreEvent(true);
    local delay = Engine.getMillisecondsForTempo(120) / 1000.0;
    Synth.startTimer(delay);
}
```

Replace `120` with a knob value or host tempo for a live-synced sequencer. For production, put timer logic in a dedicated child script — the interface script should only handle GUI.
