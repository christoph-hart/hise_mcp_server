---
title: "Playing with knobs in HISE"
summary: "Comprehensive beginner guide to knobs in HISE covering Processor ID linking, control callbacks, gain factor conversion, module arrays with loops, master knob patterns with link/gang buttons, and for-in loops."
channel: "David Healey"
videoId: "1rs0w4MDNA0"
url: "https://youtube.com/watch?v=1rs0w4MDNA0"
publishDate: "2022-04-16"
views: 0
likes: 0
duration: 3191
domain: "guide"
---

# Playing with knobs in HISE — David Healey

## Introduction

This comprehensive beginner guide covers everything about knobs in HISE: linking via Processor ID, control callbacks with gain factor conversion, building module arrays with loops, master knob patterns with link and gang buttons, and choosing between indexed `for` and `for...in` loops.

## Adding a knob and setting Decibel mode [00:00]

Add a Simple Gain module (rename to `simple gain 0` for loop-friendly naming). On the interface, right-click and choose "Add New Slider" (default style is a knob). In the Property Editor, set **Mode → Decibel** to auto-fill the dB range.

## Link a knob via Processor ID [04:09]

Select the knob, set **Processor ID → simple gain 0** and **Parameter ID → gain**. This is a one-way connection — moving the module knob does not update the interface knob.

**Limitation:** Only one target per knob. Processor ID and a control callback cannot be active simultaneously — the callback never fires if Processor ID is set. Clear Processor ID before using callbacks.

## Control callbacks and gain factor conversion [04:55]

Use callbacks when you need multiple targets, value conversion, or combined logic. The Master Chain gain uses a gain factor internally, not dB — convert with `Engine.getGainFactorForDecibels()`.

```javascript
const var masterContainer = Synth.getParentSynth();

inline function onKnbGainControl(component, value)
{
    masterContainer.setAttribute(masterContainer.Gain,
        Engine.getGainFactorForDecibels(value));
}

Content.getComponent("knbGain").setControlCallback(onKnbGainControl);
```

For a Simple Gain, pass `value` directly — no conversion needed.

## Controlling multiple modules with a loop [07:26]

Name modules `simple gain 0`, `simple gain 1`, `simple gain 2`. Build an array at init, then iterate in the callback.

```javascript
const var simpleGain = [];

for (var i = 0; i < 3; i++)
    simpleGain.push(Synth.getEffect("simple gain " + i));

inline function onKnbGainControl(component, value)
{
    for (var i = 0; i < simpleGain.length; i++)
        simpleGain[i].setAttribute(simpleGain[i].Gain, value);
}
```

## Master knob controlling sub-knobs [24:08]

Instead of setting module parameters directly, set sub-knob values and let each propagate via its own callback. Call `.changed()` to trigger the downstream update.

```javascript
const var knbGain = [];
const var btnLink = [];

for (var i = 0; i < 3; i++)
{
    knbGain.push(Content.getComponent("knbGain" + i));
    btnLink.push(Content.getComponent("btnLink" + i));
}

const var btnMaster = Content.getComponent("btnMaster");

inline function onKnbMasterControl(component, value)
{
    if (btnMaster.getValue())
    {
        for (var i = 0; i < knbGain.length; i++)
        {
            if (btnLink[i].getValue())
            {
                knbGain[i].setValue(value);
                knbGain[i].changed();
            }
        }
    }
}
```

## Linking controls via shared callbacks and gang button [32:43]

Remove Processor ID from all knobs and use a shared callback. Use `indexOf(component)` to identify which knob was moved.

```javascript
inline function onKnbGainControl(component, value)
{
    local index = knbGain.indexOf(component);

    if (!btnGang.getValue())
    {
        simpleGain[index].setAttribute(simpleGain[index].Gain, value);
    }
    else
    {
        for (i = 0; i < knbGain.length; i++)
        {
            knbGain[i].setValue(value);
            simpleGain[i].setAttribute(simpleGain[i].Gain, value);
        }
    }
}
```

## Gang button — force link buttons and disable interaction [43:07]

When gang is toggled, force all link buttons ON and disable them so the user cannot manually unlink.

```javascript
inline function onBtnGangControl(component, value)
{
    for (x in btnLink)
    {
        x.setValue(value);
        x.set("enabled", 1 - value);
    }
}
```

## For-in loop vs indexed for loop [48:32]

- Use `for (x in array)` when you only need the element (no index math).
- Use `for (i = 0; ...)` when you need `i` for index arithmetic or parallel array access.
