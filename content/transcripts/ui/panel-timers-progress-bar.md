---
title: "HISE Panel Timers | making a progress bar"
summary: "Builds a progress bar using the panel's built-in timer, demonstrating setTimerCallback, startTimer/stopTimer, storing progress in the panel value, and looping animations with modulo."
channel: "David Healey"
videoId: "79TU6W_3qw4"
url: "https://youtube.com/watch?v=79TU6W_3qw4"
publishDate: "2022-05-21"
views: 0
likes: 0
duration: 943
domain: "ui"
---

# HISE Panel Timers | making a progress bar — David Healey

## Introduction

This recipe builds a progress bar using a Panel's built-in timer. You'll store progress state in the panel's value, drive the bar width from a normalised 0–1 value, and implement looping animation with a modulo workaround.

## Panel timer setup [00:21]

Panels have a built-in timer. Use it instead of a standalone timer object when your animation lives on a panel.

```javascript
const var pnlProgress = Content.addPanel("pnlProgress", 0, 0);
pnlProgress.set("width", 500);
pnlProgress.set("height", 200);

pnlProgress.setTimerCallback(function()
{
    // increment and repaint — see below
});

pnlProgress.startTimer(150); // interval in ms
pnlProgress.stopTimer();
```

## Drawing the progress bar background [03:35]

Centre a rectangle inside the panel using its dimensions as reference.

```javascript
pnlProgress.setPaintRoutine(function(g)
{
    g.fillAll(Colours.black);

    var a = [
        (this.getWidth() / 2) - 200,   // x: centred
        (this.getHeight() / 2) - 10,   // y: centred
        400,                            // width
        20                              // height
    ];

    // Background bar
    g.setColour(Colours.darkgrey);
    g.fillRoundedRectangle(a, 5);

    // Progress meter — width driven by panel value (0–1)
    var v = this.getValue();
    g.setColour(Colours.white);
    g.fillRoundedRectangle([a[0], a[1], a[2] * v, a[3]], 5);
});
```

## Normalised width calculation [06:00]

The white bar's width is `totalWidth * normalizedValue`. A normalised value (0.0–1.0) makes fractional scaling trivial: `a[2] * 0.75` = 75% width.

## Storing progress in the panel value [07:19]

Use the panel's own value slot (`this.getValue()` / `this.setValue()`) to keep state co-located with the component.

## Timer callback — increment and stop [09:33]

The timer callback increments the panel value, then calls `repaint()`. Stop at 0.9 (not 1.0) because `repaint()` fires after `stopTimer()`, so the final draw still adds the increment.

```javascript
pnlProgress.setValue(0);

pnlProgress.setTimerCallback(function()
{
    var x = this.getValue() + 0.1;
    this.setValue(x);

    if (x >= 0.9)
        this.stopTimer();

    this.repaint(); // triggers paint routine; runs even after stopTimer()
});

pnlProgress.startTimer(150);
```

## Looping animation with modulo workaround [12:55]

For a looping progress bar, reset the value instead of stopping. The `%` modulo operator doesn't work correctly with values below 1, so scale up internally.

```javascript
pnlProgress.setTimerCallback(function()
{
    var x = this.getValue() + 0.1;
    x = x % 11;           // wraps to 0 when reaching 11
    this.setValue(x);
    this.repaint();
});

// In the paint routine, normalise back to 0–1:
var v = this.getValue() / 10.0;
```

Use `% 11` (not `% 10`) to ensure the bar reaches full width before wrapping.
