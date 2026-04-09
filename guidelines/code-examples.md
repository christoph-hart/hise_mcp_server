# Code Example Quality Guidelines

Editorial guidelines for full `**Example:**` code blocks in Phase 1 method documentation and Phase 3 manual overrides.

For HISEScript **syntax** rules (`inline function` vs `function`, `const var` vs `local`, colour format, no template literals, no default parameters), see `hisescript_example_rules.md` in this directory. This file covers **what makes a good example**, not how to write valid HISEScript.

---

## 1. Lead with Non-Obvious Behavior

The example should demonstrate something the reader would not guess from the signature alone. If the method name and parameters already tell the whole story, show an edge case or a common mistake instead.

**Good** -- shows the reference-vs-copy trap that motivates `clone()`:
```javascript
const var arr1 = [0, 1, 2];
var arr2 = arr1;
arr2[0] = 99;
Console.print(trace(arr1)); // [99, 1, 2] -- arr1 changed too!

arr2 = arr1.clone();
arr2[0] = 0;
Console.print(trace(arr1)); // [99, 1, 2] -- arr1 is unaffected
```

**Bad** -- restates what the signature already says:
```javascript
// Clone the array
var copy = myArray.clone();
```

---

## 2. Show Real Edge Cases

Pick edge cases that developers will actually encounter. Nested types, empty inputs, boundary values, and type-coercion surprises are all good candidates.

**Good** -- shows that `concat` treats a nested array as a single element:
```javascript
const var arr = [0, 1, [2, 3, 4]];
Console.print(arr.length); // 3 -- the nested array counts as one element

arr.concat([5, 6]);
Console.print(trace(arr)); // [0, 1, [2, 3, 4], 5, 6]
```

**Good** -- shows that `insert` wraps an array argument rather than flattening it:
```javascript
const var numbers = [1, 2, 3];
numbers.insert(1, [10, 20]);
Console.print(trace(numbers)); // [1, [10, 20], 2, 3]
```

---

## 3. Make Examples Complete and Executable

Every example must be a complete, executable piece of code that demonstrates the method's behavior. This means:

### Show how objects are obtained

Never write "Assume 'x' is a valid object" -- show the full acquisition chain.

**Good** -- shows the full chain from routing manager to cable:
```javascript
const var rm = Engine.getGlobalRoutingManager();
const var cable = rm.getCable("myCable");
cable.sendData({ "value": 42 });
```

**Bad** -- reader has no idea how to get an AudioFile reference:
```javascript
// Assume 'audioFile' is a valid AudioFile object
var sr = audioFile.getSampleRate();
```

The exception is when the method belongs to a class whose `obtainedVia` is already demonstrated in the class-level `codeExample`. In that case, a brief `const var obj = ...` line using the same pattern is sufficient -- but it must be present.

### Define all variables referenced in the code

If your example references variables, define them before use:

**Good** -- complete and executable:
```javascript
const DATA_LIST = [{Key: "A", Name: "Alpha"}, {Key: "B", Name: "Beta"}];

inline function findNameByKey(key)
{
    for (entry in DATA_LIST)
        if (entry.Key == key)
            return entry.Name;
    return "";
}

const result = findNameByKey("A");
Console.print(result); // Alpha
```

**Bad** -- references undefined DATA_LIST:
```javascript
inline function findNameByKey(key)
{
    for (entry in DATA_LIST)  // Where does DATA_LIST come from?
        if (entry.Key == key)
            return entry.Name;
    return "";
}
```

### Invoke functions to demonstrate behavior

If your example defines a function, invoke it to show what it does:

**Good** -- shows the function in action:
```javascript
inline function doubleValue(x)
{
    return x * 2;
}

Console.print(doubleValue(5)); // 10
```

**Bad** -- defines but never demonstrates:
```javascript
inline function doubleValue(x)
{
    return x * 2;
}
// Reader never sees it actually work
```

**Exception:** If the function is a callback that will be invoked by the system (e.g., `setControlCallback`, `setPaintRoutine`), showing the registration is sufficient -- you don't need to simulate the callback firing.

```javascript
// GOOD - callback will be invoked by HISE when knob changes
inline function onKnobChanged(component, value)
{
    Console.print("New value: " + value);
}

knob.setControlCallback(onKnobChanged);
```

---

## 4. Use `trace()` for Compound Types

When printing arrays, objects, or buffers, always use `Console.print(trace(x))`. Plain `Console.print(x)` only shows `[object Array]` or similar for non-scalar types.

```javascript
const var arr = [1, 2, 3];
Console.print(trace(arr));  // [1, 2, 3]
Console.print(arr);         // [object Array] -- not useful
```

For scalar values (numbers, strings, booleans), plain `Console.print(value)` is fine.

---

## 5. Multiple Blocks for Comparison

When a method replaces a common manual pattern, show both approaches so the reader sees why the API method exists. Keep each block short and label them with a comment or a preceding prose sentence.

**Good** -- functional approach vs manual loop:
```javascript
const var list = ["Hello", "world", "HISE", "rules"];

// Using find():
Console.print(list.find(function(e){ return e.contains("HI"); })); // HISE
```

```javascript
// Equivalent manual loop:
function findMatch()
{
    for (element in list)
    {
        if (element.contains("HI"))
            return element;
    }
    return undefined;
}
Console.print(findMatch()); // HISE
```

---

## 6. Trailing Prose After Code

A code block does not have to be the last thing in the section. If there is a broader point that the code alone does not convey, add a closing sentence after the block.

Example pattern in a raw docs file:
```
[code block showing clone() with arrays]

Because arrays in HISE are effectively objects, this method also works with
JSON objects and component references.
```

This trailing prose becomes `userDocs` content when the file is parsed. It is often the most valuable sentence in the entire method page.

---

## 7. Don't Over-Comment

Comments should explain *why*, not restate the code. If the code is `audioFile.getSampleRate()`, a comment saying `// Retrieve the sample rate` adds nothing.

**Good** -- comment explains the non-obvious:
```javascript
// The playback ratio compensates for sample rate mismatch
var ratio = audioFile.getSampleRate() / Engine.getSampleRate();
```

**Bad** -- comments restate every line:
```javascript
// Retrieve the sample rate of the audio file
var fileSampleRate = audioFile.getSampleRate();

// Print the sample rate to the console
Console.print("Sample rate: " + fileSampleRate);
```

---

## 8. Don't Pad with Unrelated Logic

Keep examples focused on the method being documented. If `getContent()` returns an array of Buffer objects, show how to access channels and samples. Do not include a 40-line normalization algorithm -- that belongs in a tutorial, not an API reference example.

**Good** -- focused on what `getContent()` returns:
```javascript
const var af = Synth.getAudioFile(0);
var channels = af.getContent();
Console.print("Channels: " + channels.length);
Console.print("Samples: " + channels[0].length);
```

**Bad** -- buries the API method under unrelated processing:
```javascript
var channels = audioFile.getContent();
var ch = channels[0];
var max = 0.0;
for (var i = 0; i < ch.length; i++)
    if (Math.abs(ch[i]) > max)
        max = Math.abs(ch[i]);
if (max > 0)
    for (var i = 0; i < ch.length; i++)
        ch[i] /= max;
// ... 20 more lines of processing
```

---

## 9. Show Output in Comments

When the example produces console output, show the expected output as a trailing comment on the `Console.print` line. This lets the reader verify understanding without running the code.

```javascript
const var a = [1, 6, 4, 2, 1];
a.sort();
Console.print(trace(a)); // [1, 1, 2, 4, 6]
```

For multi-line output, use a comment block after the relevant call:
```javascript
c1.sendData("hello");
// Output:
// Interface: C2 executed: "hello"
```

---

## Note on Testability

Examples in this documentation are automatically validated to ensure correctness. When writing examples:

- **Prefer deterministic output** - avoid `Math.random()`, file I/O, system state
- **Show expected output in comments** - this documents behavior AND aids validation
- **Use `trace()` for compound types** - produces parseable log output

Examples that require external resources (files, MIDI, timers) or have non-deterministic output should be marked `testable: false` in their metadata. See `test_metadata.md` for testing guidelines.

Most examples following the quality guidelines above will be naturally testable.

---

## 10. Use Named Constants Instead of Magic Numbers

When a class defines named constants (status codes, mode enums, location types), examples must use the named form rather than raw numeric literals. This reinforces the API vocabulary and prevents copy-paste errors.

**Good** - uses the named constant:
```javascript
Server.callWithGET("api/data", {}, function(status, response)
{
    if (status == Server.StatusOK)
        Console.print(trace(response));
});
```

**Bad** - uses a magic number:
```javascript
Server.callWithGET("api/data", {}, function(status, response)
{
    if (status == 200)
        Console.print(trace(response));
});
```

The class's constants are listed in the Phase 1 Readme under `## Constants`. If an example compares against a numeric value that matches a defined constant, rewrite it to use the constant name (e.g. `Server.StatusOK` instead of `200`, `FileSystem.Samples` instead of the raw enum value).

**Exception:** ARGB colour literals (e.g. `0xFF000000`, `0xFFC9EAF1`) are not magic number violations even when a matching named colour exists in the `Colours` class. Colour literals are a standard convention in graphics code and are often intentionally chosen over named colours for precision or theme customisation.
