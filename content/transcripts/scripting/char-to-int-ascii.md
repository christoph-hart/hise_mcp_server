---
title: "How to convert letters to numbers in HISE"
summary: "Shows how to convert characters to their Unicode/ASCII values using charToInt() for single characters and String.charCodeAt() for characters within a string."
channel: "David Healey"
videoId: "-sopcS9cEYQ"
url: "https://youtube.com/watch?v=-sopcS9cEYQ"
publishDate: "2022-03-05"
views: 0
likes: 0
duration: 136
domain: "scripting"
---

# How to convert letters to numbers in HISE — David Healey

## Introduction

A quick recipe showing two methods for converting characters to their Unicode/ASCII numeric values.

## Convert a single character to its Unicode value [00:22]

Use `charToInt(s)` to get the code point of a single-character string.

```javascript
Console.print(charToInt("p")); // 112
Console.print(charToInt("P")); // 80
```

## Get the ASCII value of a character within a string [00:57]

Use `String.charCodeAt(index)` on a multi-character string. Index is zero-based.

```javascript
const var s = "hello";
Console.print(s.charCodeAt(2)); // ASCII value of 'l' = 108
```
