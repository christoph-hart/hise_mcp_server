---
title: "Changing articulations in HISE"
summary: "A comprehensive guide to organizing and switching between sample articulations in HISE, covering group-based, velocity-based, key range, and multi-sampler sample layouts, with switching methods including key switches, MIDI CC (UACC), program changes, and crossfade blending."
channel: "David Healey"
videoId: "dG-7K8cZoLI"
url: "https://youtube.com/watch?v=dG-7K8cZoLI"
publishDate: "2020-02-01"
views: 773
likes: 13
duration: 3571
domain: "audio"
---

# Changing articulations in HISE — David Healey

## Introduction

This recipe covers the full workflow for organizing and switching between multiple articulations (e.g. sustain, staccato, flutter tongue) in a HISE sampler instrument. You will learn five different ways to lay out samples — using groups, velocity ranges, keyboard zones, separate samplers, and sample maps — and multiple switching methods including key switches, MIDI CC with the UACC standard, program changes, and real-time crossfading. The examples use clarinet samples with three articulations throughout.

## Organizing Articulations into Separate RR Groups in the Sampler [00:56]

1. In the Sampler, set the number of RR Groups to match the number of articulations (e.g., 3 for sustain, staccato, flutter). The group count field defaults to 1; change it before loading samples.

2. Load all samples for all articulations into the sampler first. By default, all imported samples are placed into Group 1 regardless of which group is selected in the display — the display group selector is for viewing only, not for assignment on import.

3. To reassign samples to the correct group, use the Table View (not the Mapping Editor). In the Table View, scroll to locate samples of one articulation, select the first, then Shift-click the last to select all. Change the "RR Group" column value to the target group number (e.g., 2 for staccato, 3 for flutter).

4. Verify assignments by switching the display group in the Mapping Editor: Group 1 should show sustains, Group 2 staccatos, Group 3 flutters.

5. Different articulations can have different sample counts and key ranges per group — the sampler supports mixed ranges and densities across groups.

6. Save the sample map and give it a descriptive name (e.g., "all articulations") before proceeding.

## Configuring Round-Robin Groups for Articulation Switching [04:13]

By default, HISE cycles through groups in round-robin order (Group 1, Group 2, Group 3, then back to Group 1). The current round-robin group number is displayed next to the group selector.

To switch articulations using groups, only one group can be active at a time. This is a fundamental constraint: you cannot use groups for both dynamic crossfading and articulation switching simultaneously. Crossfading requires multiple groups active at once; articulation switching requires exactly one active group at a time.

When writing the articulation-switching script, choose the script location based on your needs:
- A script on the individual sampler works best when articulations are relative to only that sampler.
- A separate dedicated script (e.g., named "Group Articulations") is preferred when you want modularity and reusability across projects.
- Embedding in the interface script is appropriate when UI elements need to update in response to articulation changes (e.g., displaying "Staccato" on screen when the user switches to that articulation).

Avoid putting articulation logic in the interface script unless UI synchronization is required.

## Using Key Switches and Manual Round-Robin Group Control in the Script Editor [07:33]

```js
// One entry per articulation (C0, C#0, D0)
var keySwitches = [24, 25, 26];

// Color the key switch keys on the keyboard
for (i = 0; i < keySwitches.length; i++)
    Engine.setKeyColour(keySwitches[i], Colours.withAlpha(Colours.red, 0.3));

// Get a TYPED sampler reference (right-click sampler > "Create typed script reference").
// Do NOT use "Create generic script reference" — that returns a ChildSynth which
// lacks sampler-specific methods like enableRoundRobin.
const var sampler = Synth.getSampler("MySampler");

// Disable automatic round-robin cycling — gives full manual control
// via the onNote callback. Without this, HISE cycles groups automatically.
sampler.enableRoundRobin(false);
```

**Note:** `enableRoundRobin(false)` is per-sampler. If your instrument contains multiple samplers, each one needs this call.

## Using Note Callbacks to Switch Articulation Groups via Key Switches [11:15]

```js
function onNoteOn()
{
    local idx = keySwitches.indexOf(Message.getNoteNumber());

    if (idx != -1)
    {
        // indexOf() is 0-based, but setActiveGroup() is 1-based — always add 1
        Sampler.setActiveGroup(idx + 1);
    }
}
```

## Testing and Verifying Group-Based Key Switch Articulations [13:34]

1. Compile (F5) and verify no errors before testing.
2. Play a note to confirm the default state loads Group 1 (first articulation).
3. Trigger the first key switch (C# 0) — the group number indicator should change to 2.
4. Trigger the second key switch (D 0) — the group number indicator should change to 3.
5. Watch the group number display in real time to confirm each key switch routes playback to the correct group.

## Velocity-Based Articulation Switching in a Single Sampler [14:36]

1. Add a new Sampler and name it "Velocity Based".

2. Open the Mapping View and import your sustain samples. Set their velocity range to 0–70.

3. Import the staccato samples and set their velocity range to 71–127. Now velocities below 70 trigger sustains, above 70 trigger staccatos.

4. Limitation of single-sampler velocity splitting: you cannot apply different modulators or processing modules to individual velocity ranges without additional scripting. If you need per-articulation processing, place each articulation in a separate Sampler and control the velocity trigger point via script.

5. Overlapping velocity ranges in a single Sampler will cause both sample sets to trigger simultaneously — use this intentionally if you want to layer/blend articulations in a middle range.

6. Alternative compact mapping scheme: instead of a wide velocity split, assign each articulation a narrow 2-value velocity range (sustains: 0–1, staccatos: 2–3, flutters: 4–5, etc.). Save the sample map after mapping.

7. Advantage of this scheme: HISE supports 0–127 velocity values, giving you up to 64 articulations in a single Sampler using a single group. The remaining groups are then free for other purposes.

## Velocity-Based Articulation Switching Script with Key Switches [18:16]

No sampler reference needed — this approach doesn't use round-robin groups.

```js
// Reuse the key switch array from the group-based approach
var keySwitches = [24, 25, 26];

// Track current articulation velocity slot (0, 2, 4, ...)
// Each articulation occupies two consecutive velocity slots: 0-1, 2-3, 4-5
reg c = 0;

function onNoteOn()
{
    local idx = keySwitches.indexOf(Message.getNoteNumber());

    if (idx != -1)
    {
        // Key switch pressed — update velocity slot (multiply by 2 for slot width)
        c = idx * 2;
    }
    else
    {
        // Regular note — remap velocity to the active articulation's slot
        Message.setVelocity(c);
    }
}
```

**Trade-off:** Velocity is now consumed by the sample mapping, so it cannot drive envelope modulation or other velocity modulators downstream. See steps 7-8 below for how to recover velocity modulator access using a Global Modulator Container.

7. To recover velocity modulator access, add a Global Modulator Container **before** the sampler and script in the signal chain (right-click > "Add Processor Before"). Inside it, add a Global Velocity Modulator (with a table if desired).

8. Back in the sampler's modulator chain, replace any local velocity modulator with a **Global Voice Start Modulator** and link it to the velocity modulator created in step 7. This restores full velocity-to-modulator control (e.g., attack time shaping) while still using velocity values internally for articulation selection.

## Mapping Samples Across the Key Range for Articulation Layouts [23:51]

1. As an alternative to velocity-layer stacking, map each articulation set to a separate, non-overlapping region of the keyboard. Shift each set's root notes and HISE key values down/up accordingly, and transpose incoming MIDI notes in script to land in the correct region for the active articulation.

2. When repositioning sample sets on the keyboard, update both the HISE key and the root note for each region — failing to move both will cause pitch errors.

3. Ensure every articulation set covers the full velocity range (0–127) after repositioning, since moving samples on the keyboard axis does not automatically preserve their velocity mapping.

4. This key-spread layout enables a "no key switching required" design: all articulations remain simultaneously accessible, and the player selects an articulation simply by playing in a different keyboard zone. This is a valid alternative to switching articulations one-at-a-time.

5. The key-spread approach has a practical limit: with three articulations on a clarinet (wide playable range), the combined zones already exceed the span of an 88-key keyboard. Reserve this technique for instruments with a narrower range, or for cases where only a small number of articulations need to coexist (e.g., one sustain zone plus a separate ornaments/trills zone).

## Using Separate Samplers per Articulation [28:03]

1. Create one Sampler module per articulation (e.g., one named "Sustain", one named "Staccato"). This approach is useful when you need to apply different modulators, scripting logic, or layering parameters independently to each articulation — avoiding complex conditional scripting in a single sampler.

2. Map each articulation's samples exclusively into its corresponding sampler: load sustain samples into the Sustain sampler, staccato samples into the Staccato sampler.

## Routing Articulation Switching via MIDI Muters and Key Switches [29:20]

1. Place the articulation-switching script in a container outside the samplers, not inside them. Keep each sampler in its own child container.

2. Do not use the sampler bypass buttons to switch articulations. Bypassing does more than block MIDI — it causes audio artifacts. Instead, control MIDI routing using MIDI Muters.

3. Add a MIDI Muter to each sampler. Always enable "Fixed Notes" mode on each muter — this prevents hanging notes. Name each muter descriptively (e.g. "sustain muter", "staccato muter") or append numbers if you plan to iterate over them programmatically.

```js
// Get references to all muters — muters[0] = sustain, muters[1] = staccato, etc.
const var muters = [Synth.getMidiProcessor("sustain muter"),
                    Synth.getMidiProcessor("staccato muter")];

var keySwitches = [24, 25]; // C0 = sustain, C#0 = staccato

function onNoteOn()
{
    local idx = keySwitches.indexOf(Message.getNoteNumber());

    if (idx != -1)
    {
        // Mute all — use IGNORE_BUTTON constant, not a numeric index
        // (MIDI Muter attributes are not in numeric order)
        for (i = 0; i < muters.length; i++)
            muters[i].setAttribute(muters[i].IgnoreButton, 1);

        // Unmute only the selected articulation
        muters[idx].setAttribute(muters[idx].IgnoreButton, 0);
    }
}
```

**Note:** This loop-based approach works but is not ideal for realtime callbacks — see the next section for an optimized version.

## Avoiding Loops in Realtime Callbacks: The Current-Articulation Variable Pattern [34:23]

Loops inside `onNoteOn` (or any realtime callback) block the audio thread and can cause artifacts. The key insight: since exactly one muter is active at a time, track it with a variable and only touch two modules per key switch — the one going off and the one going on.

```js
// Track the currently active articulation index
reg c = 0;

function onNoteOn()
{
    local idx = keySwitches.indexOf(Message.getNoteNumber());

    if (idx != -1)
    {
        // Mute the currently active articulation
        muters[c].setAttribute(muters[c].IgnoreButton, 1);

        // Switch to the new one
        c = idx;
        muters[c].setAttribute(muters[c].IgnoreButton, 0);
    }
}
```

**Prerequisite:** Before the script runs for the first time, ensure exactly one muter is active (the one matching `c = 0`). If multiple muters are active at startup, switching will silently fail. Scales to any number of articulations as long as key switch indices and muter indices stay in sync.

## Deferring Real-Time Callbacks to the Message Thread [38:12]

1. Call `Synth.deferCallbacks(true)` to move real-time callbacks off the audio thread onto the message thread.

2. Once deferred, a "D" indicator appears next to the affected callbacks in the HISE editor confirming the change.

3. `onInit` and `onControl` are unaffected — they already run on the message thread, so deferring has no effect on them. Only the real-time callbacks (such as `onNoteOn`, `onNoteOff`, `onController`, `onTimer`) are moved.

4. Deferred callbacks allow the use of loops inside real-time callbacks without risking audio dropouts or performance artifacts.

5. Trade-off: if articulation switching is timing-critical, keep callbacks on the real-time thread (i.e., do not defer). Only defer when the loop-based processing inside those callbacks is not latency-sensitive.

## Switching Articulations via Sample Map Swapping [39:27]

1. Save separate sample maps for each articulation (e.g., one velocity-based map, one with all articulations mapped).

2. Add a Sampler and load the desired sample map per articulation.

3. Use this approach for non-real-time articulation switching — trigger it via an on-screen button click or by loading separate presets, not via MIDI/real-time logic.

4. This method suits use cases where each plugin instance carries a single articulation (e.g., multiple instances loaded simultaneously, one per articulation).

Note: Sample map swapping is a valid articulation-separation strategy but is not suitable for real-time switching mid-performance.

## Switching Articulations via MIDI CC (UACC Standard) [40:17]

```js
// UACC values — one per articulation. Standard UACC uses CC 32.
const var uaccValues = [1, 40, 50]; // sustain, staccato, flutter
const var CC = 32; // UACC standard; use CC 1 (mod wheel) for testing

// Use the same values for program changes — keeps numbering interchangeable
const var programs = [1, 40, 50];

function onController()
{
    if (Message.getControllerNumber() == CC)
    {
        local idx = uaccValues.indexOf(Message.getControllerValue());

        // Same index+1 pattern as key switches (setActiveGroup is 1-based)
        if (idx != -1)
            Sampler.setActiveGroup(idx + 1);
    }
}
```

CC-based and key switch switching can coexist in the same script. CC is better in a DAW/sequencer (tracks the last value); key switches are better for live performance (discrete, instant).

Why UACC: it's an adopted standard among orchestral library developers — your articulation numbers become interoperable with hosts and scripts that support UACC.

## Handling Program Change Messages for Articulation Switching [48:25]

**Important:** The program change check must come first in the callback. Calling `Message.getControllerNumber()` on a program change message triggers a HISE bug ("get controller number outside of onController callback").

```js
function onController()
{
    // Program change check MUST come before CC check — see note above
    if (Message.isProgramChange())
    {
        local idx = programs.indexOf(Message.getProgramChangeNumber());

        if (idx != -1)
            Sampler.setActiveGroup(idx + 1);
    }
    else if (Message.getControllerNumber() == CC)
    {
        local idx = uaccValues.indexOf(Message.getControllerValue());

        if (idx != -1)
            Sampler.setActiveGroup(idx + 1);
    }
}
```

**Note:** HISE program change numbers are zero-based. Some hardware keyboards send one-based values, so program 51 on the keyboard may correspond to index 50 in HISE.

## Crossfade Articulation Switching Using Group XF and Mod Wheel [54:00]

1. Add a Sampler. Map sustain samples to Group 1 and crossfade-target samples (e.g. flutter tongue) to Group 2, ensuring both groups cover the same key range.

   Note: This single-sampler approach works when you have no multiple dynamics layers. With multiple dynamics, use two separate Samplers and control crossfading via gain envelopes (or script it).

2. Enable the "Group XF" setting on the Sampler. This feature is normally used for dynamic crossfading but works equally well for articulation crossfading.

3. Open the crossfade table for each group and set the fade curves. A roughly equal-power curve is a reasonable starting point.

4. In the Group XF modulator slot, add a MIDI Controller modulator (e.g. Mod Wheel, CC1). Increase the smoothing parameter to taste so the crossfade transition is gradual rather than stepped.

5. Ensure all samples in the crossfade groups are looped. Shorter samples (like flutter tongue) will otherwise fade out to silence mid-crossfade rather than sustaining.

6. Be aware that Group XF triggers all groups simultaneously, increasing voice count. With two groups, one note costs two voices. With three dynamics x three mic positions x two articulation groups, that is 18 voices per note.

7. To mitigate the voice count problem, prevent the secondary group (flutter) from triggering until the mod wheel reaches a minimum threshold (e.g. CC value >= 5). This means at rest position only the primary (sustain) group plays.

8. For UI-button-based articulation switching (instead of key switches or mod wheel), use an array of buttons mapped to the same logic as key switches, replacing the key-switch index with the button index, then call `setActiveGroup`, enable/disable samples, or change velocity depending on your sample mapping approach.
