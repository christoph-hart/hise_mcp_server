---
title: "How to skip through loops in HISE | The continue keyword"
summary: "Shows how to use the continue keyword to skip loop iterations, with examples for filtering specific values and odd/even checks."
channel: "David Healey"
videoId: "3txyhVSiDtc"
url: "https://youtube.com/watch?v=3txyhVSiDtc"
publishDate: "2022-03-19"
views: 0
likes: 0
duration: 113
domain: "scripting"
---

# How to skip through loops in HISE — David Healey

## Introduction

A quick recipe showing how to use `continue` to skip loop iterations in HiseScript.

## The continue keyword — skip loop iterations [00:00]

Use `continue` inside a `for` loop to skip the rest of the current iteration and move to the next one.

```javascript
// Skip a specific value
for (i = 0; i < 10; i++)
{
    if (i == 5) continue;
    Console.print(i); // prints 0 1 2 3 4 6 7 8 9
}

// Print only even numbers
for (i = 0; i < 10; i++)
{
    if (i % 2 != 0) continue;
    Console.print(i); // prints 0 2 4 6 8
}
```
