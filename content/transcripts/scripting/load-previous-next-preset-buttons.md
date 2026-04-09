---
title: "Implementing 'Load Previous' and 'Load Next' Preset Buttons in your HISE project"
summary: "How to create previous/next preset navigation buttons using Content.getAllComponents() with regex matching and Engine.loadPreviousUserPreset/loadNextUserPreset, including cross-folder navigation control."
channel: "David Healey"
videoId: "rCJ0ljwzXjc"
url: "https://youtube.com/watch?v=rCJ0ljwzXjc"
publishDate: "2024-09-28"
views: 435
likes: 20
duration: 466
domain: "scripting"
---

# Implementing 'Load Previous' and 'Load Next' Preset Buttons in your HISE project — David Healey

## Introduction

This recipe covers how to implement previous/next preset navigation buttons in a HISE project. You'll learn how to use `Content.getAllComponents()` with regex to batch-reference buttons, assign a shared callback that determines navigation direction from the button index, and control whether navigation stays within the current preset folder or crosses folder boundaries.

## Using Content.getAllComponents() with regex to batch-reference preset navigation buttons [00:00]

1. Name navigation buttons with a shared prefix and numeric suffix (e.g. `BTN_preset_0` for Previous, `BTN_preset_1` for Next). This enables batch retrieval and a shared callback, minimising code duplication.

2. Use `Content.getAllComponents()` with a regex string instead of manually building an array. The regex `\d` (escaped as `"\\d"` in the string literal) matches only components whose name ends with a digit, excluding any other components that share the prefix (e.g. `BTN_preset_browser`).

```javascript
// Collect both preset navigation buttons into one array.
// The regex \d ensures BTN_preset_browser is excluded.
const var btnPreset = Content.getAllComponents("BTN_preset_\\d");
```

Note: `Content.getAllComponents()` with a regex is convenient but requires careful naming discipline. If other components share the prefix and a trailing digit, they will also be captured. Verify the array contents during development with `Console.print(trace(btnPreset))`.

## Navigating presets with Load Previous and Load Next using a shared callback [02:30]

Assign a shared callback to both buttons. Inside the callback, use `indexOf` on the button array to determine which button was clicked, then call the appropriate Engine preset navigation function.

```javascript
// Assign same callback to both buttons
for (x in btnPreset)
    x.setControlCallback(onBtnPresetControl);

inline function onBtnPresetControl(component, value)
{
    // Only respond to mouse-down (value == 1), ignore mouse-up
    if (!value) return;

    local index = btnPreset.indexOf(component); // 0 = previous, 1 = next

    if (!index)
        Engine.loadPreviousUserPreset(false);
    else
        Engine.loadNextUserPreset(false);
};
```

`Engine.loadPreviousUserPreset()` and `Engine.loadNextUserPreset()` each take a single boolean `stayInDirectory` parameter. Pass `false` to allow navigation across preset folders; pass `true` to restrict navigation to the current folder only.

## Controlling preset navigation scope across folders with the stayInDirectory parameter [05:00]

The `stayInDirectory` boolean passed to `Engine.loadPreviousUserPreset()` / `Engine.loadNextUserPreset()` controls whether navigation stays within the currently selected preset folder or crosses into other folders.

- `false` — cross-directory navigation: the browser moves freely between Category 1, Category 2, etc.
- `true` — stay within the currently selected folder only, cycling through its presets and ignoring all others.

```javascript
// false = cross-directory navigation (moves between all folders)
// true  = stay within the currently selected folder only
const var stayInDirectory = false; // adjust per desired behaviour
```

Note: if any presets exist outside a named subfolder (loose presets at the root of the preset browser location), the navigation logic will pick them up when `stayInDirectory` is `false`. Remove stray preset files from the root to avoid unexpected jumps. You can expose `stayInDirectory` as a user-facing toggle if the end user should be able to choose the behaviour.
