---
title: "How to draw a transparent image in HISE"
summary: "How to control image opacity in a Panel paint routine using g.setColour with Colours.withAlpha before g.drawImage."
channel: "David Healey"
videoId: "KGOB5woRTvo"
url: "https://youtube.com/watch?v=KGOB5woRTvo"
publishDate: "2023-04-01"
views: 0
likes: 0
duration: 93
domain: "ui"
---

# How to draw a transparent image in HISE — David Healey

## Introduction

This recipe shows how to control the opacity of an image drawn on a Panel using `Colours.withAlpha` before `g.drawImage`.

## Drawing a Transparent Image on a Panel [00:00]

Call `g.setColour()` with `Colours.withAlpha()` immediately before `g.drawImage()`. The colour value itself is irrelevant — only the alpha parameter matters:

```javascript
panel.setPaintRoutine(function(g)
{
    // Only the alpha value is used; the colour is ignored
    g.setColour(Colours.withAlpha(Colours.white, 0.5)); // 0.0 = invisible, 1.0 = opaque

    local a = this.getLocalBounds(0);
    g.drawImage("myImage", a, 0, 0);
});
```

Key points:
- Alpha range is `0.0` (fully transparent) to `1.0` (fully opaque).
- The chosen colour (e.g. `Colours.white`, `Colours.red`) has no visual effect — only the alpha value is applied to the image.
- This must be called every paint routine invocation — it is not a persistent property.
