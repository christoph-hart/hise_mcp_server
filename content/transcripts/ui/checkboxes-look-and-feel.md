---
title: "How to make checkboxes in HISE with Look and Feel"
summary: "How to draw buttons as icon checkboxes using Look and Feel, SVG path data, and a shared LAF callback that selects icons via the button's text property."
channel: "David Healey"
videoId: "k2SnYLkdlWE"
url: "https://youtube.com/watch?v=k2SnYLkdlWE"
publishDate: "2024-02-17"
views: 698
likes: 18
duration: 1011
domain: "ui"
---

# How to make checkboxes in HISE with Look and Feel — David Healey

## Introduction

This recipe shows how to turn HISE buttons into icon-based checkboxes using Look and Feel. It covers converting SVG icons to HISE path data, drawing the icon conditionally based on button state, and using the button's `text` property to select different icons from a single shared LAF callback — making it easy to scale to many checkboxes.

## Setting Up SVG Path Icons for Checkboxes [00:00]

1. Add a Button component (e.g. `btnCheckbox0`) and get a script reference:

```javascript
const var btnCheckbox0 = Content.getComponent("btnCheckbox0");
```

2. Create a `Paths` namespace to store SVG path data. Source an SVG icon (e.g. a checkmark from Bootstrap Icons). Copy the `d` attribute value from the SVG.

3. Convert the SVG path to a Base64-encoded HISE path string: go to **Tools > Convert SVG to Path Data**, click "Load from Clipboard", ensure the dropdown is set to **B64 Path**, then copy the result:

```javascript
namespace Paths
{
    // check (Bootstrap Icons)
    const var checkData = "AbCdEf...=="; // paste B64 path string here

    namespace Icons
    {
        const var check = Content.createPath();
    }
}

Paths.Icons.check.loadFromData(Paths.checkData);
```

## Creating and Assigning the Look and Feel Callback [02:30]

Create a local LAF object, register the `drawToggleButton` function, and assign it to the button. Set component colours on the button: `bgColour` for background, `itemColour1` for icon/border.

```javascript
const var laf = Content.createLocalLookAndFeel();

laf.registerFunction("drawToggleButton", function(g, obj)
{
    local a = obj.area;

    // Background — slightly adjust opacity on hover/press
    g.setColour(Colours.withAlpha(obj.bgColour, 0.9 + obj.over * 0.1 - obj.down * 0.2));
    g.fillRect(a);

    // ... icon drawing follows
});

btnCheckbox0.setLocalLookAndFeel(laf);
```

Key points:
- The button disappears as soon as a local LAF is assigned — HISE defers all rendering to the callback immediately, so the callback must draw everything.
- `obj.over` and `obj.down` are `1` or `0`, so multiplying by a delta gives a conditional brightness shift without branching.
- Set the button's `text` property to match the icon name (e.g. `"check"`) — this will be used to select the correct path in the callback.

## Drawing the Icon — Sizing, Centering, and Multiple Variants [07:30]

Draw the icon only when the button is ticked (`obj.value == 1`). Use `obj.text` to look up the correct path, allowing different buttons to show different icons from the same LAF callback:

```javascript
laf.registerFunction("drawToggleButton", function(g, obj)
{
    local a = obj.area;

    // Background
    g.setColour(Colours.withAlpha(obj.bgColour, 0.9 + obj.over * 0.1 - obj.down * 0.2));
    g.fillRect(a);

    // Border
    g.setColour(obj.itemColour1);
    g.drawRect(a, 2);

    // Icon — only when ticked
    if (obj.value)
    {
        // Size icon to ~2/3 of button
        local w = a[2] / 1.5;
        local h = a[3] / 1.5;

        // Centre within the button area
        local x = a[0] + a[2] / 2 - w / 2;
        local y = a[1] + a[3] / 2 - h / 2;

        // Use text property to select path — e.g. "check" or "checkAll"
        g.setColour(obj.itemColour1);
        g.fillPath(Paths.Icons[obj.text], [x, y, w, h]);
    }
});
```

To add a second icon variant, load another SVG path and set a different button's `text` property:

```javascript
// At init — add a second icon
Paths.Icons.checkAll = Content.createPath();
Paths.Icons.checkAll.loadFromData(Paths.checkAllData);

// Any button can use it by setting its text property
btnCheckbox2.set("text", "checkAll");
```

## Scaling to Multiple Checkboxes with Shared LAF [12:30]

Name buttons `btnCheckbox0`, `btnCheckbox1`, `btnCheckbox2`, etc. (HISE auto-increments names on duplication). Retrieve all matching buttons and assign the LAF in a loop:

```javascript
// Content.getAllComponents takes a regex pattern
const var checkboxes = Content.getAllComponents("btnCheckbox");

for (btn in checkboxes)
    btn.setLocalLookAndFeel(laf);
```

To give one checkbox a distinct icon, just change its `text` property — the shared LAF callback reads `obj.text` to resolve the path, so no separate callback is needed.
