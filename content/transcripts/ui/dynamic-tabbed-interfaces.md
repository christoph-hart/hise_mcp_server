---
title: "Create Dynamic Tabbed Interfaces in HISE (Step by Step)"
summary: "How to build tabbed and multi-page interfaces in HISE by grouping controls into panels and toggling their visibility with buttons, knobs, or combo boxes, including radio group setup, inline boolean logic for concise code, and fallback panel patterns."
channel: "David Healey"
videoId: "_s7LTRz8pEc"
url: "https://youtube.com/watch?v=_s7LTRz8pEc"
publishDate: "2021-03-27"
views: 1655
likes: 58
duration: 2302
domain: "ui"
---

# Create Dynamic Tabbed Interfaces in HISE (Step by Step) — David Healey

## Introduction

This recipe covers how to build flexible tabbed or multi-page interfaces in HISE. The core idea is simple: group controls into panels, then show and hide those panels through scripting. Starting with a basic button-driven tab system using radio groups, it progresses through increasingly refined code patterns using inline boolean logic, then explores alternative tab controllers like knobs and combo boxes.

## Building a Tabbed Panel Layout with Radio Group Buttons [03:38]

1. Add three Panel components to the interface. Give each a distinct background colour for visibility during development — in production these panels contain your actual controls.

2. Stack all three panels on top of each other by setting identical X, Y, Width, and Height values for all three. Only the topmost visible panel will be seen.

3. Add three Button components — one per panel. Keep the buttons **outside** (not children of) the panels, so they remain visible regardless of which panel is shown.

4. Assign all three buttons to the same radio group: select each button, open the Property Editor, set `radioGroup` to `1`, then recompile. This enforces mutual exclusivity — exactly one button is always active and cannot be deselected by clicking it again.

## Storing Panel and Button References in Arrays with a Loop [06:28]

Use a loop to populate component reference arrays instead of declaring individual variables. This scales cleanly when adding or removing tabs — only `NUM_TABS` needs updating.

```javascript
const var NUM_TABS = 3;

const var panels = [];
const var buttons = [];

for (i = 0; i < NUM_TABS; i++)
{
    panels[i] = Content.getComponent("Panel" + (i + 1));
    buttons[i] = Content.getComponent("Button" + (i + 1));
}
```

Note: The `+ 1` offset is needed because the loop is zero-based but HISE default component names start at 1 (Panel1, Panel2, Panel3).

## Defining a Shared Control Callback for Tab Buttons [09:09]

Define a single `inline function` callback and assign it to every button in the loop. Because buttons are in a radio group, clicking one fires the callback **twice** — once for the button turning off, once for the button turning on. Guard with `if (value)` to only act on the activation event.

```javascript
inline function changeTab(component, value)
{
    if (value)
    {
        // Tab-switching logic goes here
    }
}

// Assign the same callback to every button
for (i = 0; i < NUM_TABS; i++)
    buttons[i].setControlCallback(changeTab);
```

## Finding the Clicked Button Index with Array.indexOf [11:23]

In the shared callback, use `Array.indexOf(component)` to find which button triggered it. Since only buttons in the array can trigger this callback, the result is always a valid index (no need to check for -1).

```javascript
inline function changeTab(component, value)
{
    if (value)
    {
        local idx = buttons.indexOf(component);
        // idx corresponds to the matching panel index
    }
}
```

## Hiding All Panels and Showing the Selected One [13:21]

The simplest approach: loop through all panels, hide each one, then show only the panel matching the clicked button's index. The `set("visible", ...)` method controls the same Visible property available in the Property Editor.

```javascript
inline function changeTab(component, value)
{
    if (value)
    {
        local idx = buttons.indexOf(component);

        // Hide all panels
        for (i = 0; i < panels.length; i++)
            panels[i].set("visible", false);

        // Show the one matching the clicked button
        panels[idx].set("visible", true);
    }
}
```

## Simplifying Visibility Logic with showControl and Inline Boolean Expressions [15:28]

1. Replace `panel.set("visible", false/true)` with `panel.showControl(false/true)` — shorter and immediately readable.

2. Collapse the hide-all + show-selected pattern into a single loop using an inline boolean expression. In HiseScript, `i == idx` evaluates to `1` or `0` directly — it does not need to be wrapped in an `if` statement:

```javascript
inline function changeTab(component, value)
{
    if (value)
    {
        local idx = buttons.indexOf(component);

        for (i = 0; i < panels.length; i++)
            panels[i].showControl(i == idx);  // 1 for selected, 0 for all others
    }
}
```

This replaces both the loop-to-hide-all and the separate show-selected call in a single line.

## Implementing Toggle Tabs with a No-Selection Fallback Panel [21:08]

For cases where all buttons can be deselected (showing a fallback panel when nothing is active):

1. Add a fourth panel with a distinct name (e.g. "DifferentPanel") — keep it separate from the main panel group.
2. Remove all buttons from the radio group (set `radioGroup` to `0`). Handle mutual exclusion manually in code.
3. Remove the `if (value)` guard since the callback must now run for both on and off events.

## Inline Logic for Exclusive Tab Selection with Toggle Support [25:18]

Extend the inline boolean pattern to handle both button toggling and panel visibility in a single loop. The key addition: AND the equality check with `value` so buttons only activate when the click was an "on" event. Without this, re-clicking an active button would blink (incoming value=0 gets overridden to 1).

```javascript
const var differentPanel = Content.getComponent("DifferentPanel");

inline function changeTab(component, value)
{
    local idx = buttons.indexOf(component);

    for (i = 0; i < buttons.length; i++)
    {
        // Activate button only if: it matches the clicked button AND the click turned it on
        buttons[i].setValue(buttons[i] == component && value);

        // Mirror the same logic for panel visibility
        panels[i].showControl(buttons[i] == component && value);
    }

    // Show fallback panel when the clicked button is now off
    // !value is equivalent to value == 0
    differentPanel.showControl(!value);
}

for (i = 0; i < NUM_TABS; i++)
    buttons[i].setControlCallback(changeTab);
```

Note: You only need to check the clicked button's value for the fallback panel — the loop already handles turning off all other buttons. To debug visibility without coloured panels, check the widget list: invisible controls appear grayed out.

## Using Knobs and Combo Boxes as Alternative Tab Controllers [29:58]

Any control that provides a numeric value can drive tab switching — buttons just happen to provide an array index. A knob or combo box provides the index directly from its value.

**Knob setup:** Set min=0, max=2 (for 3 panels), stepSize=1. The knob value maps directly to the panel index:

```javascript
const var tabKnob = Content.getComponent("Knob1");

inline function changeTab(component, value)
{
    for (i = 0; i < panels.length; i++)
        panels[i].showControl(i == value);
}

tabKnob.setControlCallback(changeTab);
```

**ComboBox setup:** Add items (e.g. "Panel 1\nPanel 2\nPanel 3"). ComboBox values are **1-indexed** (not 0-indexed like knobs and buttons), so subtract 1 before comparing:

```javascript
const var tabCombo = Content.getComponent("ComboBox1");

inline function changeTabCombo(component, value)
{
    for (i = 0; i < panels.length; i++)
        panels[i].showControl(i == value - 1);
}

tabCombo.setControlCallback(changeTabCombo);
```

These approaches can be mixed freely — one section of the interface tabbed by buttons, another by a knob, another by a combo box.

## Core Principles of Panel-Based Interface Design in HISE [36:41]

The fundamental pattern: a Panel acts as a container (page or tab) for all controls belonging to a view. One `showControl()` call on the Panel handles all its child controls at once — no need to track and toggle individual controls. This is significantly simpler than equivalent workflows in tools like Kontakt, where each control must be managed individually.
