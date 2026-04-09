---
title: "HISE How to use the File and Filesystem APIs"
summary: "Complete walkthrough of the HISE FileSystem and File APIs covering getFolder, getChildFile, loadAsString, writeString, browse, browseForDirectory, deleteFileOrDirectory, createDirectory, and toString with format constants."
channel: "David Healey"
videoId: "ddodaOOFXik"
url: "https://youtube.com/watch?v=ddodaOOFXik"
publishDate: "2022-07-16"
views: 0
likes: 0
duration: 1339
domain: "scripting"
---

# HISE How to use the File and Filesystem APIs — David Healey

## Introduction

This recipe covers the two core file-handling APIs in HISE. The FileSystem API references locations on the user's system. The File API operates on those references (read, write, delete, etc.). These two APIs are always used together: get a reference first via FileSystem, then act on it via File.

**Predefined FileSystem location constants:**
`FileSystem.AudioFiles`, `FileSystem.Samples`, `FileSystem.AppData`, `FileSystem.UserHome`, `FileSystem.Desktop`, `FileSystem.Downloads`, `FileSystem.Documents`, `FileSystem.Temp`, `FileSystem.Music`

## getFolder — getting a directory reference [01:50]

Use `FileSystem.getFolder()` with a predefined location constant to obtain a File object referencing a directory.

```javascript
const var desktop = FileSystem.getFolder(FileSystem.Desktop);
Console.print(desktop.isDirectory()); // 1 if valid directory
```

## getChildFile — getting a file reference [03:18]

Use `getChildFile()` on a directory File object to get a reference to a specific file. Both directories and files share the File data type.

```javascript
const var desktop = FileSystem.getFolder(FileSystem.Desktop);
const var f = desktop.getChildFile("textfile.txt");
```

## loadAsString — reading a text file [05:00]

Use `loadAsString()` to read the entire contents of a text file into a string.

```javascript
const var f = desktop.getChildFile("textfile.txt");
const var text = f.loadAsString();
Console.print(text);
```

## writeString — writing and appending to a text file [05:48]

`writeString()` replaces the entire file contents. To append, read first, concatenate, then write back.

```javascript
// Overwrite:
f.writeString("This is some awesome text");

// Append (use reg to allow reassignment):
reg text = f.loadAsString();
text = text + "Hello World\r\n";
f.writeString(text);
```

`const var` cannot be reassigned — use `reg` or `var` for variables that need mutation.

## Browse for a file — async file picker [09:30]

`FileSystem.browse()` opens a native file browser asynchronously. The callback fires only when the user selects a file (cancelled = no callback).

Parameters: `startFolder`, `isSaveDialog` (bool), `wildcard` (string), `callback`.

```javascript
inline function onBrowseButton(component, value)
{
    if (value)
    {
        FileSystem.browse(FileSystem.Desktop, false, "*.txt", function(f)
        {
            local text = f.loadAsString();
            Console.print(text);
        });
    }
}
```

Change the first argument to any `FileSystem.*` constant to open the picker in a different starting directory.

## isFile — checking if a reference points to a file [12:58]

Always verify the object is a file before operating on it. `isFile()` returns 1 for files and 0 for directories or invalid references.

```javascript
if (f.isFile())
{
    // safe to operate on f
}
```

## deleteFileOrDirectory — safe deletion with confirmation [13:20]

`deleteFileOrDirectory()` executes immediately with no confirmation, so always wrap in a yes/no prompt.

```javascript
Engine.showYesNoWindow("Delete", "Are you sure?", function(response)
{
    if (response)
    {
        f.deleteFileOrDirectory();
    }
});
```

## showYesNoWindow — scope issue when nesting callbacks [13:55]

Variables from an outer callback are not automatically visible inside a nested callback. Capture them with `local` before the nested call.

```javascript
FileSystem.browse(FileSystem.Desktop, true, "*", function(f)
{
    local file = f; // capture — 'f' won't be in scope inside yes/no callback

    Engine.showYesNoWindow("Delete", "Are you sure?", function(response)
    {
        if (response)
        {
            file.deleteFileOrDirectory(); // use 'file', not 'f'
        }
    });
});
```

## browseForDirectory — browse for a folder [16:00]

Use `FileSystem.browseForDirectory()` to let the user pick a directory.

```javascript
FileSystem.browseForDirectory(FileSystem.Downloads, function(dir)
{
    Console.print(dir.toString(dir.FullPath));
});
```

## toString — convert File/Directory to path string [17:48]

`File.toString(format)` returns a string representation using format constants:

| Constant | Result |
|---|---|
| `File.FullPath` | Full absolute path |
| `File.NoExtension` | Path without extension |
| `File.OnlyExtension` | Just the extension (e.g. `txt`) |
| `File.Filename` | Filename with extension |

For directories, only `File.FullPath` returns meaningful output.

## createDirectory — create a new subdirectory [18:55]

Call `createDirectory(name)` on an existing directory File object. The new folder is created immediately on disk.

```javascript
FileSystem.browseForDirectory(FileSystem.Downloads, function(dir)
{
    dir.createDirectory("new folder");
});
```

## getChildFile + writeString — create a new file [19:55]

`getChildFile(filename)` defines a file reference — the file is not created on disk until data is written to it.

```javascript
const var downloads = FileSystem.getFolder(FileSystem.Downloads);
const var newFile = downloads.getChildFile("new file.txt");

// Writing creates the file on disk:
newFile.writeString("This is some text");
```

Until `writeString()` (or equivalent) is called, the file only exists as a HISE File object, not on the filesystem.
