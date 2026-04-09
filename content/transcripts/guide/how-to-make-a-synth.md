---
title: "How to make a synth"
summary: "A beginner tutorial that walks through building a complete synthesizer in HISE without any scripting, covering module setup (waveform generator, AHDSR envelope, LFO, send effects), interface design with knobs and floating tiles, preset browser integration, macro controls for multi-parameter linking, and exporting as a standalone application."
channel: "David Healey"
videoId: "2C4psWqleRs"
url: "https://youtube.com/watch?v=2C4psWqleRs"
publishDate: "2022-06-04"
views: 9373
likes: 296
duration: 2205
domain: "guide"
---

# How to make a synth — David Healey

## Introduction

This recipe covers building a simple synthesizer in HISE from scratch using only stock components and no scripting. You will set up a waveform generator with an AHDSR envelope and LFO, wire up send effects for reverb, build a full user interface with knobs and floating tiles, add a preset browser, use the macro system to link one knob to multiple parameters, and export the project as a standalone application.

## Setting up the module tree [00:20]

1. Add a Container module to the synth. Containers are organizational tools but also support multi-channel routing.

2. Inside the Container, add a Waveform Generator. This is the primary sound source and allows mixing two waveforms via a Mix knob.

3. Configure the Waveform Generator: set the left oscillator to Saw, the right oscillator to Sine, and shift the Sine up one octave using the octave knob.

4. In the Waveform Generator's Gain Modulation section, remove the default envelope that HISE adds automatically, then add an AHDSR envelope (Envelopes > AHDSR) in its place.

5. In the Waveform Generator's Pitch Modulation section, add an LFO (Time Variant > LFO Modulator). Set it to unipolar mode (double-arrow button) and set the maximum pitch offset to 1 semitone.

6. In the LFO's Intensity section, add a Time Variant MIDI Controller sub-modulator. This maps a CC to the LFO intensity amount. Set the CC number to an unused value (e.g. 94) rather than CC1 (mod wheel). Rationale: this reserves the intensity control for a dedicated UI knob; the user can optionally map that knob to the mod wheel themselves, rather than having the mod wheel directly drive the LFO.

7. After the Waveform Generator in the Container, add a Send Container. Placement order matters — the Send Container must appear after the module(s) that will send to it.

8. Inside the Send Container, add a reverb effect (e.g. Simple Reverb).

9. In the Waveform Generator's Effects section, add a Send Effect. Point it to the Send Container (channel 0 = first effect in the container). The Gain parameter on the Send Effect acts as the send level. Rationale: if you need more than eight effects in a single Send Container, add additional Send Containers.

## Building the UI with knobs, buttons, and floating tiles [07:05]

1. To add an AHDSR envelope display, right-click in the interface designer, add a Floating Tile, and set the Content Type to "AHDSR Graph". In the Data properties, set `processor id` to the exact name of your AHDSR envelope module (copy it from the module tree). This links the graph display to the live envelope shape.

2. Add sliders (which function as knobs by default) for Attack, Decay, Sustain, and Release. Name them with the prefix `knb` — e.g. `knb_Attack`, `knb_Decay`, `knb_Sustain`, `knb_Release`. The naming convention matters: when you see `knb_Attack` in a script, you immediately know it is a knob controlling attack, not a button or dropdown.

3. Set the mode for Attack, Decay, and Release knobs to **Time**. Set the Sustain knob mode to **Decibels**, since sustain is a level, not a duration.

4. To connect all four knobs to the envelope in one step: select all four knobs in the component list (click first, shift-click last), then set the Processor ID dropdown to your AHDSR envelope. Then select each knob individually and assign its specific Parameter ID (Attack, Decay, Sustain, Release respectively).

5. Set sensible default values to match the envelope's internal defaults: Attack = 20 ms, Decay = 300 ms, Sustain = 0 dB (or -1 dB if preferred), Release = 500 ms. Double-clicking a knob resets it to its default value.

6. Name the AHDSR graph floating tile `flt_AHDSR` (prefix `flt` = floating tile). Apply consistent prefixes across all components: `knb` for knobs, `btn` for buttons, `flt` for floating tiles.

7. Add an on-screen keyboard by adding a Floating Tile and setting Content Type to **Keyboard**. Set position X to 0, Y to the bottom of the interface, and width to full interface width. In the Data properties, set `lowest key` to 24 to control which key appears at the left edge of the keyboard.

8. Components can accidentally be nested inside other components (e.g. a knob dropped inside the keyboard tile). Check the component list hierarchy and drag misplaced components to the correct level if this happens.

9. Add a mix knob (`knb_Mix`). Set its mode to **Normalized Percentage**: the internal value is 0-1, but the display shows 0-100%. Set Processor ID to Waveform Generator, Parameter ID to Mix. Set default value to 50.

10. Add an LFO amount knob (`knb_LFO`). Set mode to **Linear**, minimum 0, maximum 127, step size 1, default 64. Set Processor ID to your MIDI Controller module, Parameter ID to Default Value. This controls the LFO intensity from the UI rather than from a hardware CC.

11. Add a button (`btn_LFO`) to toggle the LFO. Set Processor ID to the LFO Modulator, Parameter ID to **Enable**. When the button is on, the LFO is active; when off, it is disabled. To invert this behavior, use the Bypass parameter instead of Enable.

12. Add a reverb send knob (`knb_Reverb`). Set mode to **Decibels**, default value to -6 dB. Set Processor ID to the Send Effect, Parameter ID to Gain.

13. After connecting controls, open the script editor and hit **Compile** to refresh the interface and confirm all parameter links are active.

## Adding a preset browser and pitch wheel modulator [22:37]

1. Right-click the interface, add a Floating Tile, set its content type to "Preset Browser", and name it `flt_preset_browser`.

2. To remove the notes bar from the preset browser, select the floating tile, set the `showNotes` property to `false`, and hit Apply.

3. Any control you want saved when a user saves a preset must have "Save in Preset" enabled. A green star in the component list indicates the control will be saved. Disable this per-control if you do not want it included in presets.

4. To create a preset: add a Bank, then within the bank add a Category, then within the category click Add to create a preset. Clicking a preset loads all saved control states.

5. To prevent users from MIDI-learning a knob, select the knob, scroll to the bottom of its properties, and disable `enableMIDILearn`.

6. To add pitch wheel support, go to the Pitch Modulation section of the synth, add a Pitch Wheel Modulator (under Time Variant). You can edit the response curve via the table editor (right-click to add/drag points) and set the range in semitones.

7. When deciding where to place an effect (e.g. a delay): if you want it applied to all sound generators inside a container, add it at the container level. If it should only affect one sound generator, add it directly inside that generator's effects chain. Since this synth has only one Waveform Generator, the delay goes inside the Waveform Generator's effects tree.

## Using macro controls to link one knob to multiple parameters [29:02]

1. Disable tempo sync on the delay so it operates in milliseconds, giving independent left/right channel delay time knobs.

2. Add a Slider to the UI. Set its text to "Delay", range 0-127, step size 1, middle position 64, default value 64. The 0-127 range is required when using the macro system without scripting — the macro bus always operates on this range.

3. Do NOT use the Processor ID routing for this knob. That approach only allows targeting a single parameter at a time, so it cannot drive both left and right delay times simultaneously.

4. Instead, use the Macro Control system. On the knob's properties, set Macro Control to "Macro 1". This connects the knob's 0-127 output to the Macro 1 bus.

5. Open the Macro Controls panel (the button at the top of the module chain). Click the edit button next to Macro 1. Select both "Left Delay Time" and "Right Delay Time" — each will show a green "1" indicator confirming the assignment. Exit edit mode.

6. The single UI knob now drives both delay time parameters in lockstep. Note: this approach does not display the actual millisecond value on the UI knob; it only shows 0-127. Use scripting if you need to display the true time range.

## Exporting as a standalone application [32:25]

1. Before exporting as standalone (not a plugin), add a MIDI Sources floating tile to the UI so the user can select their MIDI input device at runtime. Without this, there is no way to route a MIDI controller since there is no DAW to forward it. Right-click the interface, add a Floating Tile, set content type to "MIDI Sources", and name it (e.g. `flt_MidiSources`).

2. Save the project, then go to Export > Export Standalone. Select the "Standalone" format and confirm.

3. On Linux, open a terminal, drag the generated build script onto it, and run it. On Windows/Mac, additional IDE steps are required.

4. The compiled app is located in `Builds/LinuxMakefile/Build/` (or the equivalent platform subfolder under `Builds/`).
