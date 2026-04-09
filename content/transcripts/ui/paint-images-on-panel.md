---
title: "How to paint images on a panel in HISE"
summary: "How to load an image into a Panel, draw it in a paint routine using g.drawImage, and control positioning with offsets."
channel: "David Healey"
videoId: "MkWBdLYlWjM"
url: "https://youtube.com/watch?v=MkWBdLYlWjM"
publishDate: "2023-02-25"
views: 0
likes: 0
duration: 299
domain: "ui"
---

# How to paint images on a panel in HISE — David Healey

## Introduction

This recipe shows how to load an image into a Panel and draw it in a paint routine, including how to use offsets to reframe the image.

## Loading and Drawing an Image on a Panel [00:28]

1. Add a Panel and get a script reference:

```javascript
const var Panel1 = Content.getComponent("Panel1");
```

2. Load the image at init. Images must be in the project's `Images` folder. The second argument is a string ID ("pretty name") used to reference the image in the paint routine:

```javascript
Panel1.loadImage("{PROJECT_FOLDER}piggy.jpg", "piglet");
```

3. Set the paint routine and draw the image:

```javascript
Panel1.setPaintRoutine(function(g)
{
    local a = this.getLocalBounds(0); // [x, y, width, height]
    g.drawImage("piglet", a, 0, 0);
    //           ^name    ^area ^xOffset ^yOffset
});
```

## Controlling Image Position with Offsets [03:57]

- `g.drawImage(id, area, xOffset, yOffset)` — the offset parameters shift the source image within the draw area.
- Use `0, 0` for no offset, or increase the Y offset to reframe a tall image within a shorter panel.
- The image scales automatically when the panel is resized.
- Assigning a paint routine clears the panel's default appearance — HISE gives you a blank canvas.
- `loadImage()` must be called before the paint routine runs. Pretty names are scoped to the panel they were loaded into.
