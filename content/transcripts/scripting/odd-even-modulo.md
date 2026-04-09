---
title: "How to test for odd and even numbers in HISE"
summary: "Shows how to use the modulo operator to test whether a number is odd or even."
channel: "David Healey"
videoId: "2e1yyuitjSM"
url: "https://youtube.com/watch?v=2e1yyuitjSM"
publishDate: "2022-03-12"
views: 0
likes: 0
duration: 110
domain: "scripting"
---

# How to test for odd and even numbers in HISE — David Healey

## Introduction

A quick recipe showing how to use the modulo operator to check for odd or even numbers.

## Test for odd or even using modulo [00:00]

Divide by 2 with `%` and check the remainder. `0` means even; non-zero means odd.

```javascript
const var n = 21;

if (n % 2 != 0)
    Console.print("odd");
else
    Console.print("even");
```
