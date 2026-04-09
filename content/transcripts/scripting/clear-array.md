---
title: "How to clear an array in HISE"
summary: "Shows how to use Array.clear() to empty an array declared with const var, since const var arrays cannot be reassigned."
channel: "David Healey"
videoId: "wKLbYyZpVaY"
url: "https://youtube.com/watch?v=wKLbYyZpVaY"
publishDate: "2022-08-06"
views: 0
likes: 0
duration: 58
domain: "scripting"
---

# How to clear an array in HISE — David Healey

## Introduction

A quick recipe showing how to properly empty an array in HiseScript using `Array.clear()`.

## How to clear an array using Array.clear() [00:00]

Use `Array.clear()` to empty a `const var` array. Do not reassign a `const var` — this causes a compile error.

```javascript
// WRONG: cannot reassign a const var
const var r = [1, 2, 3];
r = []; // ERROR

// CORRECT: use the built-in clear method
const var r = [1, 2, 3];
r.clear();
Console.print(r.length); // 0
```

Use `reg` only if you genuinely need to reassign the variable itself; prefer `const var` with `.clear()` for arrays.
