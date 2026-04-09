---
title: "How to set an image for a button | button filmstrips"
summary: "How to assign a filmstrip image to a HISE button with the correct 6-frame layout, dimensions, and scale factor for HiDPI."
channel: "David Healey"
videoId: "d77QJfEMGms"
url: "https://youtube.com/watch?v=d77QJfEMGms"
publishDate: "2023-01-22"
views: 0
likes: 0
duration: 202
domain: "ui"
---

# How to set an image for a button | button filmstrips — David Healey

## Introduction

This recipe shows how to assign a filmstrip image to a HISE button component with the correct frame layout, dimensions, and scale factor for HiDPI displays.

## Button Filmstrip Image Setup [00:00]

A button filmstrip must contain exactly **6 frames** stacked vertically in a single image:

| Frame | State |
|---|---|
| 0 | Off |
| 1 | On |
| 2 | Off + Pressed |
| 3 | On + Pressed |
| 4 | Off + Hover |
| 5 | On + Hover |

Place the image in the project's `Images` folder.

## Assigning and Sizing the Filmstrip [02:30]

1. Select the button in the UI editor.
2. In the property panel, set **Film Strip Image** to the image file (HISE navigates to `Images/`).
3. Set **Num Strips** to `6`.
4. Set the button's **Width** and **Height** to match a single frame:

```
frame width  = image width
frame height = image height / 6
```

Example: a 200x300 px image with 6 strips = button size **200x50**.

**HiDPI / Scale Factor:** To use a 2x resolution image displayed at half size, set the button dimensions to the target display size and set **Scale Factor** to `0.5`.
