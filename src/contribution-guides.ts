/**
 * HISE MCP Server - Contribution Guide Definitions
 * 
 * Guides for the community contribution workflow.
 * These are exposed as MCP Resources alongside workflows and style guides,
 * and are loaded by the 'contribute' and 'review_pr' prompts.
 */

export interface ContributionGuide {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const CONTRIBUTION_GUIDES: ContributionGuide[] = [
  {
    id: 'contributor-agent-guide',
    name: 'HISE Contributor Agent Guide',
    description: 'Risk assessment protocol, red flags, positive signals, common fix patterns, and architectural reference for AI agents assisting with HISE C++ contributions',
    content: `# HISE Contributor Agent Guide

> **MCP Users:** If the HISE MCP server is available, use the \`contribute\` prompt instead of reading this document manually. The prompt embeds the critical assessment sections and guides you through the workflow step by step. This document is available as a resource via \`get_resource('contributor-agent-guide')\` for reference during the workflow.

This document is for AI coding tools (Claude Code, Cursor, etc.) assisting community contributors with HISE bugfixes and improvements. It supplements the main contributing guidelines. Read those first for the overall workflow.

## Your Role

You are helping someone who is proficient with HISEScript but may have limited C++ experience. They can:
- Build HISE from source and run it in a debugger
- Reproduce bugs and inspect runtime state
- Navigate the HISE IDE and test changes

You can:
- Navigate and search the C++ codebase efficiently
- Assess the risk profile of a proposed change
- Identify established patterns and verify consistency
- Generate the Risk Assessment Checklist for the PR description

You cannot:
- Build or run HISE (the contributor does this)
- Observe runtime behavior (ask the contributor for debugger output)
- Make design decisions about HISE's architecture (escalate these)

## Risk Assessment Protocol

Before proposing or reviewing a fix, run through these checks systematically.

### 1. The Evidence Test

Search the codebase for structural evidence that the fix is correct:

- **Find sibling functions.** If you're modifying function X, read every other function in the same class. Do they do the thing you're adding? If yes, your fix is filling a gap in an established pattern.
- **Find the adjacent code.** If you're adding a property, find other properties in the same enum/registration block. Do they follow the same pattern? If yes, replicate it exactly.
- **Find consumers.** Search for all code that calls the function you're modifying, or reads the value you're changing. Can you enumerate every consumer and verify they won't be affected?

**If you can point to existing code that already does what the fix does** — cite it explicitly in the risk report. This is the strongest possible evidence for correctness.

**If you cannot find a precedent** and your justification relies on reasoning about what the behavior *should* be — flag this clearly. The contributor should escalate to the maintainer for design input.

### 2. The Consumer Trace (Grep Test)

Before proposing a change, search for everything that depends on the behavior you're modifying:

\`\`\`
Search for: function name, enum value, property name, class name
In: the entire codebase (not just the file you're editing)
\`\`\`

Ask yourself:
- Who calls this function?
- Who reads this value?
- Who serializes/deserializes this data?
- Is this accessed via integer indices that could shift?

If you cannot exhaustively trace all consumers, note this in the risk report. Untraced consumers are a risk signal.

### 3. Red Flags — Always Escalate

Stop and recommend the contributor escalate to the maintainer if the change involves ANY of these:

**Parameter/attribute indices:**
- Adding entries to a module's attribute enum before existing entries
- Changing the stride or offset of parameter indexing schemes
- Any modification to \`getNumAttributes()\`, \`getAttribute()\`, or \`setInternalAttribute()\` indexing logic

**Scripting API method signatures:**
- Adding, removing, or reordering parameters of existing API methods
- HISE validates parameter count at compile time — this breaks ALL existing scripts calling that method

**Backend/frontend boundary:**
- Code guarded by \`#if USE_BACKEND\` or \`#if USE_FRONTEND\`
- File path resolution (paths work differently in exported plugins — files are embedded, not loaded from disk)
- The include system, \`{GLOBAL_SCRIPT_FOLDER}\` wildcards, \`{BEGIN}/{END}\` markers
- \`getExternalScriptFromCollection()\` (frontend script loading uses exact string matching)
- Any code path that differs between IDE and exported plugin

**Scripting engine internals:**
- The parser (\`JavascriptEngineParser.cpp\`)
- The preprocessor (\`preprocessCode\`, \`resolveIncludeStatements\`)
- Script compilation pipeline
- Expression evaluation (\`ApiCall::perform\`)

**Serialization format:**
- \`exportAsValueTree\` / \`restoreFromValueTree\` — existing presets and projects depend on stable serialization
- \`toDynamicObject\` / \`fromDynamicObject\` on floating tiles

**DSP and audio thread:**
- Changes to \`renderNextBlock\`, \`processBlock\`, \`calculateBlock\`, or any audio callback
- Adding objects that get instantiated per-voice or per-module-instance (modulation chains, child processors, buffers)
- Any code that could run on the audio thread — check for \`ScopedLock\` on the main controller lock as a hint

**Established behavior:**
- Changing how existing callbacks fire (control callbacks, timer callbacks, MIDI callbacks)
- Changing established DSP behavior (filter curves, envelope shapes, gain staging)
- Changing regex patterns or match criteria in parsers (broadening a regex can have unintended matches)

### 4. Positive Signals — Likely Safe

These patterns indicate a change is likely contributor-fixable:

**Pure additions (+N/-0 diffs):**
- No existing code is modified, only new code is inserted
- Existing code paths are completely untouched

**Pattern consistency:**
- The fix replicates what sibling functions already do
- LAF property forwarding (adding \`setProperty\` calls that match adjacent ones)
- API wrapper registration (\`API_METHOD_WRAPPER\`, \`ADD_API_METHOD\` following the established pattern)
- Floating tile property registration (\`RETURN_DEFAULT_PROPERTY_ID\`, \`RETURN_DEFAULT_PROPERTY\`, \`storePropertyInObject\`, \`getPropertyWithDefault\`)

**UI-layer only:**
- Changes confined to \`hi_components/\`, editor subdirectories
- Floating tile property additions
- No impact on DSP, scripting engine, or serialization

**Defensive guards:**
- Adding null checks, bounds checks, file-existence checks
- Adding early returns that prevent crashes without changing normal behavior

**HISE IDE (backend-only) UI changes:**
- Fixes to editor components, property panels, module tree views
- Adding keyboard shortcuts for existing functionality
- Layout or visual glitch fixes in backend-only panels
- Verify the code is guarded by \`#if USE_BACKEND\` or lives in \`hi_backend/\` — these changes cannot affect exported plugins

**Opt-in features:**
- New behavior that only activates when explicitly enabled via a new API call or property
- Default state preserves existing behavior exactly

## Debugger-Assisted Workflow

You cannot run HISE, but the contributor can. Use this workflow for crash bugs and behavioral issues where the root cause isn't obvious from reading the code:

### Step 1: Ask for reproduction

Ask the contributor to:
1. Build HISE in Debug configuration
2. Reproduce the bug
3. For crashes: capture the full call stack and inspect local variables at the crash site
4. For behavioral bugs: set breakpoints at suspected locations and report what values they see

### Step 2: Trace the root cause

With the runtime context from the contributor:
- Trace the call stack through the codebase to understand the chain of events
- Identify WHY a value is null/wrong/unexpected, not just WHERE it crashes
- Check whether the issue is a missing initialization, a wrong code path, or an architectural problem

### Step 3: Assess the fix

- **Simple root cause** (null pointer, missing guard, off-by-one): Propose the fix and verify it follows established patterns
- **Complex root cause** (lifecycle ordering, cross-module state, build-config divergence): Report your findings and recommend the contributor file them in the issue for the maintainer

### Critical: Don't Guess at Runtime Behavior

Without debugger output, AI tools tend to propose "symptom fixes" — changes that make the obvious error go away without addressing why it happens. Common traps:

- Adding a type check or guard that prevents the wrong code path from running, when the real issue is that the right code path isn't being reached
- Gating behavior on a condition that correlates with the bug but isn't the actual cause
- Fixing the crash site when the real bug is in the caller three levels up

If you're unsure about runtime state, **ask the contributor to verify** rather than guessing.

## How to Assess Each Impact Item

- **DSP/audio rendering:** Search for the function name in audio callbacks (\`renderNextBlock\`, \`processBlock\`, \`calculateBlock\`). Check if the file is in \`hi_dsp/\`, \`hi_modules/effects/\`, \`hi_modules/modulators/\`, \`hi_modules/synthesisers/\`.
- **Parameter indices:** Check if the file contains attribute enums, \`getAttribute\`/\`setInternalAttribute\`, \`getNumAttributes\`. Search for integer constants used to index this module's parameters.
- **Serialization:** Search for \`exportAsValueTree\`, \`restoreFromValueTree\`, \`toDynamicObject\`, \`fromDynamicObject\` in the same class.
- **Backend/frontend guards:** Search for \`USE_BACKEND\`, \`USE_FRONTEND\`, \`HI_EXPORT_AS_PROJECT_DLL\` in the file.
- **Scripting engine:** Check if the file is in \`hi_scripting/scripting/engine/\`.
- **Per-instance objects:** Search for \`PolyData\`, \`ModulatorChain\`, \`ChildProcessor\` in the class definition.
- **Existing behavior:** Search for scripts or code that calls the function/method being changed. Check the HISE documentation for the current documented behavior.
- **Performance:** Check if the module being modified could be instantiated many times (e.g., \`SineSynth\` for additive synthesis, filters in modulation chains). Adding overhead to such modules affects all existing users.

## Architectural Quick Reference

### Backend vs Frontend vs DLL

| Build Target | \`USE_BACKEND\` | \`USE_FRONTEND\` | What it is |
|--------------|---------------|----------------|------------|
| HISE IDE | 1 | 0 | Full development environment |
| Exported Plugin | 0 | 1 | What end users run |
| Project DLL | 0 | 0 | Custom C++ DSP loaded by IDE |

Key differences that catch contributors off guard:
- **Script files:** In backend, loaded from disk. In frontend, embedded in binary — retrieved by exact filename string match via \`getExternalScriptFromCollection()\`.
- **File paths:** In backend, real filesystem paths. In frontend, virtual paths and wildcards.
- **Debug output:** \`Console.print\`, \`debugToConsole\`, etc. are stripped in frontend builds.
- **Editors:** All editor/debug UI code is \`USE_BACKEND\` only.

### Module Parameter Indexing

HISE modules expose parameters via integer indices. Scripts access them as \`module.setAttribute(index, value)\`. These indices are determined by enum order and are NOT stable across code changes — adding a new enum entry before existing ones shifts every index after it. DAW automation, presets, and scripts all depend on stable indices.

**Rule: Never insert enum entries before existing entries. Append only, or use a separate mechanism (floating tile properties, runtime API calls) that doesn't affect the index scheme.**

### Threading

HISE uses a lock-free audio architecture. The audio thread must never block — no locks, no allocations, no I/O. The \`KillStateHandler\` coordinates safe cross-thread operations by suspending audio processing rather than blocking.

If your change modifies data that could be accessed from the audio thread, use \`killVoicesAndCall()\` to ensure safe modification.

### Directory Risk Map

| Directory | Risk Level | Notes |
|-----------|-----------|-------|
| \`hi_components/\`, \`*/editors/\` | Lower | UI code, no audio impact |
| \`hi_tools/hi_markdown/\`, \`hi_tools/simple_css/\` | Lower | Rendering/styling, evolving features |
| \`hi_tools/mcl_editor/\` | Lower | Code editor component |
| \`hi_core/hi_modules/effects/fx/\` | Moderate | Effect implementations |
| \`hi_core/hi_modules/modulators/mods/\` | Moderate | Modulator implementations |
| \`hi_scripting/scripting/api/\` | Moderate-High | Scripting API surface |
| \`hi_scripting/scripting/engine/\` | High | Scripting engine internals |
| \`hi_core/hi_dsp/modules/\` | High | Base classes for all DSP modules |
| \`hi_streaming/\` | High | Audio streaming, time stretching |
| \`hi_core/hi_core/\` | Critical | Core infrastructure |

## Common Fix Patterns

### Adding a floating tile property

1. Add entry to \`SpecialProperties\` enum (at the end, before \`numSpecialProperties\`)
2. Add \`RETURN_DEFAULT_PROPERTY_ID\` line (follow the pattern of adjacent entries)
3. Add \`RETURN_DEFAULT_PROPERTY\` line with default value
4. Add \`storePropertyInObject\` in \`toDynamicObject\`
5. Add \`getPropertyWithDefault\` in \`fromDynamicObject\` and apply the value

### Adding a scripting API wrapper

1. Add \`API_METHOD_WRAPPER_N\` or \`API_VOID_METHOD_WRAPPER_N\` in the Wrapper struct
2. Add \`ADD_API_METHOD_N\` in the constructor
3. Declare the method in the header with a \`/** doc comment */\`
4. Implement the method in the .cpp file

### Adding LAF property forwarding

1. Find the LAF function (usually in \`ScriptingGraphics.cpp\`)
2. Find the \`setProperty\` calls for the draw callback object
3. Add the missing property using the same \`setProperty\` / \`setColourOrBlack\` pattern
4. The property value is typically available from the component or its parent — check what's in scope

### Fixing a missing persistence call

1. Find where the setting is changed at runtime
2. Find the class that manages persistence (e.g., \`GlobalSettingManager\`)
3. Find the save method (e.g., \`saveSettingsAsXml()\`)
4. Add the persistence call after the runtime state change
5. Check: is there a matching load path? Does \`restoreFromValueTree\` / \`fromDynamicObject\` read this value?

### Fixing a null pointer crash

1. **Ask the contributor for the stack trace** — don't guess
2. Find why the pointer is null (missing initialization? wrong lifecycle order? component not in expected container?)
3. If the fix is a simple guard (null check + early return), verify the null case is truly exceptional and won't silently swallow important errors
4. If the fix requires understanding WHY the pointer should have been set, escalate — the null may be a symptom of a deeper issue
`
  },
  {
    id: 'contributing-guidelines',
    name: 'HISE Contributing Guidelines',
    description: 'Human-facing contribution guidelines: the Evidence Test, abstraction layers, good candidates for contribution, and the risk assessment checklist',
    content: `# Contributing to HISE

HISE is primarily maintained by one developer (Christoph), but community contributions are welcome and encouraged. Many HISE users are proficient with HISEScript and increasingly comfortable using AI coding tools to work with the C++ codebase. This guide helps you make contributions that are easy to review and safe to merge.

## Using the MCP Workflow (Recommended)

If you're using an AI coding tool (Claude Code, OpenCode, etc.) with the HISE MCP server, invoke the \`contribute\` prompt to start a guided workflow. The prompt walks your AI agent through:

1. **Prerequisites** — Verifies your GitHub CLI auth, HISE repo, and fork setup
2. **Assessment** — Searches the codebase for evidence, checks red flags, produces a risk verdict
3. **Fix** — Proposes a fix following established patterns, waits for your build/test confirmation
4. **Submission** — Generates the PR description with risk assessment, creates the PR via \`gh\`

If the assessment triggers red flags, the agent will create a GitHub issue for maintainer discussion instead of proceeding directly. Once the maintainer responds with guidance, re-invoke the prompt with the issue URL to resume.

## Getting Started

### Prerequisites

- **Build HISE yourself.** Fork the repo, clone it, and get a working build using Projucer-generated IDE projects. You'll need this to test your changes and, for crash bugs, to run the debugger.
- **Understand the backend/frontend split.** HISE has two main build targets: the HISE IDE (\`USE_BACKEND=1\`) and exported plugins (\`USE_FRONTEND=1\`). Code that works in the IDE may behave differently — or not exist at all — in an exported plugin. See \`guidelines/development/build-configurations.md\` for details.
- **Check the forum and issues first.** Many bugs have been discussed on the [HISE Forum](https://forum.hise.audio) before reaching GitHub. Context from those discussions is valuable.

### Manual Workflow

If you're not using the MCP prompt, follow this manual process:

1. Fork the repository and create a feature/fix branch from \`develop\`
2. Make your changes, build in Debug, and test
3. Fill out the **Risk Assessment Checklist** (see below) in your PR description
4. Submit the PR against \`develop\`
5. Christoph reviews and merges, or provides feedback

## Deciding What to Contribute

Not every bug or feature is equally suited for community contribution. The key question isn't "how hard is the code?" — it's **"could this change affect existing HISE projects in unexpected ways?"**

### The Evidence Test

Before submitting a fix, ask yourself: **can I point to existing code in the HISE codebase that already does what my fix does?**

- **Yes** — You're filling a gap in an established pattern. This is a strong signal that the fix is correct and safe. Proceed.
- **No, but I can reason about why it should work this way** — You're making a design decision, not following a pattern. Flag this in your PR and expect discussion.

This is the single most important guideline. "Link to the precedent, don't make the argument."

### Where You Put the Change Matters

The same feature can have drastically different risk profiles depending on which layer you implement it at:

| Layer | Risk | Examples |
|-------|------|----------|
| UI / Editor / Floating Tile properties | Lower | Adding a property to a floating tile panel, forwarding LAF draw properties |
| Scripting API (thin wrappers) | Lower | Exposing an existing C++ method to HISEScript |
| Module parameters / attributes | Higher | Adding or reordering attributes changes index-based access for all scripts |
| DSP / rendering pipeline | Higher | Changes here affect how every project sounds or performs |
| Scripting engine internals | Higher | Parser, preprocessor, include system, compilation pipeline |

### Good Candidates for Contribution

**Pattern consistency fixes** — A function is missing something that all its sibling functions have.

**Missing persistence** — A setting changes at runtime but isn't saved/loaded.

**Defensive guards** — A null check, bounds check, or file-existence check that prevents a crash.

**Scripting API wrappers** — An existing C++ method exposed to HISEScript via the established wrapper pattern.

**UI-layer additions** — New floating tile properties, LAF property forwarding, editor improvements.

**Pure additive features (opt-in)** — New functionality explicitly enabled via an API call or property, with zero impact on projects that don't use it.

**HISE IDE improvements** — Minor UI fixes in the HISE application: keyboard shortcuts, visual glitches, layout fixes in backend-only panels.

### Always Escalate to Maintainer

- **Parameter index changes** — Any change that shifts or reorders module attribute indices
- **Scripting API method signature changes** — HISE validates parameter count at compile time; adding a parameter breaks all existing callers
- **Backend/frontend behavioral differences** — Code paths that differ between \`USE_BACKEND\` and \`USE_FRONTEND\`
- **Scripting engine internals** — Parser, preprocessor, include resolution
- **Serialization format changes** — \`exportAsValueTree\` / \`restoreFromValueTree\` modifications
- **Audio routing architecture** — Send containers, channel counts, routing matrices, voice management
- **Plugin/DAW contract** — Automation, parameter persistence, plugin lifecycle
- **Established callback behavior** — Changes to when or how existing callbacks fire

## Crash Bugs

Crash severity does not determine who should fix the bug. A crash with a clear null pointer dereference is often *easier* to fix safely than a subtle behavioral change.

Use the debugger: reproduce the crash in Debug, capture the call stack, share it with your AI tool. This closes the gap between "symptom fix" and "root cause fix."

## The Risk Assessment Checklist

Include this in your PR description:

\`\`\`markdown
### Risk Assessment

**Change type:**
- [ ] Bugfix (fixing obviously broken behavior)
- [ ] Pattern consistency (filling a gap that sibling code already covers)
- [ ] Feature addition (new behavior, opt-in)
- [ ] Feature addition (modifies existing behavior)

**Evidence:**
- [ ] I can link to existing code that already does what my fix does: [link/reference]
- [ ] This is a new pattern (no existing precedent in the codebase)

**Impact check:**
- [ ] Modifies DSP or audio rendering code
- [ ] Modifies module parameter indices or attribute enums
- [ ] Modifies serialization (exportAsValueTree / restoreFromValueTree)
- [ ] Modifies code with USE_BACKEND / USE_FRONTEND guards
- [ ] Modifies scripting engine (parser, preprocessor, include system)
- [ ] Adds per-instance objects to a module (chains, processors, buffers)
- [ ] Could change behavior of existing HISEScript projects
- [ ] Could change how existing projects sound or perform

**Testing:**
- [ ] Tested in Debug build
- [ ] Tested in Release build
- [ ] Tested in exported plugin (if applicable)
- [ ] Reproduced the original bug before applying fix

**Files changed:** [number] files, [additions/deletions] lines
\`\`\`

## Submitting Imperfect Work

It's better to submit a PR with honest caveats than to not submit at all. Closed PRs with good analysis are valuable contributions — they document attempted approaches and save future contributors from repeating the same investigation.

## Code Style

HISE uses C++17 with the JUCE framework: tabs for indentation, Allman brace style, 120-character max line width, PascalCase classes, camelCase methods, no member variable prefixes. See \`AGENTS.md\` and \`guidelines/\` for full details.

## Using AI Tools

AI-assisted contributions are welcome and expected. If using an AI coding tool with the HISE MCP server, the \`contribute\` prompt handles the full workflow. Otherwise, point your AI tool at \`guidelines/contributor-agent.md\` for HISE-specific risk assessment instructions.

Tips: give the AI runtime context (debugger output), verify its reasoning, don't let it over-engineer, and be honest about AI involvement in the PR description.
`
  },
];

export function formatContributionGuideAsMarkdown(guide: ContributionGuide): string {
  return guide.content;
}
