---
title: "How I Created this Slick File Drag & Drop Panel in HISE | File Dropper"
summary: "How to build a custom file drag-and-drop panel in HISE using ScriptPanel's paint routine, Path-based dashed borders, and the setFileDropCallback API to accept and display dropped image files."
channel: "David Healey"
videoId: "PY95mlvtSDU"
url: "https://youtube.com/watch?v=PY95mlvtSDU"
publishDate: "2025-08-02"
views: 396
likes: 20
duration: 797
domain: "ui"
---

# How I Created this Slick File Drag & Drop Panel in HISE | File Dropper — David Healey

## Introduction

This recipe walks through building a custom file drag-and-drop zone in HISE. You'll create a ScriptPanel with a dashed border paint routine that responds visually to hover state, register a file drop callback to detect drag and drop events, and load dropped image files into a ScriptImage component for display.

## Building a file drag-and-drop panel: interface setup and initial paint routine [00:00]

1. Set interface size to 800x600.

2. Add a ScriptPanel named `pnl_DropZone` (position: x=80, y=140, width=450, height=320). This panel is the drop target.

3. Add a ScriptImage named `img` (position: x=550, y=150, width=230, height=310). This will display the dropped image file.

4. Set the panel's `textColour` property to a light gray (e.g. `0xFF6C6C6C`) and `borderRadius` to 6.

5. Add a paint routine to the panel. Use `this` inside the callback to access the panel's properties and data object. `this.getLocalBounds(2)` insets the drawing area by 2px on all sides.

```javascript
const var pnlDropZone = Content.getComponent("pnl_DropZone");

pnlDropZone.setPaintRoutine(function(g)
{
    // Inset area by 2px so drawing doesn't overlap the panel border
    local a = this.getLocalBounds(2);

    // Use the panel's own textColour so the look is configurable from properties
    local col = this.get("textColour");

    // Fill with low-alpha highlight only when a file is being dragged over
    if (this.data.hover)
    {
        g.setColour(Colours.withAlpha(col, 0.1));
        g.fillRoundedRectangle(a, this.get("borderRadius"));
    }
});
```

Note: `this.data.hover` is a custom flag set via the file drop callback (added in a later step). Without the callback, nothing renders — comment out the `if` block temporarily to verify the fill appearance.

## Drawing a dashed rounded rectangle border using Path [02:30]

Build a dashed border overlay inside the paint routine. Create the Path once at init scope (never inside the paint routine — it allocates). The dashed stroke is produced by `createStrokedPath()` which takes a stroke config and a dash pattern array.

```javascript
// Create the dashed border path at init scope — reuse on every repaint
const var p = Content.createPath();

// Stroke config uses PascalCase keys: Thickness, EndCapStyle, JointStyle
// EndCapStyle: "butt" (flat ends), "square", "rounded"
// JointStyle: "mitered", "curved", "beveled"
const var strokeData = { "Thickness": 1, "EndCapStyle": "rounded", "JointStyle": "beveled" };

pnlDropZone.setPaintRoutine(function(g)
{
    local a = this.getLocalBounds(2);
    local radius = this.get("borderRadius");
    local col = this.get("textColour");

    // Hover-reactive background fill
    // Alpha increases from 0.5 to 1.0 when a file is dragged over
    local alpha = this.data.hover ? 1.0 : 0.5;
    g.setColour(Colours.withAlpha(col, alpha));

    // Build rounded rect path from current bounds
    p.clear();
    p.addRoundedRectangle(a, radius);

    // Convert to dashed outline: [5px dash, 10px gap]
    local sp = p.createStrokedPath(strokeData, [5, 10]);
    g.fillPath(sp, a);

    // Draw centered label text
    g.setFont("Oxygen", 18);
    g.setColour(Colours.withAlpha(col, 0.9));
    g.drawAlignedText("Drop files here", a, "centred");
});
```

The dash pattern array `[lineLength, gapLength]` repeats along the path. More than two values creates a compound pattern — useful for fine-tuning corner appearance but requires experimentation since phase shifts at corners.

## Setting up the file drop callback to detect hover and drop events [07:30]

Register the file drop callback on the panel using `setFileDropCallback()`. It takes three arguments: a callback level string, a wildcard extension filter string, and the callback function.

```javascript
// Callback levels: "No Callbacks", "Drop Only", "Drop & Hover", "All Callbacks"
// Wildcard filter: semicolon-separated patterns like "*.png;*.jpg"
pnlDropZone.setFileDropCallback("All Callbacks", "*.png;*.jpg", function(f)
{
    // f.hover: true while dragging over panel, false when leaving or after drop
    // f.drop: true only on mouse release (actual file drop)
    // f.fileName: full absolute path to the dragged file
    this.data.hover = f.hover;
    this.repaint();
});
```

Only file types matching the wildcard are accepted — other types are silently ignored at the OS drag level. After a drop, `f.hover` becomes `false`, so the hover highlight clears automatically.

## Loading a dropped file into an Image component using setImageFile [10:00]

Extend the file drop callback to load the dropped file into the ScriptImage component. Guard with an early return so file-loading logic only runs after a confirmed drop.

```javascript
const var IMG = Content.getComponent("img");

// Clear image on init / F5 so stale content doesn't persist
IMG.setImageFile("");

pnlDropZone.setFileDropCallback("All Callbacks", "*.png;*.jpg", function(f)
{
    this.data.hover = f.hover;
    this.repaint();

    // Only proceed after the user has actually dropped the file
    if (!f.drop)
        return;

    // f.fileName is the full absolute path despite the name
    IMG.setImageFile(f.fileName);

    // Optionally convert to a File object for further operations (copy, read, etc.)
    // local file = FileSystem.fromAbsolutePath(f.fileName);
});
```

`setImageFile()` is a method on ScriptImage (not ScriptPanel). It loads the image via the HISE pool/expansion handler. Pressing F5 resets the interface and clears the loaded image, confirming the reset path works correctly.
