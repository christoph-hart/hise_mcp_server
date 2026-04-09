---
title: "Get regex matches | Counting substrings in a string"
summary: "How to use Engine.getRegexMatches() to find all occurrences of a pattern in a string and count them."
channel: "David Healey"
videoId: "dPvXfhi7G4U"
url: "https://youtube.com/watch?v=dPvXfhi7G4U"
publishDate: "2023-12-23"
views: 0
likes: 0
duration: 151
domain: "scripting"
---

# Get regex matches | Counting substrings in a string — David Healey

## Introduction

This recipe shows how to use `Engine.getRegexMatches()` to count how many times a substring or pattern appears in a string.

## Count Substring Occurrences Using Engine.getRegexMatches [00:08]

Use `Engine.getRegexMatches()` to find all matches of a pattern in a string. The function returns an array of all matches, so `.length` gives the count.

```javascript
const var s = "hello world hello world hello world";

// Engine.getRegexMatches(targetString, pattern) returns an array of matches
const var matches = Engine.getRegexMatches(s, "hello");

Console.print(matches.length); // 3
```

Key points:
- First argument is the string to search within, second is the regex pattern (or plain substring).
- Returns an array of matched substrings; use `.length` to get the occurrence count.
- The pattern supports full regular expressions, not just literal strings.
- An invalid regex returns `undefined`, not an empty array — guard with `isDefined()` if using dynamic patterns.
