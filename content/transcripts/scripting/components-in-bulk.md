---
title: "HISE: Scripting components in bulk"
summary: "Shows how to use Content.getAllComponents() with regex pattern matching to retrieve and modify multiple UI components at once."
channel: "David Healey"
videoId: "Iv8FjAPRQG4"
url: "https://youtube.com/watch?v=Iv8FjAPRQG4"
publishDate: "2022-09-24"
views: 0
likes: 0
duration: 164
domain: "scripting"
---

# HISE: Scripting components in bulk — David Healey

## Introduction

This recipe shows how to use `Content.getAllComponents()` to retrieve and modify multiple UI components at once using regex pattern matching, instead of storing individual references.

## Scripting components in bulk with Content.getAllComponents() [00:00]

Use `Content.getAllComponents()` to interact with multiple UI components without storing individual references.

**Search by name (regex match)**

Pass a string to filter components whose ID matches the pattern. Returns an array of component references.

```javascript
// Get all components whose ID contains "Button"
const var components = Content.getAllComponents("Button");
// Returns e.g. [Button1, Button2]
```

**Iterate over all components**

Pass `".*"` to get every component on the interface.

```javascript
for (c in Content.getAllComponents(".*"))
{
    c.set("bgColour", Colours.red);
}
```

**Key behaviour:** Changes applied this way are persistent — the values stick to the components even after the script is deleted, because they are written directly to the component properties.
