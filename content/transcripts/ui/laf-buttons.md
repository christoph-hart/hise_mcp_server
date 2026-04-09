---
title: "Designing buttons with look and feel in HISE | button laf"
summary: "Shows how to build multiple button styles (icon, text, toggle, MIDI channel list) within a single drawToggleButton LAF function using obj.text prefix matching and obj.parentType for floating tile buttons."
channel: "David Healey"
videoId: "badkm6QVNIA"
url: "https://youtube.com/watch?v=badkm6QVNIA"
publishDate: "2022-06-11"
views: 0
likes: 0
duration: 1285
domain: "ui"
---

# Designing buttons with look and feel in HISE — David Healey

## Introduction

This recipe builds multiple button styles within a single `drawToggleButton` LAF function. By using text-prefix conventions (`icon-`, `text-`, `toggle`), each button's `text` property determines which drawing branch runs — no separate LAF functions needed. It also covers styling buttons inside floating tiles using `obj.parentType`.

## Icon button — drawing SVG icons from a paths namespace [03:32]

Store SVG path data in a separate namespace. Extract the icon name by stripping the `"icon-"` prefix from `obj.text`, then use bracket notation for dynamic lookup.

```javascript
// paths.js
namespace paths
{
    const var icons = {
        "star": Content.createPath(),
        "caretDown": Content.createPath()
    };
    // Load path data for each icon...
}

const var LAF = Engine.createGlobalScriptLookAndFeel();

LAF.registerFunction("drawToggleButton", function(g, obj)
{
    var a = obj.area;

    if (obj.text.indexOf("icon") != -1)
    {
        var icon = obj.text.replace("icon-", "");

        g.setColour(obj.bgColour);

        if (obj.over)
            g.setColour(obj.itemColour1);

        if (obj.down)
            g.setColour(obj.itemColour2);

        g.fillPath(paths.icons[icon], a);
    }
    // ... other branches below
});
```

Multiple buttons can each display a different icon by changing only their `text` property (e.g. `"icon-star"`, `"icon-caretDown"`).

## Mouse-over and mouse-down colour states [10:42]

Apply colour overrides in order: base, then over, then down. Later `setColour` calls win.

```javascript
g.setColour(obj.bgColour);        // normal
if (obj.over) g.setColour(obj.itemColour1);  // hover
if (obj.down) g.setColour(obj.itemColour2);  // pressed
```

Map `bgColour` = normal, `itemColour1` = hover, `itemColour2` = pressed. Set per-button in the property editor.

## Text button — displaying the button's text property [12:16]

Button `text` is set to `"text-Click Me"`. Strip the prefix to get the display label.

```javascript
    else if (obj.text.indexOf("text-") != -1)
    {
        var label = obj.text.replace("text-", "");

        g.setColour(obj.bgColour);
        g.fillAll();

        g.setColour(obj.textColour);
        g.drawAlignedText(label, a, "centred");
    }
```

## Toggle button — binary on/off colour fill [14:44]

Use `obj.value` with the ternary operator to pick between two colours.

```javascript
    else if (obj.text.indexOf("toggle") != -1)
    {
        g.setColour(obj.value == 0 ? obj.bgColour : obj.itemColour1);
        g.fillAll();
    }
```

## MIDI Channel List floating tile buttons [16:33]

Buttons inside floating tiles are targeted via `obj.parentType` using direct equality (not `indexOf`).

```javascript
    else if (obj.parentType == "MidiChannelList")
    {
        g.setColour(0xFFFFFFFF);
        g.drawAlignedText(obj.text, a, "left");

        // Activation circle on the right edge
        var circleSize = a[3];
        var circleX = a[2] - 40;
        var circleArea = [circleX, a[1], circleSize, circleSize];

        g.setColour(obj.value == 0 ? 0xFFFF0000 : 0xFF0000FF);
        g.fillEllipse(circleArea);
    }
```

Floating-tile buttons don't expose customisable colour properties — colours must be hard-coded. Pass an explicit `[x, y, w, h]` array to `fillEllipse` to avoid stretching across the full button width.
