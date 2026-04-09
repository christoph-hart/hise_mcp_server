---
title: "HISE increment and decrement"
summary: "Explains pre/post increment and decrement operators in HiseScript, their performance differences, and how to benchmark code with Console.startBenchmark/stopBenchmark."
channel: "David Healey"
videoId: "4rw2Da2OgTI"
url: "https://youtube.com/watch?v=4rw2Da2OgTI"
publishDate: "2022-09-03"
views: 0
likes: 0
duration: 456
domain: "scripting"
---

# HISE increment and decrement — David Healey

## Introduction

This recipe covers the increment and decrement operators in HiseScript — both pre and post variants — explains the performance difference, and demonstrates how to benchmark code using `Console.startBenchmark()` / `Console.stopBenchmark()`.

## Increment and decrement operators — behaviour [00:00]

HiseScript has post-increment (`i++`) and pre-increment (`++i`) operators, plus their decrement equivalents (`i--`, `--i`).

**Post-increment / post-decrement** — returns the original value first, then modifies:

```javascript
var i = 10;
Console.print(i++); // prints 10
Console.print(i);   // prints 11

Console.print(i--); // prints 11
Console.print(i);   // prints 10
```

**Pre-increment / pre-decrement** — modifies first, then returns:

```javascript
var i = 10;
Console.print(++i); // prints 11
Console.print(--i); // prints 10
```

Both forms work identically in `for` loops since the return value is discarded.

## Why pre-increment is more efficient [02:30]

**Post-increment** (`i++`) requires the runtime to copy the original value to temporary memory, increment the original, then return the copy. **Pre-increment** (`++i`) increments and returns directly — no temporary copy needed.

In HiseScript this difference is negligible for typical use. Use whichever reads more clearly in context.

## Benchmarking with Console.startBenchmark / stopBenchmark [05:00]

Use the built-in benchmark tools to time a code block:

```javascript
Console.start(); // clears console on each compile (F5)

Console.startBenchmark();
for (var i = 0; i < 1000000; i++)
{
    var a = i;
}
Console.stopBenchmark(); // prints elapsed ms to console

Console.startBenchmark();
for (var i = 0; i < 1000000; ++i)
{
    var a = i;
}
Console.stopBenchmark();
```

`Console.startBenchmark()` starts a timer; `Console.stopBenchmark()` stops it and prints the duration. Place the two calls around any block you want to profile.
