---
title: "HISE: How to round decimal numbers for display"
summary: "Shows how to use Engine.doubleToString() to format floating-point numbers with a fixed number of decimal places for UI display."
channel: "David Healey"
videoId: "CePGGTZ9OEU"
url: "https://youtube.com/watch?v=CePGGTZ9OEU"
publishDate: "2022-10-15"
views: 0
likes: 0
duration: 60
domain: "scripting"
---

# HISE: How to round decimal numbers for display — David Healey

## Introduction

A quick recipe showing how to format floating-point numbers for display using `Engine.doubleToString()`, which rounds to a specified number of decimal places.

## Round decimal numbers for display [00:00]

Use `Engine.doubleToString()` to convert a float to a display string with a fixed number of decimal places.

```javascript
const var myNumber = 1.23456789;
Console.print(Engine.doubleToString(myNumber, 2)); // "1.23"
Console.print(Engine.doubleToString(myNumber, 3)); // "1.234"
```

Pass the value as the first argument and the desired decimal digit count as the second. Use the returned string directly in a label or popup text field.
