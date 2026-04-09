# userDocs Writing Style Guidelines (Scripting API)

Extends `style-guide/general.md` with scripting API-specific rules. For general writing style, tone, spelling, what to strip, and formatting conventions, see the general guide.

---

## Purpose and Audience

`userDocs` is the human-facing documentation displayed on docs.hise.dev. Its audience is HISEScript developers who have no knowledge of C++ internals. They want to know what a method does, how to use it, and what to watch out for.

`userDocs` is distinct from the `description` field:

| Field | Audience | Purpose |
|-------|----------|---------|
| `description` | LLMs, MCP server, autocomplete | Self-contained technical summary. May include C++ context for precision. Intentionally repeats class-wide facts so each method stands alone. |
| `userDocs` | Human readers on docs.hise.dev | Concise explanation for a page where all methods are shown together. No C++ internals. No repetition of class-wide facts. |

Do not duplicate content between them. If `description` already says something, `userDocs` should add value, not echo it.

---

## What to Include

- **What the method does** in practical terms
- **What you pass in** and **what you get back**, in HISEScript terms
- **Behavioural notes** that affect the scripter (e.g. "only works in the HISE IDE", "the value is cloned at capture time")
- **Practical limitations** (e.g. "only one benchmark can be active at a time")
- **Cross-references** to related methods when it helps understanding (e.g. "Call `Console.startBenchmark()` first, then `Console.stopBenchmark()` to see the result")
- **Curated pitfalls** as `> **Warning:**` blockquotes. Check each method's `pitfalls` array in the merged JSON and surface the important ones. Omit pitfalls that are obvious from the signature, already caught by the API with an error message, or redundant with your prose. Do not duplicate between prose and a warning blockquote - pick one location for each fact.
- **Curated common mistakes** as a `## Common Mistakes` section in the class Readme.md. Review the `commonMistakes` array and keep entries that represent genuine non-obvious traps. Reword freely for readability. Note: the preview pipeline strips the Common Mistakes section at render time (it is retained in the JSON for LLM consumers but does not appear on the HTML page).
- **JSON configuration tables:** When a method accepts a JSON object with 3 or more properties, present them in a property table with columns for Name, Type, Default, and Description. An inline enumeration of properties in prose becomes unreadable at 3+ items. When properties have sub-types or categories (e.g. common vs. cell-type-specific), use separate tables per category. This pattern was established with the ScriptedViewport `setTableColumns`/`setTableMode`/`setTableCallback` rewrites.
- **JSON return/callback objects:** When a method returns or passes a structured JSON object with 3 or more properties, include a fenced JSON code block showing a realistic example value with representative data. Use `//` comments sparingly for fields whose meaning is not obvious from the key name. This replaces inline comma-separated property listings in prose, which become unreadable at 3+ items. When the same object shape appears across multiple methods (e.g. the time signature object shared by `File.loadMidiMetadata`, `MidiPlayer.getTimeSignature`, etc.), document the example JSON block on the **primary** method and cross-reference from the others with a sentence like "See `ClassName.primaryMethod` for the object format." The primary method is typically the getter or the most common entry point.
- **String enum tables:** When a method accepts a fixed set of string values and the Phase 1 data includes a `valueDescriptions` field, present them in a table in the userDocs prose rather than listing them inline. This gives the reader real information beyond the method signature. For trivial self-explanatory values, an inline list is acceptable - use judgement on whether a table adds value. When in doubt, prefer the table: it prevents the userDocs from becoming a stub that just restates the method name. **Quality gate:** If the Phase 1 value descriptions appear to be verbatim C++ enum comments without behavioural context (e.g., "No syncing going on" instead of "Disables all clock processing; no transport, beat, or grid callbacks fire"), expand them with behavioural information drawn from the class-level Details section or the method's description field. Do not publish shallow enum descriptions when richer behavioural information is available in the Phase 1 data.

---

## What to Strip (API-Specific)

In addition to the general stripping rules in `style-guide/general.md`:

- **Negative guidance that duplicates pitfalls** - don't tell the user what values are *not* allowed when the API already reports a script error for invalid input. State what to do, not what to avoid. Mention restrictions only when they are non-obvious and the API won't catch them with an error message.
- **Prose that restates a warning blockquote** - if you write a `> **Warning:**` blockquote for a pitfall, do not also state the same fact in the prose paragraph above it. The warning carries the detail; the prose should cover different ground.

---

## Tone (API-Specific)

In addition to the general tone rules in `style-guide/general.md`:

- **Scale tone to class complexity.** Simple utility classes (Console, MidiList) should be approachable and purpose-driven - a beginner/intermediate scripter is the primary reader. Complex integration classes (GlobalCable, TransportHandler) can use more technical language since their audience is likely more advanced. A pro developer won't read much about the Console overview; they'll jump straight to the methods.

---

## Length

- **Class-level `Readme.md`:** 4-8 sentences across one or two paragraphs of overview prose, plus optional lists, tables, and blockquotes. Cover what the class is for, how you typically obtain/use it, and any important behavioural notes. For simple utility classes 4 sentences may suffice; for complex classes with multiple modes or subsystems, use the full 8.
- **Method-level files:** 1-3 sentences. Most simple methods (getters, setters, assertions) need just 1 sentence. Methods with non-obvious behaviour or multi-step workflows may need 2-3.

---

## Class-Level Deduplication

The Phase 1 method descriptions are intentionally self-contained - each method repeats class-wide facts (e.g. "only works in the HISE IDE") so it can stand alone when served by the MCP server. In Phase 4, the agent sees the full class and writes prose that will be displayed together on a single page. Repeating class-wide facts on individual methods creates noise rather than reinforcement.

Before writing method-level userDocs, identify behavioural patterns that apply across multiple methods:

- Build restrictions (e.g. "IDE-only", "no-op in exported plugins")
- Prerequisite requirements (e.g. "requires the profiling toolkit")
- Thread restrictions (e.g. "cannot be called from the message thread")

State these once in the class-level `Readme.md`. Then omit them from individual method files unless a method is a notable *exception* to the class-wide rule (e.g. one method that *does* work in exported plugins when the rest don't).

This means an individual method's userDocs may be shorter and more focused than its Phase 1 description - that is intentional. The Phase 1 description remains the authoritative standalone reference; the Phase 4 userDocs is the page-context version.

---

## Don't Restate the Signature

If a method is `getSampleRate()` and returns a number, writing "Returns the sample rate of the audio file" adds nothing. Instead, explain something the reader would not know from the signature alone:

**Good** - explains the distinction between two similar methods:
> Returns the sample rate of the loaded file, which may differ from `Engine.getSampleRate()` (the audio driver's rate). Divide the two to get the playback speed ratio for matching pitch.

**Bad** - restates the obvious:
> The `getSampleRate` method returns the sample rate of the audio file. The sample rate is the number of samples per second.

If a method truly has nothing to add beyond its signature, a single focused sentence is still better than a padded paragraph. "Returns the width of this component in pixels." is acceptable for a trivial getter.

---

## No Method Catalogues in Class Overviews

The class Readme should describe *what the class is for* and *when you would reach for it*, not catalogue which methods exist. The reader can see the method list on the page; restating it in prose wastes their time.

**Bad** - lists method names as a catalogue:
> Bulk operations include `fill()` to set all 128 slots at once, `setRange()` to fill a contiguous region, `getIndex()` to find the first slot containing a value, and `getValueAmount()` to count occurrences. `isEmpty()` and `getNumSetValues()` return instantly without scanning the array.

**Good** - describes capabilities by purpose:
> You can read and write individual slots or use bulk operations to fill, search, and count across all 128 values at once.

**OK** - mentioning 1-2 methods to illustrate a workflow or relationship:
> Call `Console.startBenchmark()` first, then `Console.stopBenchmark()` to see the elapsed time.

As a rule of thumb: referencing 1-2 methods to show a relationship is fine; listing 3+ method names as a catalogue is not.

---

## No Code Examples in Prose

The `userDocs` prose should NOT include inline code examples - those are already captured in the `examples` field of the JSON and are rendered separately by the preview/website. Focus purely on explanation.

However, **fenced code blocks for construction/obtainment patterns** are allowed in the class-level Readme when showing how to create or obtain the object. If the expression is non-trivial (multi-step, involves caching), use a fenced code block rather than inline backticks:

```js
const var rm = Engine.getGlobalRoutingManager();
const var cable = rm.getCable("cableId");
```

Keep these to 1-3 lines. Anything longer belongs in the `examples` field.

---

## Cross-References in Prose

When referencing other methods in the same class, use backtick-wrapped names: e.g. `` `Console.startBenchmark()` ``. When referencing methods in other classes, use the full qualified name: e.g. `` `Engine.logSettingWarning()` ``.

Weave cross-references into natural sentences. Do not use bulleted "Related Methods:" lists - those are a leftover from the old docs format and read as boilerplate.

**Good:**
> You can customise the sort order by supplying a comparison function via `Engine.sortWithFunction()`.

**Bad:**
> **Related Methods:**
> - `Engine.sortWithFunction`

---

## Formatting (API-Specific)

In addition to the general formatting rules in `style-guide/general.md`:

### Preserved elements

The following formatting elements are preserved in `userDocs` output and should be used where they improve readability:

- **Warning blockquotes** (`> **Warning:** ...`) - the standard format for surfaced pitfalls. Use for non-obvious behavioural gotchas that a reader would not expect from the method signature. These render as styled callout boxes on the docs page. One warning per method is typical; two is the practical maximum. Always use `**Warning:**` (not "Note:", "Caution:", etc.) for consistency.
- **Informational blockquotes** (`> ...` without a **Warning:** prefix) - use for class-wide behavioural notes in the Readme (see "Class-Wide Behavioural Notes" below) and for useful tips that don't warrant a warning.
- **Tables** (`| Column | ... |`) - use for enumerated options, mode lists, or value descriptions. Prefer tables over long comma-separated lists.
- **Bulleted and numbered lists** - use when prose contains 3 or more items that would otherwise be comma-separated inline. Numbered lists for ordered/hierarchical items (capability groups, workflow steps), bulleted lists for unordered peers (callback types, use cases).
- **Fenced code blocks** (` ```js `) - use for construction/obtainment patterns in the class Readme (see "No Code Examples in Prose" above). Not for inline method examples.
- **Bold/italic** - use sparingly for emphasis.
- **Inline code** (`` `backticks` ``) - use for method names, property names, string values, and HISEScript keywords.
- **SVG diagram references** (`![alt](filename.svg)`) - used in class Readmes and method files to embed diagrams. These are handled by the preview pipeline and render correctly. Only use for Phase 4 diagram SVGs, not arbitrary images.

### Stripped elements

The following are **stripped** by the parser and should not be relied upon:

- **Arbitrary images** (`![alt](/some/path.png)`) - removed entirely (SVG diagram references in Phase 4 files are the exception; they are handled before the parser runs).
- **Non-API links** (`[text](/some/path)`) - link markup removed, link text preserved as plain text.
- **`#### Example` headings** - removed (code blocks go to the `examples` array).

---

## Class-Wide Behavioural Notes

Class-wide facts that apply to all or most methods (build restrictions, thread safety, global-vs-local scope) should be pulled into a `>` blockquote, visually separated from the overview prose. This makes it clear that these are important properties/caveats rather than continuation of the description.

**Example:**
```
Console provides debugging and diagnostic tools for HISEScript development
in the HISE IDE. [... overview prose ...]

> All Console methods become no-ops in exported plugins, so you can leave
> debugging calls in production code without performance cost. Console
> methods are safe to call from any thread, including the audio thread.
```

Place the blockquote after the overview prose (and after any lists or tables) but before the `## Common Mistakes` section.

---

## Reference Examples

Two completed classes illustrate the target style. Review both before authoring a new class to avoid style overfitting to either one.

### Console (simple namespace, 17 methods)

Console is a small, approachable namespace where every method is IDE-only. The class-level Readme states this once in a blockquote, so individual methods omit it. The overview is purpose-driven - it explains *what you use these for*, not which methods exist.

**Class Readme excerpt:**
```
# Console

Console provides debugging and diagnostic tools for HISEScript development
in the HISE IDE. The class offers three main capabilities:

1. Output methods for logging values and clearing the console.
2. Assertion methods for validating conditions and data types during development.
3. Profiling tools for benchmarking code and sampling data.

Use assertions as guard clauses to surface programming errors immediately
rather than letting bad state propagate silently. The profiling tools help
you measure execution time and capture data snapshots for inspection in the
code editor.

> All Console methods become no-ops in exported plugins, so you can leave
> debugging calls in production code without performance cost. Console
> methods are safe to call from any thread, including the audio thread.
```

**Method example - `print.md`:**
```
Prints a value to the HISE console. The value is converted to its string
representation and displayed in the console window, and also shown as an
inline debug value at the calling line in the code editor. For arrays and
objects, wrap the value in `trace()` to see the full structure instead of
`[object Array]`.
```

**Method example - `stopBenchmark.md`:**
```
Stops the benchmark timer started by `Console.startBenchmark()` and prints the
elapsed time to the console.
```

Key patterns: capabilities as a numbered list; class-wide restrictions in a blockquote; overview explains purpose, not method names; method docs focus purely on what each method does; cross-references use backtick-wrapped names.

### ScriptedViewport (UI component, 41 methods - 34 common, 7 unique)

ScriptedViewport demonstrates a different challenge: most methods are common to all UI components, and the class has three distinct operational modes. The Readme uses a table for the modes and a bulleted list for cell types. The init-time restriction is in a blockquote since it affects multiple methods.

**Class Readme excerpt:**
```
# ScriptedViewport

ScriptedViewport is a UI component created with `Content.addViewport(name, x, y)`
that operates in one of three modes:

| Mode | How to activate | Value |
|------|----------------|-------|
| Viewport | Default (no flags) | Scroll position |
| List | Set `useList` property to `true` | Selected index |
| Table | Call `setTableMode()` in onInit | `[column, row]` array |

In table mode, you define columns, populate rows, and register a callback
to handle interactions. The table supports five cell types:

- Text
- Button
- Slider
- ComboBox
- Hidden

Interactive cells fire specialised callbacks with an event object
describing the interaction type and value.

![Table Mode Setup Sequence](sequence_table-setup.svg)

> All table setup must happen during `onInit`. Only row data can be
> updated after init completes. The remaining methods are common to all
> UI components.
```

**Method example - `setTableMode.md` (viewport-specific, multi-step setup):**
```
Activates table mode and configures table-wide behaviour. Pass a metadata
object with optional properties including `RowHeight` (default 20),
`HeaderHeight` (default 24), `Sortable` (default false), `MultiColumnMode`
(default false). Must be called in onInit before `setTableColumns()` and
`setTableCallback()`.
```

**Method example - `getWidth.md` (common, trivial getter):**
```
Returns the width of this component in pixels.
```

Key patterns: the Readme uses a table for the three modes and a bulleted list for cell types instead of inline prose; overview describes the workflow ("define columns, populate rows, register a callback") without listing method names; init-time restriction in a blockquote; SVG diagram embedded between prose and blockquote; trivial common getters get one sentence.

---

## Quality Checklist

Before finalising `userDocs` for a class, verify:

- [ ] British English spelling throughout (behaviour, normalised, serialised, etc.)
- [ ] No C++ class names, preprocessor guards, or implementation details leak through
- [ ] Every method has a `userDocs` that would make sense to someone who only knows HISEScript
- [ ] Methods with Phase 3 raw docs `userDocs` were skipped (not overwritten)
- [ ] Class-level `Readme.md` describes purpose and use cases, not method catalogues
- [ ] Inline enumerations of 3+ items are broken into bulleted or numbered lists
- [ ] Class-wide behavioural notes are in `>` blockquotes, not inline prose
- [ ] Cross-references use backtick-wrapped method names
- [ ] All content is ASCII-only (no em-dashes, curly quotes, etc.)
- [ ] Prose reads naturally - no robotic "this method does X" repetition across every entry
- [ ] Class-wide facts are stated once in the Readme, not repeated on each method
- [ ] No "Related Methods:" bullet lists - cross-references are woven into sentences
- [ ] No code examples in the prose (except fenced construction patterns in the Readme)
- [ ] SVG diagrams rendered for all methods/classes with a `diagram` field (unless manual SVG exists)
- [ ] All method pitfalls reviewed; important ones surfaced as `> **Warning:**` blockquotes
- [ ] No prose/warning duplication - each fact appears in one location only
- [ ] Common mistakes curated into `## Common Mistakes` section in Readme.md
- [ ] Editorial self-review completed: cross-method redundancy consolidated, filler removed
