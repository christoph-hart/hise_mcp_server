---
title: "Getting started with Rhapsody development"
summary: "How to set up, build, and export a sample library instrument as a Rhapsody expansion using the HISE template project."
channel: "David Healey"
videoId: "x4b8WlStG40"
url: "https://youtube.com/watch?v=x4b8WlStG40"
publishDate: "2023-07-30"
views: 0
likes: 0
duration: 940
domain: "guide"
---

# Getting started with Rhapsody development — David Healey

## Introduction

This recipe walks through creating a sample library instrument that runs inside Rhapsody, David Healey's open-source sample library player built with HISE. It covers project setup from the template, understanding the module tree and interface layout, and exporting the finished instrument as an installable expansion.

## Project Setup, Boilerplate, Module Tree, and Interface [01:48]

**Project creation:**
1. In HISE, go to **File > Create New Project**, create a new folder, and click OK.
2. Select **Use the Rhapsody Template**. HISE downloads and extracts the template files.
3. Place sample files in the project's `Samples` folder.

**Template scripts (do not modify):**
The template includes pre-built scripts: `UI`, `LookAndFeel`, `Paths`, `Expansions`, `Header`, `Footer`, `Presets`, `UserSettings`, `Spinner`. Do not edit these directly — template updates will overwrite changes. Add your own scripts separately.

**Module tree:**
- **Interface Script** — main script
- **Master Gain** — linked to footer volume/pan controls
- **Global Modulation Container** — empty, reserved for global modulators
- **Container** — place your instrument modules (Samplers, synths, effects) here

Remove the placeholder Sine Wave Generator and add a **Sampler** inside the container.

**Interface layout:**

| Region | Purpose |
|---|---|
| Header Panel | Library name/branding button |
| Body Panel | Your instrument-specific UI components |
| Status Bar | Loading/status display |
| Footer | Volume, pan, keyboard, preset controls |

**Rhapsody "Home" button (required):** Every instrument must include a button that returns to the Rhapsody home screen. Its callback must call:

```javascript
expansionHandler.setCurrentExpansion("");
```

Passing an empty string unloads the current expansion and returns to home. The template Header script provides this by default.

**Included out-of-the-box:** Preset browser with previous/next/save, settings window, sample-loading spinner, lazy-load, volume and pan controls.

## Samples, Icon, Encryption, Export and Installation [09:06]

**Icon image:** Place a square PNG named exactly `icon.png` in the project's `Images` folder (500x500 px minimum). This appears as the instrument tile in Rhapsody.

**Encryption key:** In Project Settings, set the **Expansion Encryption Key** to `1234`. This is the key Rhapsody expects — expansions with any other key will not open.

**Export the expansion:**
1. Compress sample maps to `.ch` files first (click compress in the Sampler panel).
2. **File > Export > Export Project as Rhapsody Player Library** — produces an `.lwz` file.
3. **File > Export > Export Samples as Archive** (LWZ format) — produces `*_samples.lwz` files.

`.lwz` (LibraWave Zip) files are standard ZIP archives with a renamed extension. The custom extension prevents browsers from auto-extracting downloads.

**Distribution:** Ship both the expansion `.lwz` and the samples `.lwz`. Both must reside in the same folder.

**Installation (end-user):** Open Rhapsody > click **+** > **Manual Install** > browse to the folder containing both `.lwz` files > select either one > choose a sample destination > OK.
