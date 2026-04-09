---
title: "Lottie animations in HISE | Lottie knobs and sliders"
summary: "How to load Lottie animations into HISE, display them on a Panel, and wire a knob to scrub through animation frames for animated knobs and sliders."
channel: "David Healey"
videoId: "5aFbxEY2eRQ"
url: "https://youtube.com/watch?v=5aFbxEY2eRQ"
publishDate: "2023-06-03"
views: 0
likes: 0
duration: 636
domain: "ui"
---

# Lottie animations in HISE | Lottie knobs and sliders — David Healey

## Introduction

This recipe shows how to import a Lottie animation into HISE, display it on a Panel, and wire a knob to scrub through animation frames — creating animated knobs or sliders without filmstrip images.

## Loading a Lottie Animation into HISE [00:00]

1. Download a Lottie animation as a `.json` file (e.g. from IconScout).
2. In HISE, open a custom floating window: top toolbar > Create New Pop-up.
3. Right-click inside > Toggle Global Layout Mode (disable), then right-click > Lottie Dev Panel.
4. Paste the JSON content into the text area, click **Load**, then click **Compress** — this produces a Base64 string.
5. Copy the compressed string.

## Embedding the Animation and Displaying It on a Panel [02:30]

```javascript
const var lottieData = "...base64string...";
const var pnlLottie = Content.getComponent("pnlLottie");

// Assign the animation — panel displays the first frame
pnlLottie.setAnimation(lottieData);

// Query frame metadata
const var animData = pnlLottie.getAnimationData();
// animData contains: currentFrame, numberOfFrames, frameRate

// Jump to a specific frame
pnlLottie.setAnimationFrame(50);
```

## Wiring a Knob to Scrub Through Animation Frames [05:00]

1. Add a Knob. Set its **Maximum** to the animation's `numberOfFrames` (e.g. `121`), **Step Size** to `1`, and **Middle Position** to approximately half.

2. Wire the knob to the panel's animation frame:

```javascript
const var Knob1 = Content.getComponent("Knob1");

inline function onKnobControl(component, value)
{
    pnlLottie.setAnimationFrame(value);
}

Knob1.setControlCallback(onKnobControl);
```

## Making the Knob Invisible Over the Animation Panel [07:30]

To create the illusion of clicking directly on the animation:

1. Position the knob over the panel at the same location and size.
2. Assign an empty/transparent PNG as the knob's filmstrip image.
3. Set **Number of Strips** to `1`.
4. Compile — the knob becomes invisible but fully interactive.

Alternatively, achieve the same effect with a custom Look and Feel, but an empty filmstrip is simpler.
