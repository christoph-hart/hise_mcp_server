---
title: "Creating a custom preset save button"
summary: "How to add a dedicated save button to your HISE interface that overwrites the current user preset or prompts to create a new one, using UserPresetHandler, FileSystem.browse, and Engine.saveUserPreset."
channel: "David Healey"
videoId: "NMtOAhvK0Qo"
url: "https://youtube.com/watch?v=NMtOAhvK0Qo"
publishDate: "2024-07-13"
views: 1191
likes: 23
duration: 931
domain: "scripting"
---

# Creating a custom preset save button — David Healey

## Introduction

This recipe shows how to add a standalone save button to your HISE interface that lets users overwrite the currently loaded user preset with one click — without opening the preset browser. It covers tracking the loaded preset file with `UserPresetHandler.setPostCallback`, displaying the preset name on a label, implementing overwrite-or-create guard logic with `Engine.showYesNoWindow`, and using `FileSystem.browse` to create new presets.

## Custom Preset Save Button — Project Setup and Approach [00:00]

1. Add a save button to your interface (separate from the preset browser). This lets users overwrite the current preset with one click, without opening the preset browser. The preset browser can remain hidden by default and toggled via its own button.

2. The preset browser toggle button works by calling `FLT_PresetBrowser.showControl(value)` in its callback, where `value` is the button state (0 = hidden, 1 = visible). On init, set the button value to 0 and hide the preset browser. This requires the button's **saveInPreset** property to be disabled — otherwise its state gets stored per-preset and breaks the toggle logic.

3. `Engine.getCurrentUserPresetName()` returns only a string (the bare filename), not a file reference. To overwrite the file on disk you need the actual File object — so a different approach is required.

## Tracking the Current User Preset with UserPresetHandler [02:30]

`Engine.createUserPresetHandler()` returns a handler object that provides a post-load callback with the actual File reference — unlike `Engine.getCurrentUserPresetName()` which only returns a string.

```javascript
const var uph = Engine.createUserPresetHandler();
const var lblPreset = Content.getComponent("lblPreset");

// Will hold the File object of the currently loaded preset
reg currentPreset;

// Fires after the preset has fully loaded.
// presetFile is a ScriptFile object (or undefined for DAW state restore).
inline function onPresetPostLoad(presetFile)
{
    // Guard: presetFile is undefined during DAW session restore
    if (isDefined(presetFile))
    {
        currentPreset = presetFile;

        // Display preset name without .preset extension
        // File.toString() accepts integer constants: NoExtension (1), Filename (3), etc.
        lblPreset.set("text", presetFile.toString(presetFile.NoExtension));
    }
}

uph.setPostCallback(onPresetPostLoad);
```

## Wiring Up a Momentary Save Button with Guard Logic [05:00]

1. Reset the label text to empty in `onInit` so it clears on recompile rather than persisting the last-loaded name.

2. The save button must have **saveInPreset** disabled and **isMomentary** enabled. Momentary buttons fire the callback twice — once on press (value = 1) and once on release (value = 0). Guard against the release by checking `value == 1`.

3. Before saving, validate `currentPreset` with `isDefined()` and `.isFile()`. If either fails, route to the create-new-preset flow instead.

```javascript
const var btnSave = Content.getComponent("btnSave");
lblPreset.set("text", ""); // clear on init

inline function onBtnSaveControl(component, value)
{
    if (value) // only act on press, ignore release
        saveCurrentPreset();
}

btnSave.setControlCallback(onBtnSaveControl);
```

## Overwrite-or-Create Guard: Confirming Before Saving [07:30]

The save function has two branches: if a valid preset file exists, confirm before overwriting; otherwise delegate to `createPreset()`.

```javascript
inline function saveCurrentPreset()
{
    // No valid preset loaded — route to creation flow
    if (!isDefined(currentPreset) || !currentPreset.isFile())
    {
        createPreset();
        return;
    }

    // Confirm before overwriting
    Engine.showYesNoWindow("Confirm", "Do you want to overwrite the current preset?",
        function(response)
        {
            if (response)
                Engine.saveUserPreset(currentPreset);
        }
    );
}
```

Key points:
- `isDefined()` catches the case where the variable was never set; `.isFile()` catches stale or invalid values.
- `Engine.showYesNoWindow(title, message, callback)` — callback receives a boolean (`true` = yes).
- `Engine.saveUserPreset()` accepts a ScriptFile object and writes the current plugin state to it.

## Implementing the Create Preset Function with FileSystem.browse [10:00]

Use `FileSystem.browse()` to prompt the user to name and save a new preset file.

```javascript
inline function createPreset()
{
    // Open a save dialog in the user presets folder.
    // Parameters: startFolder, forSaving, wildcard, callback
    FileSystem.browse(
        FileSystem.UserPresets,  // SpecialLocations constant — resolves automatically
        true,                    // true = save dialog (user can type a new filename)
        "*.preset",              // restrict to HISE preset extension
        function(f)
        {
            currentPreset = f;
            Engine.saveUserPreset(f);
            lblPreset.set("text", f.toString(f.NoExtension));
        }
    );
}
```

Key points:
- Pass `FileSystem.UserPresets` (a SpecialLocations constant) directly as the start folder — do not pass a path string.
- Setting `forSaving` to `true` lets the user type a new filename rather than only picking existing files.
- The wildcard `"*.preset"` enforces HISE's expected extension.
- The callback is not invoked if the user cancels.

## Three-Column Preset Browser Folder Structure Requirement [12:30]

1. In compiled plugins, the user presets folder resolves to the app data folder automatically — no path configuration needed.

2. With a three-column preset browser layout, presets must be saved inside a bank and category subfolder (e.g. `UserPresets/Bank/Category/preset.preset`). A preset saved at the root of `UserPresets/` will not appear in the browser because it lacks bank/category assignment.

3. If your preset browser uses fewer columns, root-level presets may still appear. Consider validating folder depth before saving to prevent users from accidentally saving presets that are excluded from the browser UI.
