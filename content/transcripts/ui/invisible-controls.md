---
title: "HISE: Making invisible controls"
summary: "Shows how to make buttons and sliders invisible but still clickable by assigning a blank PNG as the filmstrip image."
channel: "David Healey"
videoId: "fXAyQc9xiX0"
url: "https://youtube.com/watch?v=fXAyQc9xiX0"
publishDate: "2022-01-08"
views: 0
likes: 0
duration: 187
domain: "ui"
---

# HISE: Making invisible controls — David Healey

## Introduction

A quick recipe for making buttons or sliders invisible while keeping them fully interactive.

## Making invisible controls with a blank filmstrip [00:00]

Setting colours to transparent still leaves the indicator light and text visible. Instead, apply a blank PNG as the filmstrip image.

1. Create a small blank PNG (e.g. 1x1 px). Name it `empty.png` and place it in the project Images folder.
2. Select the button in the interface editor.
3. Set its `filmstripImage` property to `empty.png`.
4. The button is now invisible but retains full click functionality, tooltip, and value pop-up.

**Use cases:**
- Invisible button over a label/logo to open a URL.
- Invisible button over a preset name to open the preset browser.
- Invisible slider over a custom-drawn panel to retain the value pop-up.
