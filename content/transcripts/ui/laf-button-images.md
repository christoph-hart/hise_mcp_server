---
title: "Using images with Look and Feel | LAF button images"
summary: "How to use frame-based sprite images with Look and Feel to draw custom button states, using loadImage and drawImage inside drawToggleButton."
channel: "David Healey"
videoId: "ByhODygMhqM"
url: "https://youtube.com/watch?v=ByhODygMhqM"
publishDate: "2023-04-22"
views: 0
likes: 0
duration: 441
domain: "ui"
---

# Using images with Look and Feel | LAF button images — David Healey

## Introduction

This recipe shows how to use sprite sheet images with Look and Feel to draw custom button states. It covers loading images into a LAF object, registering `drawToggleButton`, and selecting the correct frame based on button state.

## Local Look and Feel Setup for Buttons [00:00]

Create a local LAF object and assign it to a specific button:

```javascript
const var Button1 = Content.getComponent("Button1");
const var buttonLAF = Content.createLocalLookAndFeel();

Button1.setLocalLookAndFeel(buttonLAF);
```

## Loading an Image and Registering drawToggleButton [02:30]

Use `loadImage` on the LAF object. The second argument is a string ID used to reference the image inside callbacks:

```javascript
buttonLAF.loadImage("{PROJECT_FOLDER}black_on_off.png", "button");
```

Register the `drawToggleButton` function. Once registered, HISE stops drawing the default button — the callback handles all rendering:

```javascript
buttonLAF.registerFunction("drawToggleButton", function(g, obj)
{
    var a = obj.area;
    var frameHeight = 30; // total image height / number of frames
    g.drawImage("button", a, 0, frameHeight * obj.value);
});
```

## Frame-Based Image Sprites [05:00]

Pack multiple button states vertically into one image file. Each frame must be the same height.

- `obj.value` is `0` (off) or `1` (on), selecting the correct frame via the Y offset.
- `g.drawImage(id, area, xOffset, yOffset)` — pass `0` for X offset, `frameHeight * obj.value` for Y offset.
- The button component size should match one frame (e.g. 65x30), not the full sprite sheet height.
- Resizing the component scales the drawn frame — use high-resolution source images to avoid quality loss.
- An empty registered callback produces an invisible control, which is a valid technique for hiding components without a blank PNG.
