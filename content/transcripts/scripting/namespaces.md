---
title: "Namespaces"
summary: "How to use namespaces in HiseScript to organise code into logical sections, avoid variable collisions, gain additional reg slots, and structure large projects with one namespace per file."
channel: "David Healey"
videoId: "tO--8nUZIbc"
url: "https://youtube.com/watch?v=tO--8nUZIbc"
publishDate: "2024-06-01"
views: 432
likes: 20
duration: 836
domain: "scripting"
---

# Namespaces — David Healey

## Introduction

This recipe covers how to use namespaces in HiseScript to compartmentalise your `onInit` code into logical, reusable sections. It explains namespace syntax, scoping rules, naming conventions, variable restrictions, and a recommended project structure pattern of one namespace per UI panel in separate include files.

## Introduction to Namespaces — Organisation, Scope, and reg Variable Expansion [00:00]

1. Declare a namespace inside `onInit` using the `namespace` keyword followed by a name and curly braces. Everything inside is scoped to that namespace.

```javascript
namespace App
{
    reg myValue = 10;
    const var MySlider = Content.getComponent("MySlider");

    inline function doSomething()
    {
        Console.print("hello world");
    }
}
```

2. Access namespace members from outside using dot notation: `App.myValue`. Without the prefix, the identifier is out of scope and causes an error.

3. **Why use namespaces:**
   - Compartmentalises `onInit` code into logical sections, making large projects easier to navigate and debug.
   - Enables code reuse across projects by keeping related variables, references, and functions together.
   - Each namespace grants an additional 32 `reg` variable slots (the global limit is 32). This alone makes namespaces worth using in DSP-heavy projects.

4. Think of a namespace like a singleton class — it is not truly OOP, but it provides a similar grouping of state and behaviour under a named scope.

## Naming Conventions and Moving Namespaces to External Files [02:30]

1. Use **PascalCase** for namespace names (e.g. `App`, not `app`). This mirrors HISE's built-in namespaces (`Content`, `Console`, `Engine`) and visually distinguishes namespaces from plain objects (camelCase).

2. Call namespace functions from outside using dot notation: `App.myFunc()`.

3. **Avoid cross-namespace calls where possible.** If `NamespaceB` calls `App.myFunc()`, it creates a hard dependency — if `App` does not exist, the call fails. Keep each namespace self-contained.

4. To move a namespace to an external file: highlight the namespace block, right-click, choose **"Move selection to external file"**, and name it to match the namespace. HISE appends `.js` automatically and places the file in `Scripts/`.

## Variable Declaration Rules and Namespace Restrictions [05:00]

1. **Never declare `var` inside a namespace.** `var` leaks into the global scope even when written inside a namespace block, defeating encapsulation entirely:

```javascript
namespace App
{
    var myVar = 10;       // BAD — leaks to global scope
    const var myConst = 10; // GOOD — stays in namespace
    reg myReg = 0;          // GOOD — stays in namespace
}
```

2. **Variable type rules by context:**
   - Namespace init scope: `const var` or `reg`
   - Inside `inline function` within a namespace: `local`
   - Only use `var` in regular (non-inline) functions or paint routines where no other type is available

3. **Namespaces cannot be nested.** The following is invalid:

```javascript
namespace App
{
    namespace Inner { } // NOT allowed
}
```

4. One namespace per file. A file named `App.js` should contain only the `App` namespace.

## Structuring Projects with Namespace-per-File Includes [07:30]

Structure large projects as namespace-per-file using includes. The `onInit` block becomes a flat list of includes:

```javascript
// onInit
include("App.js");         // app-level setup: fonts, deferred callbacks
include("Paths.js");       // SVG path definitions / icon data
include("LookAndFeel.js"); // shared LAF functions across components
include("Header.js");      // one namespace per UI panel section
include("Grid.js");        // namespace matching panel name
include("Account.js");     // namespace for login/account panel
include("Settings.js");    // namespace for settings panel
```

**Recommended namespace categories:**
- `App` — fonts, deferred callbacks, global app state
- `Paths` — all SVG path strings
- `LookAndFeel` — shared LAF functions applied across multiple components
- One namespace per UI panel, named to match the panel's identifier

## Matching Namespaces to UI Panels [10:00]

1. **Name each namespace after its matching UI panel.** If a panel is called `pnl_header`, create `Header.js` wrapping everything in `namespace Header { }`. This makes the code location for any panel immediately obvious.

```javascript
// Header.js
namespace Header
{
    const var pnl_Header = Content.getComponent("pnl_Header");

    pnl_Header.setPaintRoutine(function(g)
    {
        // draw header UI...
    });
}
```

2. **Avoid reserved HISE class names for namespaces.** HISE throws an "illegal namespace ID" error if your namespace shares a name with a built-in class (e.g. `Settings`, `Engine`). Use a distinguishing prefix instead — e.g. `UserSettings` rather than `Settings`.

3. Because all logic for a given panel lives inside a single namespaced include, you can lift that file into another project and it works standalone. This also means you can debug, edit, and reason about each section in isolation.
