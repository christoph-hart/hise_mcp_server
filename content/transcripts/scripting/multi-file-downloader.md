---
title: "Creating a multi-file downloader with HISE"
summary: "Shows how to download multiple files in parallel using Server.downloadFile() with an array of URLs, pause/abort controls, and configurable concurrent download limits."
channel: "David Healey"
videoId: "mqGsqJoBxiQ"
url: "https://youtube.com/watch?v=mqGsqJoBxiQ"
publishDate: "2022-08-27"
views: 0
likes: 0
duration: 593
domain: "scripting"
---

# Creating a multi-file downloader with HISE — David Healey

## Introduction

This recipe extends single-file downloading to handle multiple files in parallel. You'll store URLs in an array, loop to start downloads, and control concurrency with `setNumAllowedDownloads()`.

## Setting up multiple file URLs and the download array [00:00]

Store all download URLs in an array. The `downloads` array holds the download objects returned by `downloadFile()`.

```javascript
const var urls = [
    "https://example.com/files/20megabytes.zip",
    "https://example.com/files/50megabytes.zip",
    "https://example.com/files/100megabytes.zip"
];

const var downloads = [];
const var server = Engine.createServerHandler("https://example.com");
```

HISE deduplicates by URL — passing the same URL twice (even with a different destination filename) will not re-download it. Use `this.getProgress()` inside the download callback to read 0.0–1.0 progress.

## Starting, pausing, and aborting downloads with array loops [02:30]

Replace single-file download logic with array-based loops:

```javascript
inline function startDownload()
{
    downloads.clear();

    for (i = 0; i < urls.length; i++)
    {
        downloads[i] = server.downloadFile(
            urls[i],
            FileSystem.getFolder(FileSystem.Downloads).getChildFile("test" + i + ".zip"),
            downloadCallback
        );
    }
}

inline function pauseDownloads()
{
    for (x in downloads)
        x.pause();
}

inline function abortDownloads()
{
    for (x in downloads)
        x.abort();
}
```

The download callback does not need to change — `this` inside it always refers to the specific download object being reported on, regardless of how many downloads are active.

## Enabling parallel downloads with setNumAllowedDownloads [05:00]

By default, HISE queues downloads sequentially. To run multiple downloads simultaneously:

```javascript
server.setNumAllowedDownloads(3);
```

Keep this value reasonable (3–6). Too many parallel downloads can saturate bandwidth. Consider exposing this as a user-facing setting.

## Complete multi-file downloader pattern [07:30]

```javascript
const var urls = [
    "https://example.com/files/20megabytes.zip",
    "https://example.com/files/50megabytes.zip",
    "https://example.com/files/100megabytes.zip"
];

const var downloads = [];
const var server = Engine.createServerHandler("https://example.com");
server.setNumAllowedDownloads(3);

inline function downloadCallback()
{
    // 'this' = current download object
    Console.print("Progress: " + this.getProgress());
}

inline function startDownload()
{
    downloads.clear();

    for (i = 0; i < urls.length; i++)
    {
        downloads[i] = server.downloadFile(
            urls[i],
            FileSystem.getFolder(FileSystem.Downloads).getChildFile("test" + i + ".zip"),
            downloadCallback
        );
    }
}

inline function abortDownloads()
{
    for (x in downloads)
        x.abort();
}
```

- Unique destination filenames are required (same-name files overwrite each other).
- The download callback is shared across all downloads; use `this` to inspect the individual download.
