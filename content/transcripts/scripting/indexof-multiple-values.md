---
title: "How to test a knob for multiple values | using indexOf with an inline array"
summary: "Shows how to use Array.indexOf() with an inline array to cleanly check if a knob value matches any of several discrete values, replacing long chains of || comparisons."
channel: "David Healey"
videoId: "qzeSyfkOo4k"
url: "https://youtube.com/watch?v=qzeSyfkOo4k"
publishDate: "2022-06-25"
views: 0
likes: 0
duration: 205
domain: "scripting"
---

# How to test a knob for multiple values — David Healey

## Introduction

This recipe shows a clean pattern for checking if a knob value matches any of several discrete values using `indexOf()` with an inline array, replacing long chains of `||` comparisons.

## Check for multiple values with indexOf [00:10]

Instead of chaining `||` comparisons:

```javascript
inline function onKnobControl(component, value)
{
    // Verbose — gets unwieldy with many values
    if (value == 10 || value == 8 || value == 5)
        Console.print("hello world");
}
```

Use an inline array with `.indexOf()`:

```javascript
inline function onKnobControl(component, value)
{
    if ([10, 8, 5].indexOf(value) != -1)
        Console.print("hello world");
}
```

- `[10, 8, 5].indexOf(value)` scans the array for `value`.
- Returns the index if found (0, 1, 2...), or `-1` if not found.
- `!= -1` means "value was found in the array".
- Add or remove values from the array literal to adjust which values trigger the response, without changing the logic.
