---
title: "How to create custom vector sliders in HISE"
summary: "Teaches how to build fully customizable vector sliders in HISE by combining invisible slider widgets with painted panels, covering unidirectional and bidirectional implementations plus visual styling with rounded rectangles and fader handles."
channel: "David Healey"
videoId: "WXRhYuVXoOk"
url: "https://youtube.com/watch?v=WXRhYuVXoOk"
publishDate: "2020-01-30"
views: 1804
likes: 35
duration: 1917
domain: "ui"
---

# How to create custom vector sliders in HISE — David Healey

## Introduction

This recipe covers how to create fully customizable vector sliders in HISE using panels and paint routines. Starting with a basic panel-only approach, it progresses to a more powerful technique that combines an invisible slider widget with a painted panel — giving you native slider features (value popups, sensitivity, default reset) plus complete visual control. It also covers bidirectional sliders and styling with rounded rectangles and fader handles.

## Setting up a Panel-based custom vector slider in HISE [00:25]

1. Add a Panel component to the interface (not a Slider). Panels support custom paint routines and mouse callbacks, enabling fully vector-based, arbitrarily shaped sliders, knobs, or range sliders.

2. Set the Panel dimensions (e.g. width: 95, height: 300). The approach works with any dimensions.

3. Set the Panel's `allowCallbacks` property to "Clicks, Hover and Dragging" so it receives all necessary mouse events.

4. Set the Panel's `min` and `max` properties to define the value range (e.g. 0–500).

5. Get a script reference to the Panel for use in callbacks.

6. Add a `setPaintRoutine` to the Panel. Once a paint routine is assigned, HISE no longer draws the default background — you must draw everything manually. Restore the background immediately with `g.fillAll(component.get("bgColour"))` to avoid an invisible component while developing.

7. Add a `setMouseCallback` to the Panel. Use `event` (not a shortened alias like `e`) as the parameter name — HISE's autocomplete only activates inside the callback when the parameter is named `event`.

## Handling drag events to update panel value based on mouse Y position [03:22]

Uses absolute Y position (not delta/offset) for a simple single-axis calculation.

```js
pnlSlider.setMouseCallback(function(event)
{
    if (event.drag)
    {
        // Guard against out-of-bounds mouse positions
        if (event.y >= 0 && event.y <= this.getHeight())
        {
            // Invert Y axis — dragging up increases value
            this.setValue(this.getHeight() - event.y);
            this.repaint();
        }
    }
});
```

**Tip:** To verify before implementing the paint routine, add `Console.print(this.getValue())` inside the paint routine — dragging should print changing values.

## Setting item color and painting panel fill based on slider value [05:46]

```js
pnlSlider.setPaintRoutine(function(g)
{
    // Background
    g.fillAll(this.get("bgColour"));

    // Fill color — uses the panel's itemColour property (configurable in properties)
    g.setColour(this.get("itemColour"));

    // Invert value to Y coordinate: (0,0) is top-left, so fill grows upward from bottom
    // Note: use `var` inside paint routines (non-inline functions) — one of the few
    // legitimate uses of `var` in HiseScript. Elsewhere prefer `reg` or `const var`.
    var newValue = this.getHeight() - this.getValue();

    // X=0, Y=newValue, width=full, height=remaining space to bottom
    g.fillRect([0, newValue, this.getWidth(), this.getHeight() - newValue]);
});
```

## Calculating Y position and height for a custom vector slider [07:45]

1. Set the slider height to the full panel height. This fills from the Y position down to the bottom of the panel, so the painted region always extends to the panel's lower edge.

2. Set the Y position to the current normalized value mapped to the panel's pixel coordinates. Because mouse Y increases downward, the top of the panel represents the maximum value and the bottom represents the minimum — invert the value-to-Y mapping accordingly.

3. The painted region spans from the mapped Y position to the bottom of the panel. The height is therefore `panelHeight - yPos`, not a fixed value.

4. For a production-ready custom slider, extend this base approach with:
   - Ctrl+click to reset the slider to its default value
   - Shift+drag to move in smaller increments for fine control

## Built-in vertical slider features and interaction behaviors [09:03]

1. Add a regular Slider component and set its Style property to "Vertical".
2. Match its dimensions and colours to your custom panel slider for a like-for-like comparison.
3. The built-in slider displays the current value in the centre of the track by default — no custom paint routine needed.
4. Enable the "Volume Pop-up" property to show a floating value tooltip during interaction.
5. Disable the text-box property if you do not want an editable text field rendered on the slider.
6. Built-in interaction behaviours provided without scripting:
   - Double-click resets the slider to its default value (defined by the slider's default parameter).
   - Ctrl+click or Shift+click opens an inline value entry field.

## Building a custom vector slider by combining a hidden slider with a painted panel [10:24]

1. Make the real slider invisible by assigning an empty PNG (100% alpha, fully transparent) as its filmstrip image and setting the number of strips to 1. This hides the default knob while preserving all slider functionality.

2. Make the panel a parent of the slider. Set the slider's X and Y to 0, 0 so it sits exactly on top of the panel. The slider and panel must share the same dimensions for this alignment to work correctly.

3. Set the minimum and maximum value range identically on both the slider and the panel (e.g. 0 to 500). Both components must agree on the value range or the visual representation will be out of sync with the actual value.

4. With this setup, mouse clicks land on the (invisible) slider, not the panel. This means the slider handles all mouse interaction and value logic natively, and the panel's paint routine must be driven by the slider's value rather than mouse callbacks on the panel. Update the paint routine accordingly — read the current value from the slider rather than from panel mouse events.

## Using the slider control callback to drive panel repaints [12:21]

Remove the panel's mouse callback and disable "allow callbacks" on it. The invisible slider handles all interaction; the panel only repaints.

```js
// Slider control callback — forward value to panel and repaint
inline function onSliderControl(component, value)
{
    pnlSlider.setValue(value);
    pnlSlider.repaint();
}

// Paint routine — convert slider value range (e.g. 0–500) to pixel coordinates
pnlSlider.setPaintRoutine(function(g)
{
    g.fillAll(this.get("bgColour"));
    g.setColour(this.get("itemColour"));

    // Convert value to Y: slider range != pixel range, so scale proportionally.
    // This eliminates rounding errors that a direct mapping would introduce.
    var newValue = this.getHeight() / this.get("max") * this.getValue();
    newValue = this.getHeight() - newValue; // invert for bottom-up fill

    g.fillRect([0, newValue, this.getWidth(), this.getHeight() - newValue]);
});
```

All native slider features (knob sensitivity, shift-click value entry, double-click to reset) work automatically because they are properties of the slider, not the panel. The knob's default value (not the panel's) determines what double-click resets to.

## Drawing a static indicator line on a custom vector slider [15:08]

1. Set the draw color to white using `g.setColour()` before drawing.
2. Draw a horizontal line with `g.drawLine(x1, x2, y, y, thickness)` where:
   - `x1 = 0`
   - `x2 = panel width`
   - Both Y values are set to the current slider position (the same Y used for the slider level indicator)
   - Line thickness = `5`

## Setting up a bidirectional slider range [16:32]

1. Change the slider range to span negative and positive values (e.g. -500 to +500). Set the same range on both the knob and the panel.

2. With a bidirectional range, the existing paint routine will not work correctly — the fill needs to draw from the center of the panel upward or downward depending on whether the value is positive or negative.

## Bidirectional paint routine with dual-formula approach for asymmetric ranges [17:05]

Uses two separate formulas so asymmetric ranges (e.g. -300 to +500) scale correctly — each direction divides by its own extreme value.

```js
pnlSlider.setPaintRoutine(function(g)
{
    g.fillAll(this.get("bgColour"));
    g.setColour(this.get("itemColour"));

    var h = this.getHeight();
    var center = h / 2;
    var value = this.getValue();

    // Scale each direction independently by its own extreme
    var upperValue = center / this.get("max") * value;
    var lowerValue = center / this.get("min") * value;

    if (value > 0)
    {
        // Draw upward from center
        g.fillRect([0, center - upperValue, this.getWidth(), upperValue]);
    }
    else
    {
        // Draw downward from center — no Y offset needed
        g.fillRect([0, center, this.getWidth(), lowerValue]);
    }
});
```

## Drawing a rounded rectangle background on a ScriptPanel [21:01]

1. Set the panel width to 50 and height to 300 to create a narrow vertical slider shape.

2. To draw a rounded rectangle background, use `g.fillRoundedRectangle()` instead of `g.fillRect()`. The call signature is `g.fillRoundedRectangle([x, y, width, height], cornerSize)`. Set x and y to 0, width to the panel width, height to the panel height, and a corner size of around 5–8 pixels.

3. Set the colour to the background colour before calling `fillRoundedRectangle`, since the fill colour must be set first with `g.setColour()`.

4. Note: if another element (such as the value fill rectangle) is drawn on top and extends to the bottom edge, it will visually mask the rounded bottom corners. This is expected — the rounding is still present underneath, but only becomes visible when the top element does not cover that region (e.g. at low values).

## Drawing a centered vertical line on a panel [22:46]

1. Set the paint color to black.
2. Draw a vertical line centered horizontally: set both x values to `width / 2`, y1 to `0`, y2 to `height`, and line width to `6`.
   - Note: No additional x offset is needed for centering; `width / 2` alone positions the line correctly at the center of the panel.

## Drawing a fader-style fill rectangle with relative dimensions [24:12]

1. Replace `fillRect` with `g.fillRoundedRectangle([x, y, width, height], cornerSize)` to give the indicator a rounded appearance. A corner size of 5 is a reasonable starting point.

2. Use panel-relative dimensions for all coordinates (e.g., `panel.getWidth() / 2` for width, `panel.getWidth() / 4` for x-offset). This ensures graphics scale correctly if the panel size changes later.

3. For a vertical fader, the y-position must be `panel.getHeight() - newValue` rather than `newValue` directly, because screen coordinates increase downward — using raw `newValue` causes the fill to move in the wrong direction.

4. Set the fill color on the graphics context (`g.setColour()`), not on the panel background property, otherwise the color change has no effect on the painted shape.

5. Tune x-position and width by subtracting small fixed offsets (e.g., `- 10`) rather than using pure division, to visually center the fader track within the panel.

6. The same paint routine approach supports more complex visuals — rounded rects can be swapped for vector paths, circles, or drop shadows using the same `g` graphics API covered in the paint routines tutorial.

## Fixing the fader position calculation to stay within panel bounds [27:29]

1. The fader graphic has its own height (e.g., 50px). When calculating the y-position using `panel.getHeight() - newValue`, the fader overshoots the bottom because its own height is not accounted for. At the minimum value, `y = 250` and `250 + 50 (fader height) = 300`, which equals the panel height — pushing it out of bounds.

2. Compensate by subtracting the fader's height from `getHeight()` in every place it is used in the position calculation. For example, replace `panel.getHeight()` with `(panel.getHeight() - 50)` in both the numerator and denominator of the calculation as appropriate. This does not affect the slider's actual value range (e.g., 0–500); it only constrains the internal pixel range used for drawing.

3. If you are driving the panel's paint routine from a separate knob/slider widget, you must call `panel.changed()` inside the knob's control callback. Without this, the panel's callback will not fire when the knob moves.
