---
title: "Auto trimming samples in HISE"
summary: "Complete workflow for auto-trimming sample start and end positions in HISE, covering raw sample preparation, multi-mic/multi-dynamic mapping, the Trim Sample Start tool settings, and manual review."
channel: "David Healey"
videoId: "DwJUmvKSHr4"
url: "https://youtube.com/watch?v=DwJUmvKSHr4"
publishDate: "2021-11-20"
views: 0
likes: 0
duration: 853
domain: "audio"
---

# Auto trimming samples in HISE — David Healey

## Introduction

This recipe covers the complete workflow for auto-trimming sample start and end positions: preparing rough-cut samples, mapping multi-mic/multi-dynamic sets, using the Trim Sample Start tool, and reviewing results.

## Raw sample preparation [00:16]

Rough-cut samples intentionally have extra audio before the true attack — this allows start-position adjustment inside the sampler. The gap between the file start and actual note onset is normal and expected.

## Mapping multi-mic and multi-dynamic samples [02:36]

1. Add a Sampler. Drag all files in at once (e.g. 378 files = 3 dynamics x 3 mic positions).
2. In the File Name Token Parser: map the MIDI note number token (Data Type: Number), map the dynamic token to RR Group (Data Type: Custom — HISE auto-detects values).
3. Select all samples and use **Merge to Multi-Mic** to combine mic positions.
4. Toggle Purge off and on to force a reload.

## Auto-trimming sample start and end positions [06:32]

1. Select all samples (Ctrl+A).
2. Right-click > Tools > "Trim Sample Start" (also trims the end).
3. Settings:
   - **Max Offset**: limit search area to the sample beginning.
   - **Snap to Zero Crossing**: keep enabled for clean edits.
   - **Mic Position to Analyze**: select the Close mic (captures attack earliest).
   - **Start Threshold**: -40 dB (default is typically fine).
   - **End Threshold**: leave at default.
4. Click OK.

## Reviewing and touching up trimmed samples [08:43]

1. Switch to Wave Editor view. Use "Display Group" to isolate one dynamic layer at a time.
2. Go through samples visually — zoom in to verify start markers are at the note onset.
3. For incorrectly placed markers (e.g. breath noise before the note), adjust manually.
4. Once reviewed, save the sample map: right-click > Save Sample Map.
