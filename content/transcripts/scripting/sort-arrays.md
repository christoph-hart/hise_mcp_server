---
title: "How to sort arrays in HISE"
summary: "Covers all array sorting methods in HiseScript: sort() for numeric ascending, reverse() for descending, sortNatural() for strings with embedded number awareness, and Engine.sortWithFunction() for custom comparator-based sorting of objects."
channel: "David Healey"
videoId: "qeUq-M6CgTs"
url: "https://youtube.com/watch?v=qeUq-M6CgTs"
publishDate: "2022-11-12"
views: 243
likes: 8
duration: 746
domain: "scripting"
---

# How to sort arrays in HISE — David Healey

## Introduction

This recipe covers every array sorting method available in HiseScript. You'll learn how to sort numeric arrays in ascending and descending order, sort string arrays with natural number awareness, use numeric prefixes for custom display ordering, and write custom comparator functions for sorting arrays of objects by any property.

## Sorting an array of numbers in ascending order using sort() [00:04]

Call `.sort()` directly on the array. No arguments are needed for numeric sorting.

```javascript
const var arr = [5, 3, 6, 1, 4, 2];

arr.sort(); // sorts in-place, ascending order

Console.print(arr[0]); // 1 — the array is now [1, 2, 3, 4, 5, 6]
```

Note: `.sort()` modifies the array in place. The original order is lost after calling it.

## Sorting an array in descending order using sort() and reverse() [01:00]

Chain `sort()` then `reverse()` on separate lines to sort descending.

```javascript
const var myArray = [5, 2, 8, 1, 9, 3];

myArray.sort();     // ascending: [1, 2, 3, 5, 8, 9]
myArray.reverse();  // descending: [9, 8, 5, 3, 2, 1]

Console.print(trace(myArray));
```

**Important:** `sort()` works only with numeric arrays. It does not sort strings — use `sortNatural()` instead.

## Sorting string arrays and mixed arrays with sortNatural() [01:28]

1. `Array.sort()` does not work on string arrays — it leaves the order unchanged. Use `Array.sortNatural()` for alphabetical ascending sort.

2. Call `sortNatural()` then `reverse()` for descending order.

3. `sortNatural()` handles mixed arrays (numbers and strings together): numbers sort ascending first, then strings ascending after them.

4. Use numeric prefixes to impose a custom display order on string arrays, then strip the prefix when displaying:

```javascript
// Array with numeric prefixes to define display order
const var d = ["0Decca", "1Close", "2Hall", "3Wide"];

d.sortNatural(); // sorts by the leading number

// Strip the leading digit when outputting
for (x in d)
{
    // substring(1, x.length) skips the prefix digit
    Console.print(x.substring(1, x.length));
}
// Prints: Decca, Close, Hall, Wide — in sorted order, without the number
```

## Sorting arrays of objects with Engine.sortWithFunction() [05:44]

Use `Engine.sortWithFunction(array, comparatorFn)` when sorting arrays of objects by a specific property. The comparator receives element pairs and must return a negative number, zero, or positive number.

Define the comparator as a named `inline function` to avoid allocation:

```javascript
// --- Sort array of numbers with custom comparator ---
const var e = [4, 6, 1, 5, 3];

inline function compareAsc(x, y)  { return x - y; }   // ascending
inline function compareDesc(x, y) { return y - x; }   // descending

Engine.sortWithFunction(e, compareAsc);
Console.print(trace(e));  // [1, 3, 4, 5, 6]

// --- Sort array of objects by a named property ---
const var f = [
    {"key": 5},
    {"key": 3},
    {"key": 2},
    {"key": 8},
    {"key": 4}
];

inline function compareByKeyAsc(x, y)  { return x.key - y.key; }
inline function compareByKeyDesc(x, y) { return y.key - x.key; }

Engine.sortWithFunction(f, compareByKeyAsc);
Console.print(trace(f));  // objects ordered by .key: 2, 3, 4, 5, 8
```

**Why `return x - y` works:** if x < y the result is negative (x sorts first); if x > y it is positive (y sorts first); if equal it is zero. Swap to `y - x` for descending without needing an `if` statement.

**Why `Engine.sortWithFunction` is needed for objects:** `sort()` and `sortNatural()` cannot compare objects by an arbitrary key. The comparator can reference multiple properties for multi-key sorting (e.g., sort by last name then first name).
