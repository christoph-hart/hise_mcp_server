---
title: "HISE: How to script efficiently"
summary: "Practical guide to efficient HiseScript patterns: shared callbacks with component parameter, string concatenation for dynamic names, for loops for array population, Array.push(), indexOf, continue keyword, and scaling UI code from 3 to N controls."
channel: "David Healey"
videoId: "T40GCkxx8iw"
url: "https://youtube.com/watch?v=T40GCkxx8iw"
publishDate: "2021-12-18"
views: 0
likes: 0
duration: 2988
domain: "guide"
---

# HISE: How to script efficiently — David Healey

## Introduction

This tutorial builds a radio-button interface from scratch, progressively refactoring verbose code into efficient, scalable patterns. You'll learn shared callbacks, string concatenation for dynamic component names, array population with loops, and the `continue` keyword.

## Project setup and interface [00:00]

Create a new HISE project. Add 3 buttons and 1 label. Disable "Save in Preset" on all controls. Reset the label text at init:

```javascript
const var Button1 = Content.getComponent("Button1");
const var Button2 = Content.getComponent("Button2");
const var Button3 = Content.getComponent("Button3");
const var Label1 = Content.getComponent("Label1");
Label1.set("text", "");
```

## Verbose approach — separate callbacks [03:42]

Right-click each button > "Create custom callback definition". Each callback updates the label and turns off the other two buttons:

```javascript
inline function onButton1Control(component, value)
{
    if (value == 1)
        Label1.set("text", "Button 1 was clicked");
    Button2.setValue(0);
    Button3.setValue(0);
}
```

This works but doesn't scale — adding buttons requires duplicating callback code.

## Refactor — one shared callback [15:23]

Replace three callbacks with one. The `component` parameter identifies which button fired:

```javascript
inline function onButtonControl(component, value)
{
    if (value == 1)
        Label1.set("text", component.get("text") + " was clicked");

    for (btn in [Button1, Button2, Button3])
    {
        if (btn != component)
            btn.setValue(0);
    }
}

Button1.setControlCallback(onButtonControl);
Button2.setControlCallback(onButtonControl);
Button3.setControlCallback(onButtonControl);
```

## String concatenation for dynamic component names [19:40]

Build component names in a loop using `+`. Parentheses around `(i + 1)` force arithmetic before string concatenation:

```javascript
const var NUM_BUTTONS = 3;
const var buttons = [];

for (i = 0; i < NUM_BUTTONS; i++)
{
    buttons[i] = Content.getComponent("Button" + (i + 1));
    buttons[i].setControlCallback(onButtonControl);
}
```

Without parentheses, `"Button" + i + 1` produces `"Button01"` instead of `"Button1"`.

## Array.push() vs index assignment [31:56]

```javascript
// Explicit index (preferred when position matters):
buttons[i] = Content.getComponent("Button" + (i + 1));

// push() (use when only appending matters):
buttons.push(Content.getComponent("Button" + (i + 1)));
```

## Final pattern — scalable radio-button script [34:43]

Use `indexOf` and `continue` to skip the clicked button in the reset loop:

```javascript
const var NUM_BUTTONS = 3;
const var buttons = [];
const var Label1 = Content.getComponent("Label1");

for (i = 0; i < NUM_BUTTONS; i++)
{
    buttons[i] = Content.getComponent("Button" + (i + 1));
    buttons[i].setControlCallback(onButtonControl);
}

inline function onButtonControl(component, value)
{
    Label1.set("text", component.get("text") + " was clicked");

    for (i = 0; i < buttons.length; i++)
    {
        if (buttons[i] == component) continue;
        buttons[i].setValue(0);
    }
}
```

To support 6 buttons instead of 3, change only `NUM_BUTTONS = 6` and duplicate the button components.
