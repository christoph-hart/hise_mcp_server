---
title: "Exporting and extracting monoliths as hr archive."
summary: "How to recreate sample monoliths, clean the build folder, export a standalone with .hr archive samples, and verify correct sample loading via link files."
channel: "David Healey"
videoId: "4t_-7PEi-B8"
url: "https://youtube.com/watch?v=4t_-7PEi-B8"
publishDate: "2024-10-12"
views: 579
likes: 11
duration: 500
domain: "guide"
---

# Exporting and extracting monoliths as hr archive — David Healey

## Introduction

This recipe walks through the full workflow of recreating sample monoliths, preparing a HISE project for standalone export, and packaging samples as an `.hr` archive (`.ahr` file). You'll learn how to diagnose missing sample errors, clean the build directory, export the archive, and verify that the link file correctly resolves samples at runtime.

## Recreating sample monoliths and diagnosing missing sample errors [00:00]

1. Before recreating monoliths, set `saveModeMonolith` back to 0 in all sample map files. Use a global find-and-replace across the project folder to change `saveMode` values to `0` before reloading HISE — this prevents HISE from expecting monolith files that no longer exist.

2. To recreate all monoliths: right-click in the Sampler module, go to **Tools > Re-encode all Sample Maps as monoliths**, leave default settings, and confirm. HISE will encode every sample map into `.hr1` monolith files.

3. If HISE reports missing files during encoding, identify which sample maps reference non-existent sample folders. Cross-reference the sample map `.xml` files against the actual folder structure in your project's `Samples` directory. Remove or fix any sample map entries pointing to missing folders before re-encoding.

## Pre-export checklist: cleaning build folder and verifying project settings [02:30]

1. Before exporting a standalone, go to **Export > Clean Build Directory** to ensure no stale build artifacts remain.

2. Open **Project Settings** and uncheck any effect or feature flags your project does not use (e.g. Loris, unused effect types). Leaving unused options checked increases compile time and binary size unnecessarily.

3. Check any images included in the project — large images (e.g. ~80 MB) will bloat the exported binary but will not prevent compilation.

4. Missing samples in a sample map will prevent that specific patch from loading but will not block the overall export or compilation of the standalone.

5. Once settings are verified and the build folder is clean, proceed with **Export > Export Project as Standalone**.

## Exporting samples as .hr archive and verifying with link file [05:00]

1. Compile the plugin (standalone export is sufficient for testing sample loading). A large embedded image (~80 MB) may slow compilation but will not block it.

2. During or after compile, export samples as the HR archive format (`.ahr` file). This produces the binary monolith archive that end users install.

3. In the built plugin, use "Install Samples": point it at the `.ahr` file, choose a destination folder (e.g. a temporary folder on the Desktop for testing), and confirm. The plugin extracts all sample files to that location and then prompts for a relaunch.

4. After extraction, verify the link file was written correctly. The link file lives inside a folder named after your company name (as set in HISE project settings) in the OS user data directory. Open it and confirm it points to the folder you selected as the extraction destination. If the path is wrong, samples will not load.

5. On relaunch, confirm sample loading works by checking RAM usage — it should start at zero and increase only when a patch/sample is actually loaded, confirming the samples are streaming from the correct location. A missing-samples warning for one sample map is non-fatal; the rest of the monolith will still load.
