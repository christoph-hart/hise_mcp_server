---
title: "Simple Key switcher script"
summary: "A drop-in key switcher script for HISE samplers that switches between group-based articulations using configurable key switch notes, with automatic keyboard colouring."
channel: "David Healey"
videoId: "4RndEta641Q"
url: "https://youtube.com/watch?v=4RndEta641Q"
publishDate: "2022-04-02"
views: 0
likes: 0
duration: 137
domain: "audio"
---

# Simple Key switcher script — David Healey

## Introduction

A drop-in key switcher script for HISE samplers that uses group-based articulation switching with configurable key switch notes and automatic keyboard colouring.

## Simple key switcher using groups [00:00]

A public-domain key switcher script available on GitHub. Works with group-based articulations where each articulation/sample set is in its own sampler group.

**Setup requirements:**
- Insert the script at the **sampler level** (not in a container or master container).
- Samples must be organised into separate groups (one group per articulation).

**Two knobs to configure:**
1. **Number of groups** — set to match the total group count in your sampler (e.g. 6).
2. **First key switch note number** — the MIDI note number for the lowest key switch key (e.g. 24 = C1).

The script automatically colours the key switch keys on the keyboard and repositions them when knob values change. Press the assigned key switch keys to switch between groups.
