---
title: "Assigning a control callback to multiple controls"
summary: "How to assign a single shared control callback to multiple buttons, identify which control triggered it using indexOf, and implement radio button behaviour."
channel: "David Healey"
videoId: "akMfRpFYOP8"
url: "https://youtube.com/watch?v=akMfRpFYOP8"
publishDate: "2023-06-17"
views: 0
likes: 0
duration: 590
domain: "scripting"
---

# Assigning a control callback to multiple controls — David Healey

## Introduction

This recipe shows how to assign a single shared callback to a group of buttons, identify which one fired using `indexOf`, and implement both deselectable and always-on radio button behaviour.

## Building a Control Array and Assigning a Shared Callback [00:00]

Name controls with a numeric suffix (e.g. `BtnRadio0`, `BtnRadio1`, `BtnRadio2`). Build an array of references in a loop:

```javascript
const var BtnRadio = [];

for (i = 0; i < 4; i++)
    BtnRadio.push(Content.getComponent("BtnRadio" + i));
```

Define a single `inline function` and assign it to every control:

```javascript
inline function onBtnRadioControl(component, value)
{
    local index = BtnRadio.indexOf(component);
    Console.print(index);
}

for (i = 0; i < 4; i++)
    BtnRadio[i].setControlCallback(onBtnRadioControl);
```

Use `Array.indexOf(component)` to convert the component reference back to a numeric index.

## Radio Button Behaviour — Deselectable [05:00]

Respond only when a button is turned on (`value == 1`), then turn all others off:

```javascript
inline function onBtnRadioControl(component, value)
{
    local index = BtnRadio.indexOf(component);

    if (value)
    {
        for (i = 0; i < BtnRadio.length; i++)
        {
            if (i != index)
                BtnRadio[i].setValue(0);
        }
    }
}
```

## Radio Button Behaviour — Always-On Variant [07:30]

To prevent deselection (one button must always be active), remove the `if (value)` guard and force the clicked button on:

```javascript
inline function onBtnRadioControl(component, value)
{
    local index = BtnRadio.indexOf(component);

    for (i = 0; i < BtnRadio.length; i++)
    {
        if (i != index)
            BtnRadio[i].setValue(0);
    }

    BtnRadio[index].setValue(1);
}
```

Using `BtnRadio.length` instead of a hard-coded count means adding buttons later requires no code changes.
