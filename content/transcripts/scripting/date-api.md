---
title: "Working with the date API in HISE"
summary: "How to use the Date namespace to get system time, convert between ISO-8601 strings and milliseconds, and build a days-elapsed check for update or license expiry logic."
channel: "David Healey"
videoId: "fyXvhDTZLeQ"
url: "https://youtube.com/watch?v=fyXvhDTZLeQ"
publishDate: "2024-05-25"
views: 326
likes: 7
duration: 672
domain: "scripting"
---

# Working with the date API in HISE — David Healey

## Introduction

This recipe covers the `Date` namespace in HISE, which provides four functions for working with system time. You will learn how to retrieve the current date/time as both an ISO-8601 string and Unix milliseconds, convert between the two formats, and build a practical days-elapsed check suitable for update notifications or license expiry logic.

## Date namespace overview — getting system time and converting formats [00:00]

The `Date` namespace provides four functions. All date comparisons should be done in milliseconds (Unix time); ISO strings are primarily for display.

```javascript
// 1. Current date/time as ISO-8601 string
// Pass true for separators (human-readable), false for compact
const var isoString = Date.getSystemTimeISO8601(true);
Console.print(isoString); // "2024-01-03T12:41:00+0100"

// 2. Current time as milliseconds since Unix epoch (1 Jan 1970)
const var nowMs = Date.getSystemTimeMs();
Console.print(nowMs); // large integer, e.g. 1704282060000

// 3. Convert milliseconds -> ISO string
const var fromMs = Date.millisecondsToISO8601(nowMs, true);
Console.print(fromMs); // same format as above

// 4. Convert ISO string -> milliseconds
const var backToMs = Date.ISO8601ToMilliseconds(isoString);
Console.print(backToMs); // same ms value as nowMs
```

Note: Passing `0` to `Date.millisecondsToISO8601()` returns midnight 1 Jan 1970 adjusted for local timezone offset. An invalid string passed to `Date.ISO8601ToMilliseconds()` silently returns `0` with no way to distinguish from a genuine epoch timestamp.

## Building a periodic update check using millisecond comparison [02:30]

To check whether a given number of days have elapsed since a stored timestamp, convert the interval to milliseconds using the constant `86400000` (ms per day) and compare against the difference between now and the stored value.

A stored `lastChecked` value of `0` is a useful sentinel meaning "never checked before" — handle it as a special case that forces an immediate check.

```javascript
const var ONE_DAY_MS = 86400000;
const var CHECK_INTERVAL_DAYS = 7;

// lastChecked would be loaded from persistent storage (e.g. a text file in AppData).
// A value of 0 means no previous check has been recorded.

inline function shouldCheckForUpdate(lastChecked)
{
    local now = Date.getSystemTimeMs();
    local threshold = ONE_DAY_MS * CHECK_INTERVAL_DAYS;

    // Zero means no prior check — treat as "check now"
    if (lastChecked == 0 || (now - lastChecked) >= threshold)
    {
        Console.print("Do update check");
        return true;
    }
    else
    {
        Console.print("Up to date");
        return false;
    }
}
```

## Testing and persisting the last-checked timestamp [07:30]

Simulate a past "last checked" date by subtracting days in milliseconds from the current time. To verify your simulated date, convert it with `Date.millisecondsToISO8601()` and confirm the output matches expectations.

```javascript
const var now = Date.getSystemTimeMs();

// Simulate 3 days ago — should NOT trigger a 7-day check
const var threeDaysAgo = now - (ONE_DAY_MS * 3);
shouldCheckForUpdate(threeDaysAgo); // "Up to date"

// Simulate 10 days ago — should trigger
const var tenDaysAgo = now - (ONE_DAY_MS * 10);
shouldCheckForUpdate(tenDaysAgo); // "Do update check"

// First run, no stored date
shouldCheckForUpdate(0); // "Do update check"
```

After performing an update check, persist the current time (`Date.getSystemTimeMs()`) to a file so it can be read back on the next launch as the `lastChecked` baseline. The two primary use cases for the Date API are **update checking** (comparing a stored last-checked date to now) and **license/subscription expiry checking** (comparing a stored expiry date to now), particularly when communicating with a remote server.
