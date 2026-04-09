---
title: "How to display a message to the user in HISE"
summary: "Shows how to use Engine.showMessageBox() to display modal popup messages with markdown support and configurable icon types."
channel: "David Healey"
videoId: "YSh5HH0dUmE"
url: "https://youtube.com/watch?v=YSh5HH0dUmE"
publishDate: "2022-08-13"
views: 0
likes: 0
duration: 107
domain: "scripting"
---

# How to display a message to the user in HISE — David Healey

## Introduction

A quick recipe showing how to display modal popup messages to the user using `Engine.showMessageBox()`, with markdown support and configurable icon types.

## Show message box with Engine.showMessageBox() [00:00]

Use `Engine.showMessageBox()` to display a modal popup. It takes a title string, a body string (supports HISE Markdown), and an integer for the icon type.

```javascript
// Two trailing spaces in markdown create a line break
Engine.showMessageBox("My Title", "This is some text  \nThis is another line", 0);
```

## Message box icon types [00:54]

The third argument selects the icon:

| Value | Icon |
|-------|------|
| 0 | Info |
| 1 | Warning |
| 2 | Question mark |
| 3 | Error |

All icons can be customised via Look and Feel.
