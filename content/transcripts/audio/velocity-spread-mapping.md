---
title: "HISE Velocity Spread Mapping"
summary: "Shows how to use the Velocity Spread option in the File Name Token Parser to quickly map multi-dynamic samples across the velocity range, with velocity crossfading setup."
channel: "David Healey"
videoId: "MXCgXfmtMUI"
url: "https://youtube.com/watch?v=MXCgXfmtMUI"
publishDate: "2021-11-27"
views: 0
likes: 0
duration: 278
domain: "audio"
---

# HISE Velocity Spread Mapping — David Healey

## Introduction

This recipe shows how to use the Velocity Spread option in the File Name Token Parser to quickly map multi-dynamic samples across the full velocity range, with crossfading between layers.

## Velocity spread mapping [00:00]

1. Select all samples in the sample map editor.
2. Open the File Name Token Parser.
3. For the dynamic token, set Property to **Velocity Spread** (spreads across the full velocity range).
4. Set Data Type to **Custom** — HISE auto-detects dynamic values from filenames.
5. Click OK. All samples are mapped to velocity layers automatically.

## Velocity crossfading [02:30]

1. Select all samples and click the Crossfade button.
2. Adjust upper boundaries of lower layers down by ~10 units to create overlap zones.
3. Set crossfade values: 5 on each side for gentle crossfades, 10 for wider transitions.
4. Right-click value edit boxes to reveal slider handles for easier adjustment.
