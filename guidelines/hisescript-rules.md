# HISEScript Code Example Rules

Rules that apply when synthesizing code examples in Phase 1 enrichment and any other pipeline stage that produces HISEScript code.

---

## Callback Functions Must Be Inline

Control callbacks and any function passed to methods like `setControlCallback()`, `setTableCallback()`, `setKeyPressCallback()`, `setTableSortFunction()`, etc. MUST use the `inline function` syntax. Regular `function` declarations allocate memory and are not safe for the audio thread.

```javascript
// WRONG - regular function allocates, not audio-thread safe
knob.setControlCallback(function(component, value)
{
    Console.print(value);
});

// CORRECT - define as inline function, then pass reference
inline function onKnobChanged(component, value)
{
    Console.print(value);
}

knob.setControlCallback(onKnobChanged);
```

**Exception:** LAF (Look and Feel) callbacks registered via `laf.registerFunction()` are NOT called from the audio thread. Use plain `function(g, obj)` syntax for these -- `inline function` is not required.

```javascript
// CORRECT - plain function is fine for LAF callbacks
laf.registerFunction("drawToggleButton", function(g, obj)
{
    g.fillAll(obj.bgColour);
});
```

---

## Variable Declarations

- `const var` for component references created in `onInit` (they should not change)
- `local` (not `var`) for variables declared inside inline functions
- `var` only at top-level scope or inside regular functions
- `reg` for performance-critical audio-thread variables

```javascript
// CORRECT
const var myKnob = Content.addKnob("MyKnob", 10, 10);

inline function onKnobChanged(component, value)
{
    local scaled = value * 100;  // local, not var
    Console.print(scaled);
}
```

---

## JSON Structure Verification

Any JSON object shown in a code example -- callback parameter objects, return values, configuration schemas -- MUST be verified from the C++ source code that constructs the object. Find the `setProperty()` or `DynamicObject` construction calls and extract the exact property names.

**Do not guess property names** from parameter names, documentation conventions, or similar APIs. Wrong property names compile silently but produce `undefined` at runtime.

---

## UI Component Classes: LAF Lookup Rule

When writing examples for any UI component class (category `"component"`), consult `enrichment/resources/laf_style_guide.json` for the correct LAF function names and callback property definitions. Use the definitive mapping table below -- do not guess LAF function names.

### Direct Component LAF Functions

| HISEScript Class | LAF Function(s) |
|---|---|
| ScriptSlider | `drawRotarySlider`, `drawLinearSlider` |
| ScriptButton | `drawToggleButton` |
| ScriptComboBox | `drawComboBox` |
| ScriptTable | `drawTableBackground`, `drawTablePath`, `drawTablePoint`, `drawTableMidPoint`, `drawTableRuler` |
| ScriptSliderPack | `drawSliderPackBackground`, `drawSliderPackFlashOverlay`, `drawSliderPackRightClickLine`, `drawSliderPackTextPopup` |
| ScriptAudioWaveform | `drawThumbnailBackground`, `drawThumbnailText`, `drawThumbnailPath`, `drawThumbnailRange`, `drawThumbnailRuler`, `getThumbnailRenderOptions`, `drawMidiDropper` |

### ScriptedViewport LAF Functions (via Global entries)

| Mode | LAF Function(s) |
|---|---|
| Table / List mode | `drawTableRowBackground`, `drawTableCell`, `drawTableHeaderBackground`, `drawTableHeaderColumn` |
| Scrollbar | `drawScrollbar` |

### ScriptFloatingTile LAF Functions (depends on ContentType property)

| ContentType | LAF Function(s) |
|---|---|
| PresetBrowser | `createPresetBrowserIcons`, `drawPresetBrowserBackground`, `drawPresetBrowserDialog`, `drawPresetBrowserColumnBackground`, `drawPresetBrowserListItem`, `drawPresetBrowserSearchBar`, `drawPresetBrowserTag` |
| Keyboard | `drawKeyboardBackground`, `drawWhiteNote`, `drawBlackNote` |
| AHDSRGraph | `drawAhdsrBackground`, `drawAhdsrBall`, `drawAhdsrPath` |
| FlexAHDSRGraph | `drawFlexAhdsrBackground`, `drawFlexAhdsrCurvePoint`, `drawFlexAhdsrFullPath`, `drawFlexAhdsrPosition`, `drawFlexAhdsrSegment`, `drawFlexAhdsrText` |
| FilterDisplay | `drawFilterBackground`, `drawFilterPath`, `drawFilterGridLines` |
| DraggableFilterPanel | `drawFilterDragHandle` |
| AudioAnalyser | `drawAnalyserBackground`, `drawAnalyserPath`, `drawAnalyserGrid` |
| Waveform | `drawWavetableBackground`, `drawWavetablePath` |
| MatrixPeakMeter | `drawMatrixPeakMeter` |
| ModulationMatrix | `getModulatorDragData`, `drawModulationDragBackground`, `drawModulationDragger` |

### Components with No LAF Functions

| HISEScript Class | Reason |
|---|---|
| ScriptPanel | Custom-drawn via `setPaintRoutine()` / Graphics API |
| ScriptLabel | Styled via properties only (font, colour, etc.) |
| ScriptImage | Displays an image resource, no custom drawing |
| ScriptWebView | Renders HTML/CSS via embedded browser engine |
| ScriptMultipageDialog | Internal rendering system based on markdown/dialog pages |
| ScriptDynamicContainer | Layout container with no visual representation of its own |

### Global LAF Functions (not component-specific)

These apply system-wide when registered on a look and feel object:

| Category | LAF Function(s) | Applies To |
|---|---|---|
| AlertWindow | `drawAlertWindow`, `getAlertWindowMarkdownStyleData`, `drawAlertWindowIcon` | System alert/dialog windows |
| PopupMenu | `drawPopupMenuBackground`, `drawPopupMenuItem`, `getIdealPopupMenuItemSize` | All popup/context menus |
| Dialog | `drawDialogButton` | Buttons inside dialog windows |
| NumberTag | `drawNumberTag` | Macro control number tag overlays |
| Scrollbar | `drawScrollbar` | Scrollbars in any scrollable component |
| TableListBox | `drawTableRowBackground`, `drawTableCell`, `drawTableHeaderBackground`, `drawTableHeaderColumn` | Table list views (ScriptedViewport table mode, PresetBrowser, etc.) |

### Using the LAF Style Guide JSON

For the full callback property definitions (the `obj` parameter properties available in each LAF function), look up the function in `enrichment/resources/laf_style_guide.json`. The JSON provides the exact property names, types, and descriptions for every LAF callback. Any callback property object shown in an example must use the exact property names from the JSON.

The factory method to create a local look and feel object is `Content.createLocalLookAndFeel()`. Attach it to a component via `component.setLocalLookAndFeel(laf)`.

---

## Notification Type Constants

When a method accepts a sync/async dispatch parameter (e.g. `registerCallback`, `setOnGridChange`, `resendLastMessage`, `bindCallback`), always use the named global constants instead of `true`/`false`:

| Constant | Value | Meaning |
|----------|-------|---------|
| `SyncNotification` | 911 | Execute synchronously on calling thread |
| `AsyncNotification` | 912 | Execute asynchronously on UI thread |
| `AsyncHiPriorityNotification` | 913 | Execute async on a separate, faster thread |

The constants are self-documenting and support a third dispatch mode (`AsyncHiPriorityNotification`) that booleans cannot express.

```javascript
// WRONG - unclear what true/false means
cable.registerCallback(onCableValue, true);
cable.registerCallback(onCableValue, false);

// CORRECT - self-documenting
cable.registerCallback(onCableValue, SyncNotification);
cable.registerCallback(onCableValue, AsyncNotification);
```

This applies to both code examples and prose descriptions. When describing parameters, write "pass `SyncNotification` for synchronous execution" rather than "pass `true` for synchronous execution".

---

## No Template Literals

HISEScript does not support backtick template literals. Use string concatenation:

```javascript
// CORRECT
Console.print("Value: " + value);

// WRONG - template literals not supported
Console.print(`Value: ${value}`);
```

---

## No Undefined as Function Argument

HISEScript throws a runtime error when `undefined` is passed as a function argument. This is intentional language design to prevent silent errors from propagating through function calls.

When documenting methods that accept "nothing" to clear or reset state (e.g. clearing a callback, removing a look-and-feel), describe the correct clearing value -- typically `false`, `0`, or `""`. **Never write "pass undefined to clear/reset".**

```javascript
// WRONG - runtime error
knob.setControlCallback(undefined);
knob.setLocalLookAndFeel(undefined);

// CORRECT - pass false to clear
knob.setControlCallback(false);
knob.setLocalLookAndFeel(false);
```

**Note for C++ analysis:** Some C++ method implementations contain `isUndefined()` checks (e.g. `if (controlFunction.isUndefined() || controlFunction == var())`). These branches are unreachable from HISEScript because the scripting engine rejects `undefined` arguments before the C++ method body executes. Do not use these C++ checks as evidence that `undefined` is a valid argument.

---

## No Default Parameters

HISEScript does not support default parameter values:

```javascript
// WRONG
inline function doSomething(x, y = 0) { }

// CORRECT - check for undefined manually if needed
inline function doSomething(x, y) { }
```

---

## Colour Format

HISE/JUCE uses the `0xAARRGGBB` hex colour format (alpha, red, green, blue). Always include the alpha channel:

```javascript
// CORRECT - 0xAARRGGBB format with alpha
0xFFFF0000  // fully opaque red
0x80000000  // 50% transparent black

// WRONG - no alpha channel
0xFF0000    // missing alpha -- HISE interprets this differently
```

For simple, common colours, prefer the constants defined in the `Colours` namespace instead of raw hex values:

```javascript
// PREFERRED - readable, self-documenting
Colours.red
Colours.lightgrey
Colours.transparentBlack

// ACCEPTABLE - when an exact colour is needed
0xFFE54D2E
```

---

## Arrow Functions Are Not Realtime-Safe

Arrow functions (`=>`) expand to regular anonymous functions internally. They allocate a scope object on each call -- **not safe for the audio thread**. Use `for...in` loops instead of `.map()`, `.filter()`, etc. in audio-thread callbacks.

```javascript
// WRONG in audio-thread context - allocates
local result = myArray.map(x => x * 2);

// CORRECT in audio-thread context - no allocation
for (v in myArray)
{
    // process v directly
}
```

Arrow functions are fine in non-realtime contexts (onInit, paint routines, timer callbacks).

---

## Prefer for...in Loops

`for...in` is significantly faster than index-based `for` loops in HISEScript. Use it as default when the index is not needed.

- On **arrays** and **Buffers**: iterates elements directly
- On **objects**: iterates keys

```javascript
// PREFERRED - gives elements directly
for (name in ["Alice", "Bob", "Charlie"])
    Console.print(name);

// Index-based - only when index is needed
for (i = 0; i < panels.length; i++)
    panels[i].set("visible", i == selectedIndex);
```

Note: loop counter variables (`i` in index-based for) do not need a keyword declaration.

---

## Variable Capturing in Closures

Inner anonymous functions cannot access outer function parameters. Use C++-style capture lists:

```javascript
inline function showDialog(presetName)
{
    // WRONG - presetName not accessible inside callback
    Engine.showYesNoWindow("Delete?", "Sure?", function(ok)
    {
        Console.print(presetName); // ERROR
    });

    // RIGHT - capture presetName explicitly
    Engine.showYesNoWindow("Delete?", "Sure?", function [presetName](ok)
    {
        Console.print(presetName); // Works
    });
}
```

Multiple captures: `function [a, b, c](param) { ... }`

---

## ComboBox Values Are Floats

ComboBox `onControl` values arrive as floats (e.g. `1.0` not `1`). Use `parseInt(value)` before string concatenation or array indexing:

```javascript
inline function onComboBoxControl(component, value)
{
    // WRONG - produces "Mode1.0" or fractional index
    local name = "Mode" + value;

    // RIGHT
    local name = "Mode" + parseInt(value);
}
```

---

## String Concatenation with Numbers

When concatenating strings and numbers, addition is ambiguous. Use parentheses to force arithmetic before concatenation:

```javascript
// WRONG - without parentheses, string concatenation takes over
Content.getComponent("Button" + i + 1);  // "Button01" not "Button1"

// CORRECT - parentheses force arithmetic first
Content.getComponent("Button" + (i + 1));

// SAFEST - parseInt guards against float values
Content.getComponent("Button" + parseInt(i + 1));
```

---

## Pass-by-Reference

Arrays and objects are passed by reference. Assignment does NOT copy:

```javascript
var a = [1, 2, 3];
var b = a;          // b points to the SAME array
b[0] = 99;
Console.print(a[0]); // 99 - a was modified!

var c = a.clone();  // Independent deep copy
c[0] = 0;
Console.print(a[0]); // 99 - a is unaffected
```

Use `.clone()` when you need an independent copy.

---

## Behavioral Differences from JavaScript

These features work but behave differently than in standard JavaScript:

| Feature | JavaScript | HISEScript |
|---------|-----------|------------|
| `str.replace("a", "b")` | Replaces **first** occurrence | Replaces **all** occurrences |
| `arr.concat([4, 5])` | Returns a **new** array | **Mutates** the original array in-place |
| `typeof true` | `"boolean"` | `"number"` |
| `typeof null` | `"object"` | `"void"` |
| `1/0` | `Infinity` | Non-finite value (propagates through arithmetic) |
| `0/0` | `NaN` | Non-finite value (propagates through arithmetic) |

Division by zero returns a non-finite value -- not `Infinity` or `NaN`. Use `isFinite(x)` to guard.

---

## Inline Functions Cannot Be Nested

`inline function` cannot be defined inside another `inline function`. Define all inline functions at file or namespace scope:

```javascript
// WRONG - nested inline function
inline function outer()
{
    inline function inner() { } // Error
}

// RIGHT - both at top-level scope
inline function inner() { }

inline function outer()
{
    inner(); // Call by reference
}
```

---

## Common Mistakes (Quick Reference)

| LLM Writes | Correct HISEScript |
|------------|-------------------|
| `const x = 5` | `const var x = 5` |
| `let x = 5` | `var x = 5` (or `reg`, `local`) |
| `x = 5` (undeclared) | Must use `var`, `reg`, `local`, `const var`, or `global` |
| `console.log()` | `Console.print()` |
| `setTimeout()` / `setInterval()` | `Engine.createTimerObject()` |
| `arr.splice(i, n)` | `arr.removeElement(i)` |
| `===` / `!==` | `==` / `!=` |
| `this.property` | `this.get("property")` / `this.set("property", value)` |
| `obj.hasOwnProperty("key")` | `isDefined(obj.key)` |
| `"key" in obj` (boolean check) | `isDefined(obj.key)` -- `in` only works in `for...in` |
| `Object.assign({}, obj)` | `obj.clone()` |
| `[...arr]` / `{...obj}` | `arr.clone()` / manual copy |
| `class Foo {}` / `new Foo()` | Factory function returning `{}` |
| `switch` without `break` | Every case **must** end with `break` |
