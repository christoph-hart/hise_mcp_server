---
title: "HISE Scripting 101"
summary: "Comprehensive beginner tutorial covering all HiseScript fundamentals: callbacks, variable types (var/const var/reg/local/global), data types, arrays, objects, operators, if/else/switch, ternary, for/for-in/while loops, and functions (regular vs inline)."
channel: "David Healey"
videoId: "8JO4m-OloqA"
url: "https://youtube.com/watch?v=8JO4m-OloqA"
publishDate: "2021-12-25"
views: 0
likes: 0
duration: 5758
domain: "guide"
---

# HISE Scripting 101 — David Healey

## Introduction

This comprehensive beginner tutorial covers all HiseScript fundamentals from callbacks to functions. It's the definitive starting point for learning to script in HISE.

## Callbacks [00:25]

Default callbacks selected from the Script Editor's callback menu:

- `onInit` — runs at compile/load. All setup code goes here.
- `onNoteOn` — fires on MIDI note-on.
- `onNoteOff` — fires on MIDI note-off.
- `onController` — fires on any incoming MIDI CC.
- `onControl(number, value)` — fires when a UI control is interacted with.
- `onTimer` — fires on a repeating interval, must be started explicitly.

```javascript
// Start/stop the timer
Synth.startTimer(1);  // interval in seconds
Synth.stopTimer();
```

## Variables [09:34]

Four variable types in HiseScript:

| Keyword | Scope | Reassignable | Use case |
|---|---|---|---|
| `var` | Script-wide | Yes | General purpose |
| `const var` | Script-wide | No | Constants, UI references |
| `reg` | Script-wide | Yes | Audio-thread callbacks (max 32) |
| `local` | Block `{}` | Yes | Inside inline functions |

```javascript
const var MY_CONSTANT = 10;
const var myButton = Content.getComponent("myButton");
reg myReg = 10;

inline function myFunc()
{
    local x = 10;
}
```

**Global variables** — accessible across multiple scripts:

```javascript
Globals.currentArticulation = 10; // set in Script 1
Console.print(Globals.currentArticulation); // read in Script 2
```

## Data types [21:00]

| Type | Example | Notes |
|---|---|---|
| Number | `58`, `3.14` | Integers and floats |
| String | `"hello"` | Single or double quotes |
| Boolean | `true`/`false` | `true == 1`, `false == 0` |
| `undefined` | unassigned var | Causes API error if passed |

## Arrays [25:07]

```javascript
const var arr = [123, 456, "text", false];
Console.print(arr[0]);  // 123
arr.push(78);           // append to end
```

Nested arrays: `arr[3][0]` accesses the first element of a nested array.

## Objects [33:15]

```javascript
const var obj = {"key": "text", "num": 123};

Console.print(obj.key);      // dot notation
Console.print(obj["key"]);   // bracket notation (required for numeric keys)

obj.newKey = [1, 2, 3];      // add new properties freely
```

## Operators [39:38]

Mathematical: `+`, `-`, `*`, `/`, `%` (modulus), `++`, `--`.

String concatenation with `+`: `"hello " + 10` → `"hello 10"`.

Comparison: `==`, `!=`, `>`, `<`, `>=`, `<=`.

Use parentheses to control precedence: `a * (b + 2)`.

## If statements and logical operators [49:47]

```javascript
if (a == 10 && b == 5)
    Console.print("both true");
else if (a == 10 || b == 3)
    Console.print("one true");
else
    Console.print("neither");
```

Logical operators: `&&` (AND), `||` (OR), `!` (NOT). Use parentheses to group sub-conditions.

## Ternary operator [61:54]

```javascript
(a == 9) ? Console.print("true") : Console.print("false");
```

## Else if [63:47]

Chain `else if` for multiple conditions on different variables. Add bare `else` as catch-all.

## Switch statement [67:05]

```javascript
switch (a)
{
    case 10: Console.print("Bob"); break;
    case 8:  Console.print("John"); break;
    default: Console.print("default"); break;
}
```

Every `case` must end with `break`.

## For loop [70:49]

```javascript
for (i = 0; i < data.length; i++)
    Console.print(data[i]);
```

Use `.length` instead of hard-coded counts. Loop counter variables don't need a keyword declaration.

## For-in loop [79:11]

Iterates over object keys:

```javascript
const var obj = {"a": 10, "b": 20};
for (k in obj)
    Console.print(obj[k]); // prints values
```

## While loop [80:50]

```javascript
reg count = 0;
while (count < 20)
{
    Console.print(count);
    count++;
}
```

Always mutate the condition variable inside the body to avoid infinite loops.

## Functions [83:30]

**Regular function** — use outside real-time callbacks:

```javascript
function addition(a, b)
{
    var c = a + b;
    Console.print(c);
}
```

**Inline function** — required for real-time callbacks, supports `local` variables. Use 99% of the time:

```javascript
inline function addition(a, b)
{
    local c = a + b;
    Console.print(c);
}
```

**Custom UI callback:**

```javascript
inline function onButton1Control(component, value)
{
    Console.print(value);
}

Content.getComponent("Button1").setControlCallback(onButton1Control);
```
