---
title: "How to check if a variable has been defined"
summary: "Shows how to use isDefined() to check whether a variable exists before using it, preferred over comparing against undefined."
channel: "David Healey"
videoId: "0ubXXcdkV-s"
url: "https://youtube.com/watch?v=0ubXXcdkV-s"
publishDate: "2022-10-01"
views: 0
likes: 0
duration: 117
domain: "scripting"
---

# How to check if a variable has been defined — David Healey

## Introduction

A quick recipe showing how to use `isDefined()` to guard against undefined variables in HiseScript.

## How to check if a variable is defined using isDefined() [00:00]

Use `isDefined()` to check whether a variable exists before using it.

```javascript
// Verbose approach — explicit comparison against undefined
if (v != undefined)
{
    Console.print(v);
}

// Preferred approach — built-in isDefined() is cleaner
if (isDefined(v))
{
    Console.print(v);
}

// Check if NOT defined
if (!isDefined(v))
{
    Console.print("v is not defined");
}
```

`isDefined()` is a built-in HiseScript function. Prefer it over `!= undefined` comparisons for readability.
