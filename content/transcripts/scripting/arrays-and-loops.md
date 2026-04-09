---
title: "Beginners guide to arrays and loops"
summary: "Beginner guide covering arrays vs variables, for loops with .length, for-in loops, populating arrays with push() and inline declaration, and iterating component/module reference arrays."
channel: "David Healey"
videoId: "Y8sraa5ig-M"
url: "https://youtube.com/watch?v=Y8sraa5ig-M"
publishDate: "2022-05-07"
views: 0
likes: 0
duration: 1537
domain: "scripting"
---

# Beginners guide to arrays and loops — David Healey

## Introduction

This beginner recipe covers the fundamentals of arrays and loops in HiseScript: why arrays replace multiple variables, how to iterate with indexed `for` and `for...in` loops, and practical patterns for populating arrays with component and module references.

## Variables vs arrays [03:36]

A variable is a single named box. An array is a named set of boxes, each accessed by a zero-based index.

```javascript
// Four variables — verbose
const var v0 = 10;
const var v1 = 20;
const var v2 = 30;
const var v3 = 40;

// Same data in one array — preferred
const var a = [10, 20, 30, 40];
Console.print(a[0]); // 10
Console.print(a[3]); // 40
```

## For loop [07:06]

Use `a.length` (not a hard-coded count) so the loop auto-adjusts when elements are added or removed.

```javascript
const var a = [10, 20, 30, 40];

// Standard indexed for loop
for (i = 0; i < a.length; i++)
    Console.print(a[i]);
```

Choose indexed `for` when you need the index for calculations.

## Fixing nested array bugs [13:12]

Nested arrays do not forward method calls to their contents. If `joined = [array2, array3]`, then `joined[i].setBypassed(...)` fails because `joined[i]` is an array, not a module.

**Fix:** Store module references directly in a flat array.

```javascript
// WRONG — joined[i] is an array, not a module
const var joined = [array2, array3];

// CORRECT — store module references flat
const var sineGens = [sineWave3, sineWave4];
for (x in sineGens)
    x.setBypassed(1 - value);
```

## Populating arrays [14:12]

Three equivalent ways to fill an array:

```javascript
// 1. Inline declaration (preferred for fixed sets)
const var sineGens = [Synth.getChildSynth("Sine Wave 3"),
                      Synth.getChildSynth("Sine Wave 4")];

// 2. push() — appends to end
const var sineGens = [];
sineGens.push(Synth.getChildSynth("Sine Wave 3"));
sineGens.push(Synth.getChildSynth("Sine Wave 4"));

// 3. Explicit index assignment
const var sineGens = [];
sineGens[0] = Synth.getChildSynth("Sine Wave 3");
sineGens[1] = Synth.getChildSynth("Sine Wave 4");
```

HISE shortcut: select components in the panel, right-click > "Create script variable definition" to generate ready-made declarations.

## For-in loop [20:32]

`for...in` is more efficient than an indexed `for` loop when you don't need the index. Use it by default.

```javascript
// Two separate for-in loops — clearest intent
inline function onButtonControl(component, value)
{
    for (x in sineGens)
        x.setBypassed(1 - value);

    for (p in panels)
        p.showControl(value);
}
```

Use a single indexed loop only when both arrays have equal length and operating on both simultaneously makes logical sense. Prefer two loops when the collections are logically unrelated.
