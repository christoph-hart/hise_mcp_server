---
title: "HISE scripting: The parseInt command"
summary: "Demonstrates the parseInt function in HiseScript for converting string representations of numbers to integers and for truncating floating-point numbers to whole numbers."
channel: "David Healey"
videoId: "UIvX-BsU8VA"
url: "https://youtube.com/watch?v=UIvX-BsU8VA"
publishDate: "2020-07-03"
views: 193
likes: 6
duration: 144
domain: "scripting"
---

# HISE scripting: The parseInt command — David Healey

## Introduction

This recipe covers the `parseInt` function in HiseScript — a utility that won't appear in the API browser or autocomplete. It converts string representations of numbers into actual integer values and can also truncate floating-point numbers to whole numbers. Common use cases include processing user input from editable labels and rounding decimal values.

## Converting a string to a number using parseInt [00:17]

1. Declare a variable holding a numeric string (e.g., `var n = "123"`). Note that even though the content looks like a number, `typeof n` returns `"string"`.
2. Pass the variable to `parseInt(n)` to convert it. The return value is a true number type: `typeof parseInt(n)` returns `"number"`.
3. Use `parseInt` when you have a string representation of a number that needs to be treated as an actual numeric value for calculations or type-sensitive operations.

## Using parseInt to round floating-point numbers to integers [01:19]

`parseInt()` can also be used to round a floating-point number down to the nearest integer — not just for string-to-integer conversion.

1. Pass a float (e.g. `1.23`) into `parseInt()`. It will truncate the decimal and return the whole number (e.g. `1`).
2. This works whether the value is a number data type or a numeric string — `parseInt()` handles both.
3. Note that `parseInt()` always rounds **down** (truncates toward zero), not to the nearest integer. `1.9` becomes `1`, not `2`.
