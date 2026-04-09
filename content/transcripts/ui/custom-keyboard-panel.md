---
title: "How to make a unique custom keyboard in HISE"
summary: "Builds a fully custom on-screen keyboard from a ScriptPanel with painted keys, mouse interaction for click/drag note triggering, MidiList-based event ID tracking, hover highlighting, and MIDI input synchronisation."
channel: "David Healey"
videoId: "pmwC9Jmmwuo"
url: "https://youtube.com/watch?v=pmwC9Jmmwuo"
publishDate: "2022-04-23"
views: 0
likes: 0
duration: 2353
domain: "ui"
---

# How to make a unique custom keyboard in HISE — David Healey

## Introduction

This recipe builds a fully custom on-screen keyboard from a ScriptPanel. You'll paint 12 keys, handle click/drag note triggering, track event IDs with a MidiList, add hover highlighting, and synchronise with incoming MIDI input.

## Project setup and panel configuration [00:00]

Create a Panel instead of using the built-in keyboard FloatingTile — a Panel gives full control over painting and mouse interaction, supporting any layout (piano, drum pads, fretboard, etc.).

1. Add a Panel, rename to `pnlKeyboard`.
2. Right-click in the component list > "Create script variable definition".
3. Set "Allow Callback" to "All Callbacks" to enable mouse down, hover, and drag events.

## Paint routine — drawing the keys [03:06]

Draw 12 equal-width columns representing one octave. White keys are identified by index.

```javascript
pnlKeyboard.setPaintRoutine(function(g)
{
    var white = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B

    for (var i = 0; i < 12; i++)
    {
        if (white.contains(i))
            g.setColour(Colours.white);
        else
            g.setColour(Colours.black);

        var keyW = this.getWidth() / 12;
        g.fillRect([i * keyW, 0, keyW, this.getHeight()]);
    }
});
```

## MidiList for tracking active note event IDs [08:24]

Use a MidiList (128 integer slots, faster than an array) to store event IDs. Use `-99` as the sentinel for "no active note" — do not use `-1` as it triggers an all-notes-off.

```javascript
const var eventIds = Engine.createMidiList();
eventIds.fill(-99);
```

## Play and stop note helper functions [13:26]

```javascript
function playNote(n)
{
    var id = Synth.playNote(n + 60, 64); // +60 offsets to middle C
    eventIds.setValue(n, id);
}

function stopNote(n)
{
    var id = eventIds.getValue(n);
    if (id != -99)
    {
        Synth.noteOffByEventId(id);
        eventIds.setValue(n, -99);
    }
}
```

## Mouse callback — click, release, and drag-to-glide [20:17]

Calculate which key the mouse is over from the x-position. Support drag-to-glide by comparing the current key to the last key. Clamp interaction to panel bounds.

```javascript
pnlKeyboard.setMouseCallback(function(event)
{
    if (event.x >= 0 && event.x <= this.getWidth())
    {
        var key = parseInt((event.x / this.getWidth()) * 12);

        if (event.clicked)
        {
            playNote(key);
            this.setValue(key);
            this.repaint();
        }

        if (event.mouseUp)
        {
            stopNote(key);
            this.repaint();
        }

        if (event.drag)
        {
            var lastKey = this.getValue();
            if (key != lastKey)
            {
                stopNote(lastKey);
                playNote(key);
                this.setValue(key);
                this.repaint();
            }
        }
    }
});
```

## Visual highlighting for pressed and hovered keys [29:16]

In the paint routine, check the panel value and event ID to colour the active key differently. Use `this.data.hover` for hover state.

```javascript
// Inside the paint routine key loop:
if (white.contains(i))
{
    if (i == this.getValue() && eventIds.getValue(i) != -99)
        g.setColour(Colours.antiquewhite); // pressed
    else if (this.data.hover && i == this.getValue())
        g.setColour(Colours.cornflowerblue); // hovered
    else
        g.setColour(Colours.white);
}
```

## Wiring MIDI input to the visual keyboard [32:21]

Map incoming MIDI notes to the 0–11 key index using `% 12`. Defer callbacks to prevent audio-thread repaints from causing dropouts.

```javascript
// At init:
Synth.deferCallbacks(true);

// onNoteOn:
function onNoteOn()
{
    eventIds.setValue(Message.getNoteNumber() % 12, Message.getEventId());
    pnlKeyboard.repaint();
}

// onNoteOff:
function onNoteOff()
{
    eventIds.setValue(Message.getNoteNumber() % 12, -99);
    pnlKeyboard.repaint();
}
```

**Why `% 12`:** Maps any MIDI note to a single-octave index (60 → 0, 61 → 1, etc.). **Why defer:** MIDI-thread repaints cause audio dropouts; deferring moves execution to the UI thread.
