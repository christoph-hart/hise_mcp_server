---
title: "Changing articulations with key switches and buttons"
summary: "How to implement articulation switching in HISE using key switches and radio buttons with a two-script architecture: a deferred UI script for visuals and a non-deferred GroupSwitcher for real-time group changes."
channel: "David Healey"
videoId: "1WsY2i4aK5g"
url: "https://youtube.com/watch?v=1WsY2i4aK5g"
publishDate: "2023-05-06"
views: 0
likes: 0
duration: 1618
domain: "audio"
---

# Changing articulations with key switches and buttons — David Healey

## Introduction

This recipe covers a complete articulation switching system using key switches and UI buttons. It uses a two-script architecture: a deferred interface script for visuals (keyboard colours, button states) and a non-deferred GroupSwitcher script for real-time sample group changes.

## Setting Key Switch Colours on the Keyboard [00:00]

Define key switch notes in an array, then colour them and the playable range:

```javascript
const var keySwitches = [24, 25, 26];

for (i = 0; i < 128; i++)
{
    if (keySwitches.contains(i))
        Engine.setKeyColour(i, Colours.withAlpha(Colours.red, 0.2));
    else if (i >= 41 && i <= 76)
        Engine.setKeyColour(i, Colours.withAlpha(Colours.blue, 0.2));
}
```

## Deferring the Interface Script and Setting Up Radio Buttons [02:30]

Always defer the interface script — this moves all callbacks off the real-time thread. Use `Content.getAllComponents()` with a regex pattern to collect numbered buttons into an array and assign a shared callback:

```javascript
const var BtnGroup = Content.getAllComponents("BtnGroup");

inline function onBtnGroupControl(component, value)
{
    // handle button presses
}

for (x in BtnGroup)
    x.setControlCallback(onBtnGroupControl);
```

Set the `radioGroup` property of all buttons to the same value in the UI designer so only one can be active at a time.

## Activating Buttons from Key Switches (Visual Only) [05:00]

In the interface script's `onNoteNumber`, detect key switches and update button state visually. `setValue()` updates the visual without triggering the control callback:

```javascript
function onNoteNumber()
{
    local n = Message.getNoteNumber();

    if (keySwitches.contains(n))
    {
        local index = keySwitches.indexOf(n);
        BtnGroup[index].setValue(1);
    }
}
```

## Non-Deferred GroupSwitcher Script for Real-Time Group Changes [07:30]

Create a separate ScriptProcessor called `GroupSwitcher` inside the Sampler's MIDI chain. Leave it **non-deferred** so group changes happen in real time.

Use `Synth.getIdList("Sampler")` from within the script — because it lives inside a specific Sampler, the list contains exactly one entry:

```javascript
// GroupSwitcher script (non-deferred, inside the Sampler)
const var samplerID = Synth.getIdList("Sampler")[0];
const var sampler = Synth.getSampler(samplerID);

sampler.enableRoundRobin(false); // disable built-in RR for manual group control

const var knbGroup = Content.addKnob("group", 0, 0);
knbGroup.setRange(1, 50, 1); // groups are 1-based

inline function onKnbGroupControl(component, value)
{
    sampler.setActiveGroup(value);
}

knbGroup.setControlCallback(onKnbGroupControl);
```

## Dynamic Key Switch Array from Sampler Group Count [15:00]

Build the key switch array dynamically based on the sampler's actual group count, making the script portable:

```javascript
const var keySwitches = [];
const var knbFirstKS = Content.addKnob("firstKS", 150, 0);
knbFirstKS.setRange(0, 127, 1);

inline function onKnbFirstKSControl(component, value)
{
    keySwitches.clear();
    for (local i = 0; i < sampler.getNumActiveGroups(); i++)
        keySwitches.push(value + i);
}

knbFirstKS.setControlCallback(onKnbFirstKSControl);
```

In `onNoteNumber`, detect key switches and drive the group knob:

```javascript
function onNoteNumber()
{
    local n = Message.getNoteNumber();

    if (keySwitches.contains(n))
    {
        local index = keySwitches.indexOf(n);
        knbGroup.setValue(index + 1);
        knbGroup.changed();
    }
}
```

## UI Script Delegates to GroupSwitcher via setAttribute [20:00]

The deferred UI script obtains a reference to the GroupSwitcher module and routes button presses through its group knob — it never calls `setActiveGroup` directly:

```javascript
// UI script (deferred)
const var groupSwitcher = Synth.getMidiProcessor("GroupSwitcher");

inline function onBtnGroupControl(component, value)
{
    if (value)
    {
        local index = BtnGroup.indexOf(component);
        groupSwitcher.setAttribute(groupSwitcher.group, index + 1);
    }
}
```

## Architecture Summary [22:30]

- **GroupSwitcher** (non-deferred): owns all real-time logic — key switch detection, `setActiveGroup`, group knob.
- **UI script** (deferred): handles visuals — button states, keyboard colours — and delegates group changes via `setAttribute`.
- This split avoids duplicating audio-thread work and makes each script independently reusable.
