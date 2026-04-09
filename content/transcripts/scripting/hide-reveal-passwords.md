---
title: "How to hide and reveal passwords in HISE | obscure passwords"
summary: "Shows how to toggle password masking on a Label component using the fontStyle property set to 'Password' or 'plain'."
channel: "David Healey"
videoId: "wwFF2Ld7Vmw"
url: "https://youtube.com/watch?v=wwFF2Ld7Vmw"
publishDate: "2022-07-02"
views: 0
likes: 0
duration: 159
domain: "scripting"
---

# How to hide and reveal passwords in HISE — David Healey

## Introduction

A quick recipe showing how to toggle password masking on a Label component using the `fontStyle` property.

## Obscure and reveal password text with fontStyle [00:00]

Use the `fontStyle` property of a Label component to toggle between readable text and masked (star) display. Add a momentary Button to toggle the state.

```javascript
const var lblPassword = Content.getComponent("lblPassword");

inline function onBtnRevealControl(component, value)
{
    if (value)
        lblPassword.set("fontStyle", "Password");
    else
        lblPassword.set("fontStyle", "plain");
}

Content.getComponent("btnReveal").setControlCallback(onBtnRevealControl);
```

- `"Password"` (capital P) masks the text as stars.
- `"plain"` (lowercase p) restores visible text.
