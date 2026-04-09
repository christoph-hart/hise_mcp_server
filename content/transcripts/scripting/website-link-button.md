---
title: "Adding a website link in your HISE project"
summary: "Shows how to add a button that opens a URL using Engine.openWebsite(), with proper Save in Preset handling to prevent auto-opening on compile."
channel: "David Healey"
videoId: "C8qTme_wEfc"
url: "https://youtube.com/watch?v=C8qTme_wEfc"
publishDate: "2022-01-15"
views: 0
likes: 0
duration: 219
domain: "scripting"
---

# Adding a website link in your HISE project — David Healey

## Introduction

A quick recipe for adding a button that opens a URL in the user's browser.

## Adding a URL button [00:08]

Disable "Save in Preset" on the button — otherwise the callback fires on compile, immediately opening the browser. Set to momentary and guard with `if (value)`.

```javascript
const var BTN_URL = Content.getComponent("BTN_URL");
BTN_URL.set("saveInPreset", false);
BTN_URL.set("isMomentary", true);

inline function onBTN_URLControl(component, value)
{
    if (value)
        Engine.openWebsite("https://example.com");
}

BTN_URL.setControlCallback(onBTN_URLControl);
```
