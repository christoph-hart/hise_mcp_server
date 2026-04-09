---
title: "HISE: How to use the \"typeof\" command"
summary: "Explains how to use the typeof operator and Array.isArray() in HiseScript to check variable types at runtime, including the caveat that typeof returns \"object\" for both arrays and plain objects."
channel: "David Healey"
videoId: "ZA6p277NoLo"
url: "https://youtube.com/watch?v=ZA6p277NoLo"
publishDate: "2020-07-26"
views: 162
likes: 4
duration: 249
domain: "scripting"
---

# HISE: How to use the "typeof" command — David Healey

## Introduction

This recipe covers using the `typeof` operator in HiseScript to determine the data type stored in a variable. You will learn the syntax, what type strings are returned for each data type, how to use `typeof` in conditional logic, and how to work around its limitation with arrays using `Array.isArray()`.

## Declaring variables and using typeof [00:11]

1. Declare variables of different types to test with `typeof`:
   - `const var n = 123;` (number)
   - `const var s = "123";` (string)
   - `const var a = [1, 2, 3];` (array)
   - `const var o = {1: 1, 2: 2, 3: 3};` (object)
   - `const var u;` (undefined — leave unassigned)

2. Use `typeof` to identify the type of a variable at runtime. This is useful when a variable's type is not known in advance (e.g., when receiving data from an external source or a generic callback).

## typeof return values for each data type [01:04]

1. Use `typeof` to check a variable's type in an if statement or for debugging. Syntax: `typeof` followed by a space and the variable — no parentheses required.

2. To inspect a type, pass it to `Console.print`: `Console.print(typeof n);`

3. Type results:
   - Number variable → `"number"`
   - String variable → `"string"`
   - Array variable → `"object"` (arrays are objects — do not use `typeof` to distinguish arrays from plain objects)
   - Object variable → `"object"`
   - Unassigned variable → `"undefined"`

4. Key caveat: `typeof` cannot distinguish between arrays and objects — both return `"object"`. If you need to test specifically for an array, use a different method.

## Using typeof in conditional logic [02:21]

1. Use `typeof` in an if statement to check a variable's type: `if (typeof n == "number")`. Note that the type name must be in quotation marks (e.g., `"number"`, `"string"`).
2. Place `typeof` before the variable name inside the condition: `typeof n`, not after.
3. Add an `else` branch to handle the false case, e.g., printing `false`, so the script gives explicit feedback when the type does not match.

## Distinguishing arrays from objects with Array.isArray() [03:10]

1. To check if a variable is specifically an Array (not just an object), use `Array.isArray()` — `typeof` cannot distinguish arrays from objects because arrays return `"object"`.
2. Call it as `Array.isArray(myVar)`, where `Array` has a capital A. Returns `1` for true, `0` for false.
3. Use this inside an `if` statement or `Console.print()` for debugging.
