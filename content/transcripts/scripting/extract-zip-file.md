---
title: "How to extract a zip file in HISE"
summary: "Complete guide to extracting zip files in HISE using File.extractZipFile(), covering the extraction callback object properties, progress monitoring, cancellation, and error handling."
channel: "David Healey"
videoId: "gAYnIaR99jc"
url: "https://youtube.com/watch?v=gAYnIaR99jc"
publishDate: "2022-06-25"
views: 188
likes: 6
duration: 1416
domain: "scripting"
---

# How to extract a zip file in HISE — David Healey

## Introduction

This recipe covers the complete zip extraction workflow in HISE: calling `extractZipFile()`, handling the extraction callback with its status/progress properties, monitoring progress via a timer, and implementing cancellation with error handling.

## Setting up the unzip button and extractZipFile call [00:00]

Add a momentary Button to the UI with "Save in Preset" off. Call `extractZipFile()` with a destination folder, overwrite flag, and callback.

```javascript
const var downloads = FileSystem.getFolder(FileSystem.Downloads);
const var btnUnzip = Content.getComponent("btnUnzip");

inline function onBtnUnzipControl(component, value)
{
    if (value)
    {
        local f = downloads.getChildFile("test.zip");
        f.extractZipFile(downloads, true, extractionCallback);
    }
}

btnUnzip.setControlCallback(onBtnUnzipControl);
```

- First argument: destination directory (any folder — Downloads, AppData, user-selected)
- Second argument (`true`): allow overwriting existing files with the same name
- Third argument: a callback function (must be a regular `function`, not `inline function`)

## Allow overwriting of existing files [04:03]

The second argument to `extractZipFile()` controls whether existing files are overwritten. Set to `true` to allow overwriting, `false` to skip files that already exist at the destination.

## Extraction callback object properties [05:28]

The callback fires multiple times during extraction. The `obj` parameter has these properties:

| Property | Values / Notes |
|---|---|
| `obj.status` | `0` = preparing, `1` = extracting a file, `2` = operation complete |
| `obj.progress` | 0.0–1.0 (fraction of files extracted, not bytes) |
| `obj.totalBytesWritten` | bytes written so far |
| `obj.cancel` | boolean — set to `true` to halt extraction |
| `obj.target` | destination folder path |
| `obj.currentFile` | populated when `status == 1` |
| `obj.error` | populated on error |

Status `1` fires once per file at the start of each file's extraction. Status `2` fires once when the entire operation finishes.

```javascript
function extractionCallback(obj)
{
    if (obj.status == 1)
        Console.print("Extracting: " + obj.currentFile);

    if (obj.status == 2)
        Console.print("Extraction complete.");
}
```

## Progress monitoring [09:52]

The `progress` property represents the fraction of files extracted, not per-file byte progress. It increments in steps of `1 / totalFiles`. If a zip contains only one file, `progress` stays at `0` until completion.

Two ways to monitor progress:

**Option A — directly in the extraction callback** (fires once per file):

```javascript
Console.print(obj.progress);
```

**Option B — via a timer** (useful for animated UI indicators):

```javascript
const var progressTimer = Engine.createTimerObject();

progressTimer.setTimerCallback(function()
{
    Console.print(Engine.getPreloadProgress());
});

// Start when extraction begins:
progressTimer.startTimer(200);

// Stop when status == 2:
progressTimer.stopTimer();
```

The extraction runs on the sample loading thread, which is why `Engine.getPreloadProgress()` reflects zip progress.

## Cancelling the extraction process [11:39]

Set `obj.cancel = true` inside the callback to halt extraction after the current file finishes. Remaining files are skipped but `status` still reaches `2`.

```javascript
const var btnCancel = Content.getComponent("btnCancel");
reg cancel = false;

inline function onBtnCancelControl(component, value)
{
    if (value) cancel = true;
}

btnCancel.setControlCallback(onBtnCancelControl);
```

Inside the extraction callback, assign unconditionally and reset when starting:

```javascript
// When unzip button is pressed:
cancel = false;

// Inside extraction callback:
function extractionCallback(obj)
{
    obj.cancel = cancel;

    if (obj.status == 2)
    {
        if (obj.error != "")
        {
            Engine.showMessageBox("Error", obj.error, 1);
            cancel = true;
        }
    }
}
```

**Practical notes:**
- Keep individual zip files below 4 GB — files above ~4 GB can produce extraction errors.
- Prefer several smaller archives over one large one to reduce re-download pain on unreliable connections.
