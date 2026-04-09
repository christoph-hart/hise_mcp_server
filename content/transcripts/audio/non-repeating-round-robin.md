---
title: "How to create a non repeating round robin sequence in HISE"
summary: "Implements non-repeating round robin using modulo arithmetic to exclude the last-played index, guaranteeing no consecutive repeats without loops."
channel: "David Healey"
videoId: "8NtZJonqXLo"
url: "https://youtube.com/watch?v=8NtZJonqXLo"
publishDate: "2022-03-26"
views: 0
likes: 0
duration: 304
domain: "audio"
---

# How to create a non repeating round robin sequence in HISE — David Healey

## Introduction

This recipe implements non-repeating round robin using modulo arithmetic (originally from Orange Tree Samples / Greg Schlaepfer). It guarantees no consecutive repeats without any loops.

## Non-repeating round robin — setup [00:00]

Maintain two counters: one that increments each note-on, and one that stores the previous value.

```javascript
const var NUM_RR = 4; // number of round robin layers
reg counter = 0;
reg lastCount = 0;
```

## Non-repeating round robin — note-on logic [02:30]

Generate a candidate RR index using a random number whose range excludes the last-played index via modulo arithmetic.

```javascript
function onNoteOn()
{
    // Random in [2 .. NUM_RR], choosing from NUM_RR-1 candidates
    local rnd = Engine.getRandomNumber(2, NUM_RR + 1);

    // Shift away from lastCount using modulo — guaranteed != lastCount
    counter = (lastCount - 1 + rnd) % NUM_RR;

    // Use (counter + 1) as velocity to select the RR layer
    Message.setVelocity((counter + 1) * (127 / NUM_RR));

    lastCount = counter;
}
```

- Guarantees the same layer never plays twice in a row.
- Does NOT guarantee every layer plays before any repeats.
- RR layers are separated by velocity ranges — map each layer to an equal velocity band.
- For per-note tracking, use a 128-element array indexed by `Message.getNoteNumber()`.
