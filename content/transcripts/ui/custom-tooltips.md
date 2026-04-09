---
title: "How to make custom tooltips in HISE"
summary: "How to implement tooltips in HISE, from the built-in FloatingTile TooltipPanel to fully custom tooltip displays using a ScriptPanel with a timer, background drawing, and SVG info icons."
channel: "David Healey"
videoId: "AkgFULmU4gY"
url: "https://youtube.com/watch?v=AkgFULmU4gY"
publishDate: "2022-02-05"
views: 3089
likes: 56
duration: 761
domain: "ui"
---

# How to make custom tooltips in HISE — David Healey

## Introduction

This recipe covers two approaches to displaying tooltips on a HISE interface: the built-in FloatingTile TooltipPanel (quick but limited) and a fully custom tooltip system using a ScriptPanel with a timer. The custom approach adds a semi-transparent background, styled text, and an SVG info icon, giving full control over tooltip appearance.

## Adding tooltip controls and the built-in FloatingTile TooltipPanel [00:16]

1. Set the `tooltip` property on any UI control (knob, button, etc.) in the property panel. No scripting required.
2. Add a FloatingTile to the interface and set its content type to `TooltipPanel`. Resize and position it where tooltips should appear.
3. Hovering over any control with a `tooltip` value will automatically display that text in the TooltipPanel. HISE's own built-in controls also display their tooltips in the same panel.

## Built-in TooltipPanel customization limits and when to build a custom tooltip [01:20]

The built-in `TooltipPanel` FloatingTile has very limited customization. The info icon can obscure tooltip text, especially as the panel grows larger — the only workaround is repositioning or resizing the panel. The only adjustable properties are: font, font size, text colour, and background colour. Because of these constraints, the built-in FloatingTile is rarely practical unless the project needs only a minimal, unstyled tooltip.

## Building a custom tooltip panel with Content.getCurrentTooltip() [02:20]

Replace the default FloatingTile tooltip with a ScriptPanel. Add a Panel component to the interface and name it (e.g. `pnlTooltip`).

The key API call is `Content.getCurrentTooltip()` — a poll-based method that returns the tooltip string of whichever component is currently under the mouse cursor (empty string if none). There is no mouse-hover callback that fires automatically, so you need a Timer to poll it continuously and trigger repaints.

## Using a Panel timer to poll and display custom tooltips [03:23]

Use a `namespace` to encapsulate the tooltip logic. The Panel serves as both the rendering surface and the timer host. The timer runs permanently from initialization, calling `repaint()` on each tick. A 100–250 ms interval is appropriate; there is no benefit to going faster than 100 ms.

```javascript
namespace Tooltip
{
    const var panel = Content.getComponent("pnlTooltip");

    inline function onPaint(g)
    {
        local t = Content.getCurrentTooltip();

        if (t != "")
        {
            g.setColour(0xFFFFFFFF);
            g.drawAlignedText(t, [0, 0, panel.getWidth(), panel.getHeight()], "left");
        }
    }

    inline function onTimer()
    {
        // Timer's only job is to trigger a repaint; tooltip logic lives in paint routine
        panel.repaint();
    }

    panel.setPaintRoutine(onPaint);
    panel.setTimerCallback(onTimer);
    panel.startTimer(250);
}
```

When `Content.getCurrentTooltip()` returns an empty string, the paint routine draws nothing — effectively hiding the tooltip without toggling Panel visibility.

## Drawing a semi-transparent rounded tooltip background [06:55]

Add a background to the tooltip by drawing a rounded rectangle in the paint routine before the text. Use `Colours.withAlpha()` to control transparency, and offset the text x-position inward so it doesn't sit flush against the panel edge.

```javascript
inline function onPaint(g)
{
    local t = Content.getCurrentTooltip();

    if (t != "")
    {
        // Semi-transparent background — adjust alpha (0.0–1.0) to taste
        g.setColour(Colours.withAlpha(0xFF000000, 0.7));
        g.fillRoundedRectangle([0, 0, panel.getWidth(), panel.getHeight()], 5.0);

        // Draw text with inward offset to clear the panel edge
        g.setColour(0xFFFFFFFF);
        g.drawAlignedText(t, [25, 0, panel.getWidth() - 25, panel.getHeight()], "left");
    }
}
```

Set the panel's background colour to transparent in its properties so only the paint routine controls visibility.

## Adding an SVG info icon to the custom tooltip panel [08:48]

Draw an info icon inside the paint routine using a pre-converted SVG path. Create the path once at init scope, then draw it with `g.fillPath()` only when a tooltip is active. Set the icon area width equal to the panel height to keep it circular. Offset the text far enough to clear the icon.

```javascript
namespace Tooltip
{
    const var panel = Content.getComponent("pnlTooltip");

    // Load SVG path data once at init — substitute your own converted SVG data array
    const var infoIcon = Content.createPath();
    infoIcon.loadFromData([/* paste Bootstrap circle-info SVG data points here */]);

    inline function onPaint(g)
    {
        local t = Content.getCurrentTooltip();

        if (t != "")
        {
            local h = panel.getHeight();
            local w = panel.getWidth();

            // Semi-transparent background
            g.setColour(Colours.withAlpha(0xFF000000, 0.7));
            g.fillRoundedRectangle([0, 0, w, h], 5.0);

            // Info icon — square region (width = height) for a perfect circle
            g.setColour(0xFFFFFFFF);
            g.fillPath(infoIcon, [5, 0, h, h]);

            // Tooltip text — offset past the icon
            g.drawAlignedText(t, [50, 0, w - 50, h], "left");
        }
    }

    inline function onTimer()
    {
        panel.repaint();
    }

    panel.setPaintRoutine(onPaint);
    panel.setTimerCallback(onTimer);
    panel.startTimer(250);
}
```

The SVG path data points are from the Bootstrap icon set (circle-info variant). See the HISE SVG conversion workflow for how to generate a data array from an SVG file.
