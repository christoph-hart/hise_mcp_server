---
title: "Scripting objects and curly braces"
summary: "Beginner guide to HiseScript objects: creating objects with curly braces, key-value pairs, dot vs bracket notation, nesting arrays and objects, and iterating nested structures."
channel: "David Healey"
videoId: "orqzckIOy0E"
url: "https://youtube.com/watch?v=orqzckIOy0E"
publishDate: "2022-06-18"
views: 0
likes: 0
duration: 845
domain: "scripting"
---

# Scripting objects and curly braces — David Healey

## Introduction

This recipe covers HiseScript objects from the ground up: how curly braces define objects vs code blocks, key-value pairs, access patterns, and nesting arrays and objects within objects.

## Curly braces — code blocks vs objects [00:00]

Curly braces serve two purposes depending on context:

```javascript
// Block of code (loop body)
for (i = 0; i < 5; i++)
{
    // code here
}

// Object declaration
const var animals = {};
```

Use the Script Watch table to inspect arrays and objects live.

## Key-value pairs [02:41]

Objects use string keys instead of numeric indices. Values can be strings, integers, floats, or booleans.

```javascript
const var animals = {
    "dog": "black",
    "cat": "ginger",
    "fish": "gold"
};
```

Two ways to access values:

```javascript
// Dot notation (key must have no spaces)
Console.print(animals.dog);    // "black"

// Bracket notation (works with any key, including spaces)
Console.print(animals["fish"]); // "gold"
```

## Adding properties and nesting arrays [06:10]

Add new keys to an object after declaration. Objects can contain arrays and other objects as values:

```javascript
const var animals = {};

const var dogs = ["tyke", "rover", "fido"];
const var cats = ["tigger", "tom"];

animals.dogs = dogs;
animals.cats = cats;

Console.print(trace(animals)); // inspect nested structure
```

## Nesting objects and accessing nested values [09:11]

Nest full objects inside other objects:

```javascript
const var exotic = {
    "elephant": "africa",
    "tiger": "asia",
    "panda": "china"
};

animals.exotic = exotic;

// Nested array — access by index
Console.print(animals.dogs[1]);       // "rover"

// Nested object — access by key
Console.print(animals.exotic.tiger);  // "asia"
Console.print(animals.exotic["panda"]); // "china"
```

Iterating a nested array:

```javascript
for (dog in animals.dogs)
{
    Console.print(dog);
}
```
