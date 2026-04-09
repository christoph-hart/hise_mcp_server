---
title: "How to create 1000 sample maps in less than a second"
summary: "Demonstrates batch-generating sample map XML files from a template with placeholder tokens, using HiseScript's File API for string replacement and file writing."
channel: "David Healey"
videoId: "88FUuwr1n3g"
url: "https://youtube.com/watch?v=88FUuwr1n3g"
publishDate: "2022-09-10"
views: 0
likes: 0
duration: 452
domain: "scripting"
---

# How to create 1000 sample maps in less than a second — David Healey

## Introduction

This recipe shows how to batch-generate hundreds or thousands of sample map XML files from a single hand-crafted template. It uses `%`-delimited placeholder tokens for string replacement — useful when each sample map has the same structure but different file references, such as individual one-shot sample maps for a drum library.

## Setting up the template XML [00:44]

Create a template XML file representing one sample map. Use `%`-delimited tokens as placeholders — the `%` character never appears in real file names, making tokens unambiguous.

```xml
<samplemap ID="%SampleMapID%">
    <sample RootNote="60" LoKey="60" HiKey="60" LoVel="0" HiVel="127"
            FileName="{PROJECT_FOLDER}Samples/%SampleName%.wav"/>
</samplemap>
```

- `%SampleMapID%` — replaced with the sample map's name
- `%SampleName%` — replaced with the sample file's base name
- `{PROJECT_FOLDER}` is the HISE project-folder token; add a subfolder if samples are in a subdirectory
- The `.wav` extension is outside the token — don't include it in the replacement string

## Batch-generating sample maps with HiseScript [03:06]

Two buttons drive the script: one to pick the template, one to run the batch.

```javascript
var template_contents = "";
var template_dir = "";

// --- Button: Select Template ---
inline function onBtnTemplate(component, value)
{
    if (value == 0) return;

    local f = FileSystem.browse(FileSystem.Downloads, false, "*.xml");

    if (f.isFile())
    {
        template_contents = f.loadAsString();
        template_dir = f.getParentDirectory();
    }
}

// --- Button: Run Batch ---
inline function onBtnRun(component, value)
{
    if (value == 0) return;

    for (i = 1; i <= 1000; i++)
    {
        local name = "agg-" + i; // change prefix to match your naming

        local newFile = template_dir.getChildFile(name + ".xml");

        local copy = template_contents;
        copy = copy.replace("%SampleMapID%", name);
        copy = copy.replace("%SampleName%", name);

        newFile.writeString(copy);
    }

    Console.print("Done — files written");
}
```

- `FileSystem.browse()` opens a native file picker; the second argument `false` means single-file selection.
- `getChildFile()` resolves a filename relative to a directory object — no string path concatenation needed.
- To add more token types (velocity layers, round-robin groups), add extra `copy.replace()` calls and matching `%Token%` placeholders in the template.
