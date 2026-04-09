---
title: "How to set key colours in HISE"
summary: "How to use Engine.setKeyColour() to colour individual keys or ranges on the HISE onscreen keyboard, with Colours namespace constants and alpha transparency."
channel: "David Healey"
videoId: "GLxLoUKFWmo"
url: "https://youtube.com/watch?v=GLxLoUKFWmo"
publishDate: "2024-12-28"
views: 447
likes: 17
duration: 269
domain: "ui"
---

# How to set key colours in HISE — David Healey

## Introduction

This recipe shows how to colour individual keys on the HISE onscreen keyboard using `Engine.setKeyColour()`. You'll learn to apply named colour constants, adjust alpha transparency, colour key ranges with loops, and control which octave the keyboard displays.

## Setting key colours with Engine.setKeyColour() [00:00]

Add a Floating Tile and set its content type to Keyboard. The keyboard is styled via scripting rather than Look and Feel.

`Engine.setKeyColour(noteNumber, colour)` sets the colour of a single key. The colour argument accepts either a predefined constant from the `Colours` namespace or a raw hex value in `0xAARRGGBB` format. Passing `0x00000000` resets a key to its default appearance.

```javascript
// Set a single key colour (Middle C = MIDI note 60)
Engine.setKeyColour(60, Colours.red);

// Use Colours.withAlpha() to set opacity (0.0-1.0) for a tinted appearance
Engine.setKeyColour(60, Colours.withAlpha(Colours.red, 0.5));

// Reset a key to default
Engine.setKeyColour(60, 0x00000000);

// Colour a range of keys (notes 60-72 inclusive)
for (i = 60; i < 73; i++)
    Engine.setKeyColour(i, Colours.withAlpha(Colours.blue, 0.2));
```

## Colouring multiple key ranges and adjusting keyboard display [02:30]

You can paint separate key ranges with different colours by using multiple loops:

```javascript
// Range 1: keys 24-48, blue at 20% opacity
for (i = 24; i < 49; i++)
    Engine.setKeyColour(i, Colours.withAlpha(Colours.blue, 0.2));

// Range 2: keys 49-72, green at full opacity
for (i = 49; i < 73; i++)
    Engine.setKeyColour(i, Colours.green);

// Raw hex colour instead of a Colours constant
Engine.setKeyColour(60, 0xFF808000); // opaque olive
```

To browse all available colour constants, type `Colours.` in the script editor and trigger autocomplete (Escape key). The dropdown shows a colour preview swatch next to each constant name.

To control which octave range the onscreen keyboard displays, use `Engine.setLowestKeyToDisplay(keyNumber)` (e.g. 24 for C1) so that the coloured keys are visible on screen.
