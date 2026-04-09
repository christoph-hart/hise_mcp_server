---
title: "Using expansion packs in your HISE project"
summary: "Complete guide to HISE expansion packs covering enabling the feature, creating expansion folders, loading sample maps dynamically with {EXP::} prefixes, expansion-scoped presets, per-expansion key colours, and loading instrument data from JSON manifest files."
channel: "David Healey"
videoId: "VsQTOxOOd9s"
url: "https://youtube.com/watch?v=VsQTOxOOd9s"
publishDate: "2022-04-09"
views: 0
likes: 0
duration: 2566
domain: "architecture"
---

# Using expansion packs in your HISE project — David Healey

## Introduction

Expansions deliver additional content to end-users beyond the preset browser: samples, sample maps, impulse responses, images, scripts, and user presets. Each expansion acts as a self-contained instrument or add-on pack. There is no built-in installer — you must build your own.

## Enable expansions [02:28]

HISE must be rebuilt with two feature flags:

1. In the Projucer project, go to **HISE_core** module settings, set `HISE_ENABLE_EXPANSIONS` to **Enabled**.
2. In the exporter settings, add to Extra Preprocessor Definitions:
   ```
   HISE_ENABLE_EXPANSIONS=1
   HISE_ENABLE_EXPANSION_EDITING=1
   ```
3. Rebuild HISE. Expansion API calls are now available.

## Create expansions [03:35]

Each expansion lives in `<ProjectRoot>/Expansions/<ExpansionName>/` and mirrors a mini HISE project structure.

Required subfolders: `Samples/`, `SampleMaps/`, `MidiFiles/`, `Images/`, `AudioFiles/`, `AdditionalSourceCode/`, `UserPresets/`.

Required metadata file — `expansion_info.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExpansionInfo Name="Flute"
               ProjectName="ExpansionDemo"
               Version="1.0.0"/>
```

`Name` must match the folder name. Alternatively, use the HISE GUI: Sampler workspace > Expansions section > "Create New Expansion" to auto-generate the structure.

## Add expansion samples [08:07]

Place samples into each expansion's `Samples/` subfolder via the OS file system.

## Get expansion list [08:49]

```javascript
const var expansions = Engine.getExpansionList();
Console.print(expansions.length);
```

## Get expansion properties and names [09:36]

```javascript
const var expansionNames = [];

for (e in expansions)
{
    local p = e.getProperties();
    expansionNames.push(p.name);
}
```

## Populate a ComboBox with expansion names [12:43]

```javascript
const var cmbExpansions = Content.getComponent("cmbExpansions");
cmbExpansions.set("saveInPreset", false);
cmbExpansions.setItems(expansionNames.join("\n"));

inline function onCmbExpansionsControl(component, value)
{
    Engine.setCurrentExpansion(component.getItemText());
    loadSampleMap();
}

cmbExpansions.setControlCallback(onCmbExpansionsControl);
```

## Create and load sample maps dynamically [16:31]

Sample maps inside expansions use the `{EXP::ExpansionName}` prefix. Name map files consistently across expansions (e.g. `Sustained.xml`) so a single string can be built at runtime.

```javascript
const var sampler = Synth.getSampler("Sampler1");

inline function loadSampleMap()
{
    local expansionName = cmbExpansions.getItemText();
    local mapId = "{EXP::" + expansionName + "}Sustained";
    sampler.loadSampleMap(mapId);
}
```

## Expansion-scoped user presets [21:59]

HISE automatically scopes the preset browser to the active expansion's `UserPresets/` folder. When `Engine.setCurrentExpansion()` is called, the preset browser updates to show only that expansion's presets — no scripting required.

## Loading sample maps from presets [25:52]

Recommended architecture: expansion selection drives preset selection, and preset selection drives sample map loading (rather than loading sample maps directly from the expansion callback).

## Loading per-expansion key ranges from a JSON data file [28:45]

Store instrument-specific data in `AdditionalSourceCode/data.json` inside each expansion:

```json
{
  "range": [50, 90]
}
```

Load it at runtime:

```javascript
reg expansionData;

inline function onCmbExpansionsControl(component, value)
{
    local exp = expansions[value - 1];
    expansionData = exp.loadDataFile("data.json");
    loadSampleMap();
    setKeyColors();
}

inline function setKeyColors()
{
    for (i = 0; i < 128; i++)
    {
        if (i >= expansionData.range[0] && i <= expansionData.range[1])
            Engine.setKeyColour(i, Colours.withAlpha(Colours.antiquewhite, 0.2));
        else
            Engine.setKeyColour(i, Colours.withAlpha(Colours.black, 0.5));
    }
}
```

## Other expansion API methods [37:01]

| Method | Purpose |
|---|---|
| `exp.writeDataFile(path, obj)` | Persist data back to the expansion folder |
| `exp.getSampleMapList()` | Array of all sample map IDs in this expansion |
| `exp.getImageList()` | Array of image assets |
| `exp.getAudioFileList()` | Array of audio files / impulse responses |

## Architecture tips for expansion-based plugins [38:59]

- Use `data.json` as a manifest to drive the entire UI and keyboard state per expansion.
- Set unused samplers to empty sample maps and lower voice counts to save CPU.
- Disable/bypass unused effects and script processors.
- For simpler cases where users only add presets, the built-in preset browser may suffice without the full expansion system.
