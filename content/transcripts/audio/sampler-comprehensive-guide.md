---
title: "Everything I Wish I Knew About the HISE Sampler When I Started"
summary: "Comprehensive guide to the HISE Sampler covering sample map creation, file naming conventions, the token parser, monolith compression, multi-mic workflows, velocity crossfading, round-robin groups, loop editing, per-sample envelopes, and the scripted sample editor."
channel: "David Healey"
videoId: "dXFjnpehQPA"
url: "https://youtube.com/watch?v=dXFjnpehQPA"
publishDate: "2022-07-16"
views: 0
likes: 0
duration: 3670
domain: "audio"
---

# Everything I Wish I Knew About the HISE Sampler When I Started — David Healey

## Introduction

This comprehensive recipe covers the entire HISE Sampler workflow from start to finish. You'll learn how to open the sampler workspace, create sample maps with the file name token parser, compress to HLAC monoliths, set up multi-mic samples, configure velocity crossfading and round-robin groups, use the loop editor with auto-looping, and apply per-sample envelopes for gain, pitch, and filter shaping.

## Opening the Sampler Workspace [00:00]

Two ways to open the sampler workspace:

1. **Via the View menu:** `View > Sampler Workspace`. Close the scripting window to use the full space.
2. **Via a specific Sampler module (preferred):** Click the dedicated button on any loaded Sampler module. This opens the workspace scoped to that particular sampler.

Clicking a Sampler module in the module chain reveals a compact inline version with a Sample Editor tab — useful for quick edits and swapping sample maps without switching workspaces.

## How to create a sample map [01:45]

A sample map is an external XML file storing mapping information separately from the sampler instrument. You can edit it in any text editor and reuse it across projects.

**Step 1: Place samples in the correct folder**

Always put samples inside `<ProjectFolder>/Samples/`. Never use the `AudioFiles` folder or any path outside the project. HISE embeds a `{PROJECT_FOLDER}` wildcard in sample map paths — samples outside the project folder break this.

**Step 2: Name sample files with underscore-separated tokens**

Each piece of mapping information becomes a token. Example:

```
IrishFlute_Staccato_62_Dyn2_RR1.wav
```

| Token | Content | Notes |
|---|---|---|
| 1 | Instrument name | informational only |
| 2 | Articulation | informational only |
| 3 | MIDI note number | use numbers, not note names |
| 4 | Dynamic layer | e.g. `Dyn1`, `Dyn2` |
| 5 | Round robin index | e.g. `RR1`, `RR2` |

**Why MIDI numbers over note names:** Middle C is MIDI 60 always; note-name middle C varies between `C3` and `C4` across DAWs. MIDI numbers are also easier to manipulate in script.

**Step 3: Import samples**

Three ways: drag from the HISE Project Directory panel, drag from the OS file browser, or right-click the mapping grid and choose "Import Samples".

**Step 4: Configure the File Name Token Parser**

Select **File Name Token Parser** in the import dialog. The parser detects the underscore separator automatically. Configure each token:

| Token | Setting | Data Type |
|---|---|---|
| Instrument name | Ignore | — |
| Articulation | Ignore | — |
| MIDI note number | Single Key | Number |
| Dynamic layer | Velocity Spread | Custom (`Dyn1`, `Dyn2` → values 1, 2) |
| Round robin index | Round Robin Group | Custom (`RR1`, `RR2` → values 1, 2) |

**Custom data type** extracts numeric values from strings like `Dyn2` or `RR3` automatically.

**Step 5: Save the sample map**

Click the floppy-disk icon. It saves as `<ProjectFolder>/SampleMaps/<name>.xml`.

**Bulk edits:** For large-scale changes (remove all RR group 4 samples, shift root notes), edit the XML directly with find-and-replace — often faster than the UI.

**Mapping grid axes are not fixed:** X-axis (MIDI note) and Y-axis (velocity) are arbitrary organisers. You can use velocity layers for articulations rather than dynamics. Think of the grid as a 2D lookup table.

## How to clear the sample map [15:42]

Three ways to create a new blank sample map: click "New Sample Map" button, press Ctrl+N, or right-click the mapping grid and choose "New Sample Map". Previously saved maps remain accessible for reloading.

## SFZ import [16:18]

The second toolbar button imports mapping data from an SFZ file. This imports note/velocity mapping layout only — op codes, modulators, and group/control data are ignored. Samples appear pink/purple if HISE cannot locate the audio files; ensure files are in the project's Samples folder.

## Compressing samples to a HLAC monolith [17:40]

HLAC (based on FLAC) is HISE's native lossless format. Compressing to a monolith is required for distribution.

1. Click "Encode to Monolith" (fourth toolbar button).
2. Choose bit depth: "Full Dynamics" = 24-bit; default = 16-bit.
3. Set split size (e.g. 2000 MB) for large sample sets.
4. Click OK. HISE compresses and reloads automatically.

Output files use `.ch1` extension (`.ch2`, `.ch3` for additional mic positions). The sample map XML is updated with `MonolithOffset`, `SampleRate`, `SampleEnd`, and `SaveMode` fields. `SaveMode = 2` means monolith; `SaveMode = 0` means original WAV files.

**Reverting to WAV:** Open the sample map XML, change `SaveMode` from `2` to `0`, save, and restart HISE. The `.ch1` file remains on disk for re-activation.

## Sample mapping toolbar buttons [20:52]

- **Horizontal zoom**: Zooms the mapping editor horizontally.
- **Undo/Redo**: Toolbar buttons or Ctrl+Z / Ctrl+Y.
- **Select All / Deselect All**: Ctrl+A or toolbar; Escape to deselect.
- **Sample playback**: Click to trigger; click stop for sustained samples.
- **Fill Note Gaps**: Select all samples, then click to extend each sample's note range to eliminate gaps on the X-axis.
- **Fill Velocity Gaps**: Same for the Y-axis. Both also available via right-click > Tools.

## Velocity crossfading [23:07]

1. Overlap two velocity layers (e.g. low layer ends at 84, high layer starts at 64 — 20-unit overlap).
2. Click the crossfade toggle button; column headers change to "Low Velocity Crossfade / Upper Velocity Crossfade".
3. Select the lower layer and enter the crossfade width in Upper Velocity Crossfade. Select the upper layer and enter the same value in Low Velocity Crossfade.
4. To remove crossfades: select samples and reset crossfade values to 0, or use Undo.

## Round-robin groups [24:36]

- Group buttons (numbered circles) filter the mapping editor to show only that group's samples.
- Shift+click extends a contiguous group selection; Ctrl+click toggles individual groups.
- The filled inner circle indicates the currently active playback group.
- The round-robin counter (e.g. "1 of 4") shows the current group and total count. Click it to change the total.
- For high group counts (50+), right-click the group display area to select by number.
- **Lock button**: Locks playback to the current group for auditioning — useful during development, not for production.

## How to lock to a velocity level [27:55]

Right-click in the sampler mapping area and select "Lock velocity of [value]" to pin playback to a specific velocity. The value corresponds to the cursor position when you right-click. A lock icon appears on the velocity range. Disable via right-click > "Unlock velocity". Useful for isolating a single velocity layer during development.

## Adjusting zone properties [29:11]

Select samples in the mapping window to edit zone properties:

- **Round robin group**: Change assignment and press Enter.
- **Root note**: Use +/- buttons to shift; with multiple samples selected, all shift relative to each other.
- **Low key / High key**: Drag samples directly in the mapping view, or right-click any input box for a slider.
- **Low velocity / High velocity**: Adjust range directly or via slider.

## The sampler table [31:16]

The table view lists all samples in load order — recently imported samples appear at the bottom. Selection is synced bidirectionally with the mapping window.

**Search/filter:**
- Type a string and press Enter to select matching samples.
- Use `sub:` prefix to deselect matching samples from the current selection (e.g. `sub:81`).
- A dot (`.`) or blank + Enter selects all samples.
- Supports regex-style syntax; click the help button for a cheat sheet.

## Working with multi-mic samples [33:24]

Groups in HISE are not limited to round-robin — use them for dynamic layers, articulations, or any dimension controlled via script.

**Mapping multi-mic samples:**

1. Map samples using the filename tokenizer as usual. Ignore the mic-position token at this stage.
2. Select all samples, right-click > **Tools > Merge into Multi-Mic Samples**.
3. In the dialog: set the separator (underscore), select the mic-position token, set detection mode to **Mapping and File Name**.
4. HISE reports detected channel count. Click OK.

**Naming requirements:** All mic positions must use consistent token order. Sample lengths must be exactly equal across mic positions.

After merging, each sample appears as one item but references one file per mic position. Purge Channel settings let you load/unload each mic independently. The channel routing table shows one stereo pair per mic position.

## The sampler context menu [39:46]

- **Delete Duplicate Samples**: Removes accidentally duplicated samples.
- **Revert Sample Map**: Reverts to the last saved state.
- **Save As**: Save as XML or convert to monolith.
- **Tools > Auto Map Using Metadata**: Imports loop points embedded in audio files.

## Trim sample start (auto trimming) [41:21]

Open via Tools > "Trim Sample Start". Always do mic merge before trimming — close mics have the least delay.

Settings:
- **Offset**: How far into the sample to search for the audio start.
- **Snap to Zero**: Keep ON to avoid pops/clicks.
- **Start Threshold**: Typically -25 to -30 dB.
- **End Threshold**: Leave at -80 dB.
- **Position to Analyze**: Select the close mic channel (lowest latency).

Click OK. Review results and fine-tune manually if needed.

## Export as AIFF [44:20]

Right-click > "Export as AIFF with Metadata" to export samples with loop points baked into the audio files for archival or external use.

## Redirect monolith reference [44:45]

**Problem:** Two sample maps using the same audio files generate two separate `.ch1` monolith files, wasting disk space.

**Solution:** After converting both to monolith, right-click the second sample map > "Redirect Monolith Reference" and point to the first map's monolith. Both sample maps must reference the same audio files; sample start/end positions can differ.

## Adjusting sample properties [46:12]

Per-sample properties (Gain, Pan, Pitch offset, Sample Start, Sample End) are available via small boxes in the sampler UI. Right-click any box for a slider. Edits in monolith mode are not saved — switch to wave mode first.

## Sample start offset [47:08]

The Sample Start Mod section allows pre-loading audio before the true start point. Add a modulator (velocity, CC, or constant) via the + button. The green line in the waveform shows the current start position. Can also be controlled via scripting. Use case: vary attack transient character per note.

## Enabling looping [48:19]

For samples without embedded loop points: click the loop enable button, set Loop Start and Loop End, and apply crossfading to smooth the loop boundary.

## Zoom and minimap [48:50]

The sampler editor has zoom controls paired with a minimap overview for navigating large sample maps.

## Selecting samples using MIDI [49:03]

Activating MIDI selection mode (arrow-with-MIDI-icon button) lets you select samples by playing notes on a MIDI keyboard — useful for iterating note-by-note to adjust per-note properties. Cursor keys also navigate between samples.

## Auditioning samples [50:00]

Hold Ctrl (Cmd on Mac) and click anywhere on the waveform — playback starts from the click position and stops on mouse release. This is the preferred method over the dedicated audition button.

## Spectrogram [50:54]

A slider toggles between standard waveform and spectral (spectrogram) view. Useful for locating glitches, errors, and identifying where release tails end.

## Using an external audio editor [51:08]

The far-right button opens the selected sample in an external editor. Constraints: file paths with spaces break the open action; only works with raw WAV files, not monolith. Configure the editor path in HISE Preferences > "External Editor Path".

## Setting start and end points with the mouse [51:55]

Three mouse-mode buttons control which point you are placing:
- First button: left-click sets **sample start**, right-click sets **sample end**.
- Second button: sets **sample start offset** (zoom in with Ctrl+scroll for accuracy).
- Always keep **zero-crossing lock** active to prevent clicks/pops at boundaries.

## The loop editor — auto looping and crossfade shape [53:23]

**Setting loop points:** Left-click in loop mode = loop start; right-click = loop end. Zero-crossing lock applies.

**Loop finder (auto-improve):**
1. Click the loop finder button to open the loop editor panel.
2. Click "find" — HISE searches for a better loop match and shifts points automatically.
3. Audition the loop region with the playback button.
4. Click confirm to commit. All edits are non-destructive.

**Crossfade shape:**
- Crossfade length slider is per-sample.
- Crossfade curve slider is global (applies to all samples).
- Value ~1.0 = linear; ~0.5 = equal-power; negative values invert the curve.

## Normalization [56:28]

The normalization button normalizes the selected sample's gain non-destructively — it does not alter the audio file on disk.

## Scripted sample editor [56:40]

HISE lets you script a custom sample-map editor inside the Sampler:

1. Add a ScriptProcessor to the Sampler chain.
2. The "show script interface" button renders that ScriptProcessor's UI panel directly inside the sampler workspace.
3. The "trigger first button" shortcut (F9) fires the first button in the script — useful for one-click repetitive operations (e.g. copy loop points across all samples).

## Per-sample envelopes — gain, pitch, filter [58:09]

All three envelopes are accessed from the sample editor toolbar and operate per-sample.

**Volume envelope:** Click to add breakpoints, drag to shape; right-click a point to delete; right-click between points and drag to adjust curve tension. "Fade in/fade out" controls add automatic ramps; the gamma knob adjusts curve shape.

**Pitch envelope:** Draw a manual pitch curve over the sample's duration. The auto-tune button attempts to detect and flatten pitch drift automatically — treat as a starting point.

**Filter envelope:** Draws a per-sample filter cutoff curve (0–20 kHz range).
