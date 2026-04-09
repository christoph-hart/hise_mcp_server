---
title: "Make the HISE Keyboard Look Awesome"
summary: "Builds a custom-styled MIDI keyboard using drawWhiteNote and drawBlackNote LAF functions with triangle shapes, key-press animation, hover effects, and Engine.setKeyColour for key-switch markers."
channel: "David Healey"
videoId: "et0QAQOjhyk"
url: "https://youtube.com/watch?v=et0QAQOjhyk"
publishDate: "2022-06-18"
views: 1177
likes: 26
duration: 1417
domain: "ui"
---

# Make the HISE Keyboard Look Awesome — David Healey

## Introduction

This recipe builds a custom-styled MIDI keyboard using Look and Feel callbacks. You'll register `drawWhiteNote` and `drawBlackNote` functions to draw triangle-shaped keys with press animation and hover effects, and use `Engine.setKeyColour()` to mark key-switch zones.

## Building the UI [00:50]

Add two FloatingTile components set to `Keyboard` type. The first acts as a reference (keep default styling). The second (`flt_keyboard`) is the one to style — remove its background colour so it renders transparently. Add a Panel behind both as a coloured backdrop. Set `lowKey` to 24 on both keyboards.

## Local look and feel [02:40]

Use `Content.createLocalLookAndFeel()` instead of `Engine.createGlobalScriptLookAndFeel()`. Local LAF applies only to the single control you attach it to.

```javascript
const var fltKeyboard = Content.getComponent("flt_keyboard");
const var keyboardLAF = Content.createLocalLookAndFeel();
fltKeyboard.setLocalLookAndFeel(keyboardLAF);
```

## Setting key colours with Engine.setKeyColour [03:45]

Clear all key colours to fully transparent before applying custom colours. This gives a known baseline inside LAF callbacks.

```javascript
for (var i = 0; i < 128; i++)
{
    Engine.setKeyColour(i, 0x00000000); // fully transparent
}

Engine.setKeyColour(60, Colours.blue); // middle C as a key-switch marker
```

The loop must go to `< 128`, not `< 127`, or the last key retains its default colour.

## Look and feel functions and obj properties [05:10]

Register the two drawable callbacks. The keyboard supplies the same `obj` structure to both.

```javascript
keyboardLAF.registerFunction("drawWhiteNote", function(g, obj)
{
    Console.print(trace(obj)); // inspect once, then remove
});

keyboardLAF.registerFunction("drawBlackNote", function(g, obj)
{
    // same obj structure as white note
});
```

`obj` properties:

| Property | Type | Notes |
|---|---|---|
| `obj.area` | `[x, y, w, h]` | Pixel bounds of this key |
| `obj.noteNumber` | int | 0–127 |
| `obj.hover` | bool | Mouse is over the key |
| `obj.down` | bool | Key is currently pressed |
| `obj.keyColour` | int | Colour set via `Engine.setKeyColour()`; `0` if transparent |

## Drawing the keys — triangle shapes with animation and hover [09:40]

**White keys** — draw a triangle at the bottom third; expand to full area on key press:

```javascript
keyboardLAF.registerFunction("drawWhiteNote", function(g, obj)
{
    var a = obj.area;
    var colour = obj.keyColour;

    if (!colour)
        colour = Colours.antiquewhite; // fallback for uncoloured keys

    // Full area when pressed, bottom third when idle
    var keyArea = [a[0], a[1], a[2], a[3]];

    if (!obj.down)
        keyArea = [a[0], a[1] + a[3] - a[3] / 3, a[2], a[3] / 3];

    // Reduce opacity on hover (but not when pressed)
    g.setColour(Colours.withAlpha(colour, (obj.hover && !obj.down) ? 0.5 : 1.0));
    g.fillTriangle(keyArea, 0.0);
});
```

**Black keys** — flipped triangle at the top, rotating 180 degrees:

```javascript
keyboardLAF.registerFunction("drawBlackNote", function(g, obj)
{
    var a = obj.area;
    var colour = obj.keyColour;

    if (!colour)
        colour = Colours.black;

    var keyArea = [a[0], a[1], a[2], a[3]];

    if (!obj.down)
        keyArea = [a[0], 0, a[2], a[3] / 3];

    g.setColour(Colours.withAlpha(colour, (obj.hover && !obj.down) ? 0.5 : 1.0));
    g.fillTriangle(keyArea, Math.toRadians(180.0));
});
```

- `obj.hover` is the correct property for keyboard keys (not `obj.over` which is for buttons/sliders).
- When `obj.down` is true, opacity stays at `1.0` regardless of hover state.
- The hover hit area covers the full invisible key bounds, not just the drawn triangle.
