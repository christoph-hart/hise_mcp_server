---
title: "How to reserve array memory in HISE"
summary: "Shows how to use Array.reserve() to pre-allocate memory for arrays of known size, avoiding incremental resizing during population."
channel: "David Healey"
videoId: "Y0Ki4upiDYw"
url: "https://youtube.com/watch?v=Y0Ki4upiDYw"
publishDate: "2022-04-30"
views: 0
likes: 0
duration: 144
domain: "scripting"
---

# How to reserve array memory in HISE — David Healey

## Introduction

A quick recipe showing how to pre-allocate array memory with `.reserve()` when the final size is known ahead of time.

## Declaring an array with reserved memory [00:08]

If you know the final size of an array, call `.reserve()` immediately after declaration to pre-allocate memory and avoid incremental resizing.

```javascript
// Declare array (reg for audio thread, const var also works)
reg a;

// Reserve memory for known size BEFORE populating
a.reserve(10);

// Populate later
for (i = 0; i < 10; i++)
{
    a[i] = i;
}
```

- `.reserve(n)` works on both `reg` and `const var` arrays.
- Benefits scale with array size — most impactful on large datasets.
- Call `.reserve()` at script init, before any population logic.
