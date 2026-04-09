---
title: "Adding a bypass button to my mono mode script"
summary: "Shows how to add a bypass button to a MIDI script, with proper handling of hanging notes when bypass is toggled mid-hold."
channel: "David Healey"
videoId: "2Cx-oHLrY84"
url: "https://youtube.com/watch?v=2Cx-oHLrY84"
publishDate: "2022-02-12"
views: 0
likes: 0
duration: 505
domain: "scripting"
---

# Adding a bypass button to my mono mode script — David Healey

## Introduction

This recipe shows how to add a bypass button to a MIDI processing script, with proper handling of hanging notes when bypass is toggled while a key is held.

## Load script from clipboard [00:00]

Copy a script from GitHub. In the HISE script editor, right-click and choose "Load script from clipboard" — do NOT use Ctrl+V, which pastes everything into `onInit` instead of distributing code to the correct callbacks.

## Add bypass button [02:30]

```javascript
const var bypass = Content.addButton("bypass", 0, 0);
```

## Guard onNoteOn with bypass check [05:00]

Wrap the entire `onNoteOn` body in a bypass check:

```javascript
function onNoteOn()
{
    if (!bypass.getValue())
    {
        // existing mono mode logic here
    }
}
```

## Handle hanging notes on bypass in onNoteOff [07:30]

Add an `else if` branch that fires note-off for any currently held note when bypassed mid-hold:

```javascript
function onNoteOff()
{
    if (!bypass.getValue())
    {
        // existing mono mode note-off logic
    }
    else if (eventId != -1)
    {
        Synth.noteOffByEventId(eventId);
        eventId = -1;
    }
}
```

This prevents hanging notes when the user presses bypass while a key is held down.
