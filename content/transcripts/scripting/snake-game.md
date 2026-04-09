---
title: "Making a Classic Game in HISE: Let's Code Snake!"
summary: "Step-by-step guide to building a Snake game in HISE using ScriptPanel timers, key press callbacks, paint routines, and grid-based game logic — all in under 150 lines of HiseScript."
channel: "David Healey"
videoId: "SupJ1ZrKW2M"
url: "https://youtube.com/watch?v=SupJ1ZrKW2M"
publishDate: "2025-01-15"
views: 519
likes: 12
duration: 2548
domain: "scripting"
---

# Making a Classic Game in HISE: Let's Code Snake! — David Healey

## Introduction

This recipe walks through building a complete Snake game in HISE using less than 150 lines of HiseScript. You'll learn how to use a ScriptPanel as a game canvas with timer-driven game loops, keyboard input handling via key press callbacks, grid-based collision detection, and custom paint routines for rendering game objects. It's a fun way to explore core HISE scripting concepts like panel timers, the Graphics API, and event-driven programming.

## Setting up a Snake game canvas Panel and play/pause Button with timer control [00:36]

1. Add a Panel component named `pnl_canvas`, sized 500x500, positioned at x=50, y=50 (centered in a 600x600 UI). Set Background Colour to a dark gray, Item Colour (snake colour) to green, Item Colour 2 (apple/food colour) to red. Disable "Save in Preset".

2. Add a Button named `btn_play_pause`, text "Play-Pause". Disable "Save in Preset". This button starts/stops the panel's built-in timer to control game loop speed.

3. Use `!` in navigation comments to create bookmarks — middle-click the comment in the editor to jump to that location. Useful for navigating long scripts.

4. Call `setConsumedKeyPresses()` on the panel BEFORE assigning the key press callback, otherwise the script throws an error on compile. Pass the accepted keys as an array.

```javascript
// ! UI References

const var pnl_canvas = Content.getComponent("pnl_canvas");
const var btn_play_pause = Content.getComponent("btn_play_pause");

// Must call setConsumedKeyPresses before assigning the key press callback
pnl_canvas.setConsumedKeyPresses(["w", "a", "s", "d"]);

// Paint routine — fill in later
inline function paintCanvas(g)
{
    // game rendering goes here
}
pnl_canvas.setPaintRoutine(paintCanvas);

// Key press callback — takes a single event object parameter
inline function onKeyPress(event)
{
    // translate w/a/s/d to direction here
}
pnl_canvas.setKeyPressCallback(onKeyPress);

// Timer callback — takes no parameters, drives the game loop
inline function onTimer()
{
    // update snake position, check collisions, repaint here
}
pnl_canvas.setTimerCallback(onTimer);

// Play/pause button: start or stop the panel timer.
// Timer interval (ms) controls game speed — 100ms = 10 updates/sec.
inline function onPlayPause(component, value)
{
    if (value)
        pnl_canvas.startTimer(100);
    else
        pnl_canvas.stopTimer();
}
btn_play_pause.setControlCallback(onPlayPause);
```

Key decisions: The panel's built-in timer (not a separate `Timer` object) is used so the timer callback operates in the panel's scope. The `w/a/s/d` key scheme maps to up/left/down/right. The 100ms interval is a starting point; it can be replaced with a knob value later.

## Declaring game state variables and constants [06:24]

Use `const var` in ALL_CAPS for fixed constants that never change. Use lowercase names for mutable state variables. All declared at the top of the script, outside any callback.

```javascript
// Fixed grid cell size — increase for a larger snake, decrease for smaller
const var CELL_SIZE = 20;

// Mutable state — populated later; not const because they are reassigned at runtime
var snake = [];     // Array of segment objects {x, y} making up the snake body + head
var apple = {};     // Single object holding {x, y} of the apple's grid position

// Direction vector for the snake's current movement
// Both axes start at 0 (snake is stationary at game start)
// Moving right: {x: positive, y: 0}  Moving left: {x: negative, y: 0}
// Moving up: {x: 0, y: negative}     Moving down: {x: 0, y: positive}
var direction = {x: 0, y: 0};
```

## Implementing the game loop using ScriptPanel timer callback [08:47]

Structure the game loop inside the ScriptPanel's timer callback by delegating all work to a single `doGame` function. This keeps the callback clean and the game logic modular.

The three responsibilities of the game loop, in order:
1. Respond to user input (check which direction key was last pressed)
2. Check for game state changes (snake ate apple, out of bounds, self-collision)
3. Update the GUI (repaint the canvas)

```javascript
// Timer callback delegates entirely to doGame()
// The timer running continuously IS the game loop
inline function onTimer()
{
    doGame();
}
pnl_canvas.setTimerCallback(onTimer);

inline function doGame()
{
    // 1. Respond to user input
    // (read last pressed direction key and update snake heading)

    // 2. Check game state changes
    // (collision with apple, out-of-bounds, self-collision)

    // 3. Update GUI
    pnl_canvas.repaint();
}
```

Note: Placing all game logic in `doGame()` rather than directly in the timer callback makes each responsibility easy to locate and expand independently.

## Handling keyboard input for Snake movement direction [10:23]

Use the key press callback on the canvas panel to detect WASD key presses. The incoming `event` object exposes `event.keyCode` and `event.description`. The four relevant key codes are: W=119, A=97, S=115, D=100.

```javascript
// Key press callback — receives a single event object
inline function onKeyPress(event)
{
    switch (event.keyCode)
    {
        case 97:  direction.x = -CELL_SIZE; direction.y = 0;  break; // A — left
        case 100: direction.x =  CELL_SIZE; direction.y = 0;  break; // D — right
        case 115: direction.x = 0; direction.y =  CELL_SIZE;  break; // S — down
        case 119: direction.x = 0; direction.y = -CELL_SIZE;  break; // W — up
    }
}

pnl_canvas.setKeyPressCallback(onKeyPress);
```

Note: The canvas panel must have focus (be clicked) before key events are received. Focus changes also fire the key press callback with `event.isFocusChange == true`, so only act on events whose `keyCode` matches your list.

## Spawning and drawing the apple on the game canvas [15:09]

1. Create a `spawnApple` function that returns an object with random `x` and `y` positions locked to the grid. Multiply `Math.random()` by the number of cells, then by `CELL_SIZE` — this ensures the apple snaps to a grid cell rather than landing at an arbitrary pixel:

```javascript
inline function spawnApple()
{
    local numCells = Math.floor(pnl_canvas.getWidth() / CELL_SIZE);
    local result = {};
    result.x = Math.floor(Math.random() * numCells) * CELL_SIZE;
    result.y = Math.floor(Math.random() * numCells) * CELL_SIZE;
    return result;
}
```

Using `getWidth() / CELL_SIZE` means the grid automatically adapts if either the panel size or `CELL_SIZE` changes.

2. Create a `reset` function that initialises game state to defaults. Call it once at script startup so `apple` is populated on first compile:

```javascript
inline function reset()
{
    apple = spawnApple();
    // Additional reset logic (snake position, score, etc.) added later
}

reset();
```

3. In the panel's paint routine, draw the background using the panel's own component properties, then draw the apple:

```javascript
inline function paintCanvas(g)
{
    local a = this.getLocalBounds(0);

    // Fill background using the panel's background colour and border radius
    g.setColour(this.get("bgColour"));
    g.fillRoundedRectangle(a, this.get("borderRadius"));

    // Guard: skip drawing if apple is not yet defined
    if (!isDefined(apple) || apple.x < 0 || apple.y < 0)
        return;

    // Draw apple as an ellipse occupying one grid cell
    g.setColour(this.get("itemColour2")); // itemColour2 = apple colour
    g.fillEllipse([apple.x, apple.y, CELL_SIZE, CELL_SIZE]);
}
```

Notes:
- Using `this.get("borderRadius")` keeps the corner rounding editable from the panel's property list.
- `this.get("itemColour2")` reads the apple colour from the panel's colour property, keeping colour configuration centralised in the UI editor.

## Initializing and drawing the Snake with grid-snapped segments [21:53]

1. The snake is an array of segment objects, each with `x` and `y` properties — identical in structure to the apple. This makes draw logic simple and uniform.

2. In the `reset()` function, initialize the snake with a single starting segment centered on the canvas, snapped to the grid:

```javascript
inline function reset()
{
    local startX = Math.floor((pnl_canvas.getWidth() / 2) / CELL_SIZE) * CELL_SIZE;
    local startY = Math.floor((pnl_canvas.getHeight() / 2) / CELL_SIZE) * CELL_SIZE;

    snake = [{ "x": startX, "y": startY }];
    apple = spawnApple();
}
```

3. In the paint routine, draw the snake before the apple (so the apple renders on top). Dim non-head segments to visually distinguish the head:

```javascript
// Inside paintCanvas — draw snake before apple
for (i = 0; i < snake.length; i++)
{
    local alpha = (i == 0) ? 1.0 : 0.5;
    g.setColour(Colours.withAlpha(this.get("itemColour"), alpha));
    g.fillRoundedRectangle([snake[i].x, snake[i].y, CELL_SIZE, CELL_SIZE], 3);
}
```

Key decisions:
- Head (`i == 0`) gets full alpha; tail segments get `0.5` — a simple single-pass opacity fade.
- `itemColour` (via `this.get("itemColour")`) is the panel's tint colour property, reused for the snake.
- Using `fillRoundedRectangle` with corner radius `3` gives a softer look.

## Implementing snake movement and apple eating logic [26:20]

1. To move the snake each game tick, compute a new head by adding the current direction vector to the existing head position, insert it at index 0, then remove the tail with `pop()`. Growth on apple-eat works the same way but omits the `pop()` — the tail stays, lengthening the snake by one segment.

2. Implement the `eatApple` check as a simple coordinate comparison between the head and the apple.

```javascript
inline function eatApple()
{
    return snake[0].x == apple.x && snake[0].y == apple.y;
}

inline function doGame()
{
    // Build new head from current head position + direction vector
    local head = {};
    head.x = snake[0].x + direction.x;
    head.y = snake[0].y + direction.y;

    // Prepend new head
    snake.insert(0, head);

    if (eatApple())
    {
        // Grow: keep tail, spawn replacement apple
        apple = spawnApple();
    }
    else
    {
        // Move: discard last segment so length stays constant
        snake.pop();
    }

    // Repaint after every state update
    pnl_canvas.repaint();
}
```

Note: `Array.insert(0, value)` prepends to a HiseScript array. `Array.pop()` removes the last element. Calling `repaint()` inside the game loop keeps rendering coupled to game state.

## Self-collision detection and game over reset logic [31:53]

1. Add an `isCannibal` function to detect whether the snake's head has collided with any body segment. Skip the head itself (index 0) using an index-based loop starting at 1:

```javascript
inline function isCannibal()
{
    // Start at index 1 to skip the head itself
    for (i = 1; i < snake.length; i++)
    {
        if (snake[i].x == snake[0].x && snake[i].y == snake[0].y)
            return true;
    }

    return false;
}
```

2. Call `isCannibal()` in the game loop after the apple-check:

```javascript
if (isCannibal())
{
    Console.print("Game over - snake ate itself.");
    reset();
}
```

3. Flesh out `reset()` so it fully stops the game:

```javascript
inline function reset()
{
    // Stop movement
    direction.x = 0;
    direction.y = 0;

    // Deactivate play/pause button and stop the timer
    btn_play_pause.setValue(0);
    pnl_canvas.stopTimer();

    // Re-initialize snake and apple
    local startX = Math.floor((pnl_canvas.getWidth() / 2) / CELL_SIZE) * CELL_SIZE;
    local startY = Math.floor((pnl_canvas.getHeight() / 2) / CELL_SIZE) * CELL_SIZE;
    snake = [{ "x": startX, "y": startY }];
    apple = spawnApple();
}
```

Note: Moving in the opposite direction of travel causes the head to immediately occupy the segment behind it, so `isCannibal()` also catches illegal direction reversals — no separate check needed.

## Wrapping the snake at screen boundaries [38:23]

After checking self-collision, add a `checkBoundary` function that wraps the snake's head to the opposite edge when it exits the canvas:

```javascript
inline function checkBoundary()
{
    // Wrap horizontally
    if (snake[0].x >= pnl_canvas.getWidth())
        snake[0].x = 0;
    else if (snake[0].x < 0)
        snake[0].x = pnl_canvas.getWidth() - CELL_SIZE;

    // Wrap vertically
    if (snake[0].y >= pnl_canvas.getHeight())
        snake[0].y = 0;
    else if (snake[0].y < 0)
        snake[0].y = pnl_canvas.getHeight() - CELL_SIZE;
}
```

Call `checkBoundary()` in the game loop after `isCannibal()`.

Note: The boundary check uses `>= getWidth()` (not `>`) because the snake position is zero-indexed — a position equal to the width is already one cell outside the visible area. When wrapping to the opposite edge, subtract `CELL_SIZE` to land on the last valid grid cell rather than at pixel 0 of the next row/column beyond the canvas.
