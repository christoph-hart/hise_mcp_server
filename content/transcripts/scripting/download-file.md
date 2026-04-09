---
title: "Downloading a file with HISE"
summary: "Complete guide to downloading files with the HISE Server API, covering Server.setBaseURL, Server.downloadFile, the download callback, progress monitoring, pause/resume, abort with confirmation dialog, and the Server Controller debugging tool."
channel: "David Healey"
videoId: "ZLmCceU7QSs"
url: "https://youtube.com/watch?v=ZLmCceU7QSs"
publishDate: "2022-07-23"
views: 0
likes: 0
duration: 1725
domain: "scripting"
---

# Downloading a file with HISE — David Healey

## Introduction

This recipe walks through the complete file download workflow in HISE: setting up the Server API, initiating downloads, monitoring progress via the download callback, implementing pause/resume and abort with a confirmation dialog, and using the Server Controller for debugging.

## Building the UI [00:31]

Add three buttons: Start (momentary), Pause (toggle), and Abort (momentary). Disable "Save in Preset" for all three.

```javascript
const var btnStart = Content.getComponent("btnStart");
const var btnPause = Content.getComponent("btnPause");
const var btnAbort = Content.getComponent("btnAbort");

btnPause.setValue(0);
btnPause.set("text", "Pause");
```

## Script-wide variables [02:25]

Declare the download URL, a target folder reference, and state flags at init scope.

```javascript
const var url = "https://forum.hise.audio/assets/uploads/system/site-logo.png";
const var downloadsFolder = FileSystem.getFolder(FileSystem.Downloads);

reg isPaused = false;
reg isAborted = false;
```

## Button callback skeletons [03:54]

Each callback delegates to a named function. The Pause toggle updates button text.

```javascript
inline function onBtnStart(component, value)
{
    if (value)
        startDownload();
}

inline function onBtnPause(component, value)
{
    if (value)
        pauseDownload();
    else
        resumeDownload();

    component.set("text", value == 0 ? "Pause" : "Resume");
}

inline function onBtnAbort(component, value)
{
    if (value)
        abortDownload();
}

btnStart.setControlCallback(onBtnStart);
btnPause.setControlCallback(onBtnPause);
btnAbort.setControlCallback(onBtnAbort);
```

## The download function — Server.setBaseURL and Server.downloadFile [07:29]

`Server.setBaseURL()` must be called before any server activity — it initialises the server subsystem. `Server.downloadFile()` takes a sub-URL (appended to the base), parameters object, target File, and callback.

```javascript
inline function startDownload()
{
    isPaused = false;
    isAborted = false;

    Server.setBaseURL("https:");

    local f = downloadsFolder.getChildFile("test.png");

    // Strip the base prefix from the full URL
    Server.downloadFile(url.replace("https:", ""), {}, f, downloadCallback);
}
```

## The download callback [12:25]

The callback takes 0 arguments. Access the Download object via `this`. Progress data lives in `this.data`.

Key fields on `this.data`:
- `finished` — true when the transfer ends (success or failure)
- `success` — true if the completed download succeeded
- `numTotal` — total file size in bytes
- `numDownloaded` — bytes downloaded so far

```javascript
function downloadCallback()
{
    if (this.data.finished)
    {
        if (this.data.success)
            Console.print("Download complete.");
        else
            Console.print("Download failed.");
    }
    else
    {
        local pct = this.data.numDownloaded / this.data.numTotal * 100.0;
        Console.print("Progress: " + Engine.doubleToString(pct, 1) + "%");
    }
}
```

## Server Controller window [14:39]

Open the Server Controller to monitor download calls and responses in real time. Add it via View > Add Floating Window > right-click > Server Controller, or save as a custom pop-up for quick access.

To clear finished downloads on each compile:

```javascript
Server.cleanFinishedDownloads();
```

## Testing the downloader [16:39]

Use a small file for initial testing, then switch to a larger file (~100 MB) for testing pause/abort. Store the URL prefix in a variable for easy switching:

```javascript
const var BASE_URL = "http://your.server.com";
```

## Pausing and resuming downloads [18:45]

Set a `pause` flag and call `this.stop()` inside the download callback. Save the download object to call `resume()` later.

```javascript
reg download = undefined;

inline function startDownload()
{
    isPaused = false;
    isAborted = false;
    download = Server.downloadFile(url.replace("https:", ""), {}, 
        downloadsFolder.getChildFile("test.png"), downloadCallback);
}

inline function pauseDownload()
{
    isPaused = true;
}

inline function resumeDownload()
{
    isPaused = false;
    download.resume();
}
```

Inside the download callback, check the flag:

```javascript
function downloadCallback()
{
    if (isPaused)
    {
        this.stop();
        return;
    }

    // ... handle progress and finished
}
```

Placing `this.stop()` inside the callback (rather than calling it directly) is safer when managing multiple simultaneous downloads.

## Aborting downloads [23:15]

Add an `aborted` flag. In the callback, check `aborted` first and call `this.abort()`.

```javascript
inline function abortDownload()
{
    isPaused = false;
    isAborted = true;
}

// Inside downloadCallback, before the finished block:
function downloadCallback()
{
    if (isAborted)
    {
        this.abort();
        return;
    }
    
    if (isPaused)
    {
        this.stop();
        return;
    }

    // ... handle progress
}
```

## Prompt to confirm abort [24:26]

Pause the download immediately so it stops consuming bandwidth while the user decides. Show a yes/no confirmation, then resume or abort based on the response.

```javascript
inline function abortDownload()
{
    pauseDownload();

    Engine.showYesNoWindow("Cancel Download",
        "Are you sure you want to cancel?",
        function(response)
        {
            if (response)
            {
                isAborted = true;
                download.abort();
            }
            else
            {
                resumeDownload();
            }
        });
}
```

Key point: pause first, then show the dialog. Without the pre-pause, the download continues running while the user reads the prompt.
