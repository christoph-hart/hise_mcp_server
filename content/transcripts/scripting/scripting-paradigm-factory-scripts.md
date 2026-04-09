---
title: "Introduction to HISE scripting paradigm and factory scripts"
summary: "Explains HISE's modular scripting architecture — Interface Script plus small MIDI Processor scripts — and demonstrates built-in factory scripts (Legato, Transposer, MIDI Muter) for common tasks like articulation switching, before outlining when and why to move to custom scripting."
channel: "David Healey"
videoId: "PPTwXLQy5vw"
url: "https://youtube.com/watch?v=PPTwXLQy5vw"
publishDate: "2025-12-03"
views: 390
likes: 20
duration: 1335
domain: "scripting"
---

# Introduction to HISE scripting paradigm and factory scripts — David Healey

## Introduction

This recipe covers HISE's modular scripting architecture: one Interface Script for the user-facing GUI, plus small secondary MIDI Processor scripts that each handle a single responsibility. It walks through the built-in factory scripts (Legato with Retrigger, Transposer, MIDI Muter), demonstrates how to wire them to UI controls for articulation switching, and explains when you've outgrown factory scripts and need to write custom HiseScript.

## HISE scripting architecture — MIDI processors, modular scripts, and built-in factory scripts [00:00]

HISE uses a modular scripting model: one **Interface Script** (the user-facing GUI front end) plus many small secondary **MIDI Processor** scripts. Each script handles a single responsibility. This is the inverse of the Kontakt model (one large monolithic script). The smaller each secondary script, the easier it is to isolate and debug problems.

1. **Script types to know.** The most common script type is the MIDI Processor (orange square icon). Scripted Envelopes, Scripted Effects, and Scripted Modulators also exist but are advanced and used less frequently.

2. **MIDI Processors process MIDI events** — key presses, CC, etc. They are the primary mechanism for feature logic that isn't GUI-related.

3. **Secondary script UIs are developer-only.** Each MIDI Processor script can expose its own small UI panel, but these are never visible to the end user. Only the Interface Script's UI is shown in the final plug-in. Use secondary UIs to set internal parameters during development.

4. **Secondary scripts can be linked to the Interface Script.** A parameter on the main interface (e.g. a list control) can drive a value inside a secondary MIDI Processor script. This keeps the front end decoupled from the implementation logic.

5. **Use built-in factory scripts before writing your own.** HISE ships with several built-in scripts that cover common functionality. These are quick to add and still useful even after you are comfortable with custom scripting — worth checking before reinventing the wheel.

## Script chain position and scope — controlling modules at container vs. sampler level [02:30]

Script placement within the HISE module hierarchy determines which modules a script affects. A script added to a **container's** MIDI processor chain affects all child modules (e.g., all samplers inside that container). A script added to an **individual sampler's** MIDI processor chain affects only that sampler. This is a key architectural decision when building instruments with shared vs. isolated control.

1. Use container-level scripts when you want a single script to govern multiple child modules (e.g., one tuning script controlling two samplers). Any samplers added to that container later will also be affected automatically.

2. Use module-level (sampler-level) scripts when you need isolated, per-module control. Placing the script inside a specific sampler's chain scopes it to that sampler only.

3. Multiple script interfaces can coexist in a project. Secondary script interfaces (e.g., an articulation switcher) work behind the scenes and are never seen by the end user. They can be linked to and driven by the main interface script.

4. Script order within a chain can matter depending on what the scripts do. Be intentional about ordering, especially if scripts read or modify shared state that another script in the same chain also touches.

## Adding MIDI processors to a sampler chain: ScriptProcessor vs hard-coded scripts [05:00]

Place MIDI processors directly inside a sampler's chain (not the master chain) when you want them to affect only that sampler. This matters when a project uses multiple samplers for different articulations — a legato script in the master chain would unintentionally affect all of them.

To add a MIDI processor to a sampler chain, click the plus button on the sampler module (equivalent to the plus button in the chain view). From the menu:

- **ScriptProcessor**: adds a blank script with an empty editor — use this when writing custom scripts from scratch.
- **Hard-coded scripts** (sub-menu): pre-built, no-interface processors that just work. Options include Transposer, MIDI Player, Choke Group Processor, and **Legato with Re-trigger**.

The **Legato with Re-trigger** script enforces monophonic playback: when a second note is played while another is held, the first voice is cut off and only the new note sounds. It has no editable parameters.

To enable edit mode (required to see the plus/trash buttons on modules): click the pencil icon in the toolbar so it turns green.

## Using built-in Legato and Transposer MIDI scripts [07:30]

The built-in **Legato with Retrigger** script requires no configuration — drop it into the MIDI processor chain and it is ready to use. Its behaviour:

- While holding a note and pressing a second note, the first note is cut off and only the second note plays (one voice active).
- The fade-out time between cut notes is controlled by the **envelope release time**, not the script itself. Adjust release to taste for the sample set.
- Retrigger: if you release the second note while still holding the first, the first note re-triggers. This is the built-in mechanism for trills and ornaments.

The built-in **Transposer** script has a single semitone transposition control. It shifts incoming MIDI note numbers — it does not repitch audio. The sampler receives a different note number and plays the corresponding sample. To expose the transposer's semitone parameter on an instrument interface, connect a knob or slider to that parameter via script.

## Connecting MIDI processor parameters to UI controls [10:00]

1. To connect a MIDI processor parameter to a UI knob, add a knob to your interface and set its range to a subset of the processor's full range. The Transposer's full range is -24 to +24 semitones; restrict it to -12/+12 if you don't need the extremes. Set step size to 1 and middle position to 0.

2. In the knob's properties, set **Processor ID** to the target module (e.g., `Transposer 1`) and **Parameter ID** to the target parameter (e.g., `Transpose Amount`). After setting these, recompile the interface script to ensure the binding takes effect.

3. This connection mechanism is universal — it works for any HISE module parameter, not only script-based processors.

4. To route MIDI processing independently per sound generator, add separate hardcoded script instances (e.g., MIDI Muter) to each sound generator's own script chain rather than placing a single processor at the instrument top level. This gives per-generator MIDI control, which is the correct architecture when you need to enable/disable individual layers (samplers, synths, articulations) independently.

## MIDI Muter factory script — switching between sound generators without audio artifacts [12:30]

1. Add a MIDI Muter hardcoded script to each sound generator's MIDI processor chain (not the master chain). This lets you mute MIDI input per-generator independently.

2. The MIDI Muter has two key controls:
   - **Ignore All Events** button: blocks all incoming note-on and note-off messages to that generator.
   - **Fix Stuck Notes** button: allows note-off messages through even when Ignore All Events is active, preventing hanging notes.

3. Best practice: always enable Fix Stuck Notes by default whenever you add a MIDI Muter. This prevents hung notes during articulation switching. Only disable it if a specific use case requires it.

4. To switch between articulations/generators at runtime: enable Ignore All Events on the generator you want silent, disable it on the one you want active. Only one generator receives notes at a time.

5. Why MIDI Muter instead of bypass or volume: bypassing or muting volume on a sound generator — especially a sampler — can cause audio artifacts and may trigger the audio engine to reset or reload sample data. MIDI Muter avoids this entirely because the audio engine stays active; it simply receives no note-on events.

6. The MIDI Muter approach is only appropriate for real-time articulation switching. For non-real-time scenarios (e.g. loading a different sample set), using bypass or volume controls is acceptable.

## Articulation switching with UI buttons and radio groups [15:00]

1. To wire UI buttons to MIDI Muters for articulation switching, add two buttons to the interface panel. In the property editor, set **Radio Group** to `1` on both buttons — this enforces mutual exclusivity so only one can be active at a time. All buttons sharing the same articulation group must use the same radio group number.

2. Connect each button to its target MIDI Muter via the property editor:
   - Button 1: `Processor ID` = `MIDI Muter 2`, `Parameter ID` = `ignore button`
   - Button 2: `Processor ID` = `MIDI Muter 1`, `Parameter ID` = `ignore button`
   
   The logic is inverted by design: activating a button disables the *other* MIDI Muter, muting that sound generator and letting the selected one through.

3. Hardcoded (built-in) scripts are self-contained and not designed to interoperate. Chaining them (e.g., placing a Transposer before or after an Arpeggiator) will not produce combined behaviour — each script operates independently of the other's output. When you need scripts to work together (e.g., a transposing arpeggiator), you must write custom HiseScript.

## Limitations of built-in factory scripts and moving to custom scripting [17:30]

1. Built-in (hardcoded) HISE scripts — such as the Arpeggiator and Transposer — cannot be modified. They are self-contained and not designed to interoperate. Chaining them in the MIDI processor slot does not make them work together (e.g., a Transposer placed before or after an Arpeggiator will have no effect on the arpeggiated output). When combined functionality is needed, you have reached the limit of factory scripts and must move to custom scripting.

2. Three paths forward when built-in scripts are insufficient:

   a. **Hire a scriptor**: Reliable but potentially expensive and subject to booking delays. Suitable for non-trivial, production-critical scripts.

   b. **Adapt a community script**: The HISE forum contains many posted script examples. Search for your use case. Community scripts are usually tailored to the author's situation, but small parameter tweaks (changing a number or a string) are often enough to adapt them. The original author may still be an active forum member and able to assist with adjustments.

   c. **Write your own script**: Gives the most control and deepest understanding of your project. Relying entirely on externally-written scripts you do not understand means you are not fully in control of your instrument's behaviour.
