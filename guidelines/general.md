# General Writing Style Guide

Authoritative reference for all human-facing HISE documentation prose - scripting API, module reference, UI components, architecture docs, and guides. Pipeline-specific style guides extend this with domain-specific rules.

For cross-reference links, warnings, tips, and common mistake formatting, see `style-guide/canonical-links.md`.

---

## Audience

All HISE documentation is written for HISEScript developers who have no knowledge of C++ internals. They want to know what something does, how to use it, and what to watch out for.

---

## Spelling

Use **British English** throughout. This matches the JUCE codebase conventions.

Common words to watch:

| British (correct) | American (wrong) |
|---|---|
| behaviour | behavior |
| colour | color |
| normalised | normalized |
| serialised | serialized |
| specialised | specialized |
| favourite | favorite |
| honour | honor |
| initialise | initialize |
| customise | customize |
| recognise | recognize |

---

## What to Strip

These elements must NEVER appear in user-facing documentation. They are C++ implementation details that mean nothing to a HISEScript developer.

- **C++ class names** - e.g. `AudioThreadGuard::Suspender`, `HardcodedScriptProcessor`, `EnvelopeModulator`, `DynamicObject`
- **C++ type names** - e.g. `juce::BigInteger`, `AudioSampleBuffer`, `MemoryOutputStream`
- **C++ method names** - e.g. `setInternalAttribute()`, `processBlock()`, `applyEffect()`
- **Preprocessor guard names** - e.g. `USE_BACKEND`, `HISE_INCLUDE_PROFILING_TOOLKIT`
- **Assertion macros** - e.g. `jassertfalse`, `JUCE_ASSERT`
- **Source code references** - e.g. "defined in DelayEffect.cpp line 142"
- **Implementation mechanisms** - e.g. "uses a 1024-sample crossfade in the DelayLine class"
- **Implementation details** - e.g. "uses `reportScriptError` internally", "casts to `bool` via JUCE `var` conversion"
- **Thread safety internals** - e.g. "dispatched asynchronously to the message thread via `MessageManager::callAsync`". Instead say "runs asynchronously on the UI thread" if the threading behaviour matters to the scripter.
- **C++ type system references** - e.g. "`var`", "`const String&`". Use HISEScript types instead: "String", "Number", "Array", "Object", "Function".

### Translation table

| C++ exploration finding | User-facing prose |
|---|---|
| "Implemented as HardcodedScriptProcessor with scripting callbacks" | "A built-in MIDI processor" |
| "Calls `reportScriptError` if the index is out of bounds" | *(omit - the API handles it)* |
| "Dispatched via `MessageManager::callAsync` to avoid blocking the audio thread" | "Runs asynchronously on the UI thread" |
| "Returns a `var` containing the JSON object" | "Returns the configuration as a JSON object" |
| "Guarded by `USE_BACKEND` - no-op in exported plugins" | "Only works in the HISE IDE" |
| "Uses juce::BigInteger bitmask for channel range" | "Checks the message channel against the allowed range" |
| "1024-sample crossfade in DelayLine" | "Crossfades when delay time changes to prevent clicks" |
| "VoiceData struct stores per-voice state" | "Each voice maintains its own envelope state" |

---

## Tone

- **Direct and practical.** Explain what something does, not how it is implemented.
- **Concise.** Avoid filler words and unnecessary qualifications.
- **Specific.** Avoid vague statements like "useful for debugging" - say what it actually does.
- **No marketing language.** No "powerful", "flexible", "easy-to-use".
- **No em-dashes.** Use a regular dash or rewrite the sentence.
- **Scale to complexity.** Simple topics get brief prose. Complex topics with multiple modes or subsystems get fuller explanations.

---

## Lead with the Concept

The reader can already see the heading, method signature, or module name. Documentation should explain the *concept* or *use case*, not restate what is already visible.

**Good** - explains the concept:
> If you assign an array reference to another variable, you're only setting the reference. Changes to one will affect the other. Use `clone()` to create an independent copy.

**Bad** - restates the obvious:
> The `clone` method creates a copy of the array and returns it.

If something truly has nothing to add beyond its name/signature, a single focused sentence is acceptable.

---

## Formatting

### Lists

When prose contains **3 or more items** in a comma-separated enumeration, break them into a bulleted or numbered list:

- **Numbered list** when items form distinct groups, categories, or a natural ordering.
- **Bulleted list** when items are peers without hierarchy.

The threshold is 3 items. Two items inline is fine.

### Tables

Use tables for enumerated options, mode lists, or value descriptions. Prefer tables over long comma-separated lists.

### Blockquotes

Use `>` blockquotes for:
- Warnings and tips (see `style-guide/canonical-links.md` for titled format)
- Class-wide or module-wide behavioural notes that apply broadly

### Other formatting

- **Bold/italic** - use sparingly for emphasis
- **Inline code** (backticks) - use for method names, property names, string values, and HISEScript keywords
- **Fenced code blocks** - use for construction/obtainment patterns (1-3 lines). Longer examples belong in dedicated example sections.

---

## Bug Discovery Policy

Implementation bugs must NOT appear in user-facing documentation. Report bugs in the appropriate `issues.md` file for the pipeline. Do not reference C++ line numbers, fix suggestions, or bug analysis in docs prose.

---

## Quality Baseline

Before finalising any documentation page, verify:

- [ ] British English spelling throughout
- [ ] No C++ class names, preprocessor guards, or implementation details leak through
- [ ] All content is ASCII-only (no em-dashes, curly quotes, etc.)
- [ ] Inline enumerations of 3+ items are broken into lists
- [ ] Prose reads naturally - no robotic repetition
- [ ] No "Related Methods:" bullet lists - cross-references are woven into sentences
