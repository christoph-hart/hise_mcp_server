---
title: "Introduction to broadcasters in HISE"
summary: "Introduces the broadcaster system in HISE as an alternative to direct control callbacks, covering creation, attachment to component values, the broadcaster wizard, and the broadcaster map for visualizing connections."
channel: "David Healey"
videoId: "ZxkfnfOOr3s"
url: "https://youtube.com/watch?v=ZxkfnfOOr3s"
publishDate: "2024-11-02"
views: 590
likes: 25
duration: 1433
domain: "scripting"
---

# Introduction to broadcasters in HISE — David Healey

## Introduction

This recipe introduces the broadcaster system in HISE, which implements the Observer pattern for decoupling UI components. You'll learn the difference between the traditional callback approach (where a sender explicitly notifies each recipient) and the broadcaster approach (where listeners independently subscribe to value changes). The tutorial covers creating a broadcaster, attaching it to component values, using the broadcaster wizard to generate boilerplate, and navigating connections with the broadcaster map.

## Sending a message to multiple targets: traditional approach vs broadcaster decoupling [02:29]

The traditional approach requires the sender to explicitly know every recipient. The broadcaster approach (covered next) removes this coupling. This section demonstrates the traditional method as a baseline.

```javascript
// Traditional approach: sender explicitly notifies each recipient.
// Use Content.getAllComponents() to batch-reference identically-prefixed components.

const var btnSender = Content.getComponent("BTN Sender");
const var btnFriends = Content.getAllComponents("BTN Friend"); // returns array of BTN Friend 0, 1, 2

inline function onSenderControl(component, value)
{
    // Sender must know each recipient exists and address them directly.
    for (btn in btnFriends)
    {
        btn.setValue(value);
    }
};

btnSender.setControlCallback(onSenderControl);
```

The key architectural limitation here is tight coupling: the sender must know how many friends exist and explicitly message each one. Adding a new recipient means modifying the sender's callback. Broadcasters solve this by letting the sender publish a message without knowing who is listening — recipients register themselves independently, making the code easier to extend without touching the sender logic.

## Declaring a broadcaster with Engine.createBroadcaster() — ID and args parameters [06:03]

`Engine.createBroadcaster()` takes a configuration object. Every broadcaster requires at minimum an `id` and an `args` array. The `args` array defines the parameter names that listener callbacks will receive. Additional fields such as metadata and tags are optional.

```javascript
// Declare the broadcaster at init scope using const var.
// The id is a string identifier for the broadcaster (used for debugging/routing).
// args defines the parameter signature that all listener callbacks must match.
const var BC = Engine.createBroadcaster({
    "id": "senderBC",
    "args": ["component", "value"]  // listener functions will receive (component, value)
});
```

The parameter names in `args` are arbitrary labels — choose names that describe what the broadcaster will pass to its listeners. You can extend `args` with additional entries if listeners need more context.

## Attaching a broadcaster to components using attachToComponentValue and addComponentValueListener [07:27]

1. Attach the broadcaster to the source (sender) component using `attachToComponentValue`. The first argument is an array of component IDs so multiple senders can share one broadcaster. The optional metadata string labels the attachment for debugging.

2. Register listener components using `addComponentValueListener`. Pass an array of component references (not just IDs). The callback receives `targetIndex` (which listener is being set), the broadcaster's args (`component` and `value`), and must return the value to assign to each listening component.

3. Use `Content.getAllComponents()` to populate the listener array by name prefix rather than hard-coding individual IDs. Adding a new button to the UI requires no script changes.

```javascript
// Assume BC is already created with args: ["component", "value"]
// Sender: BTN_sender. Listeners: any button whose ID starts with "BTN_friend".

BC.attachToComponentValue(["BTN_sender"], "sender_watcher");

const var BTN_friend = Content.getAllComponents("BTN_friend");

// Define the listener callback separately as an inline function
inline function onBroadcasterValue(targetIndex, component, value)
{
    // targetIndex = which listener component is being set
    // component   = the sender component that triggered the broadcast
    // value       = the sender's current value
    return value;  // assign sender value directly to each friend button
}

BC.addComponentValueListener(BTN_friend, "sender_listener", onBroadcasterValue);
```

Note: `addComponentValueListener` is the specialised variant that writes its return value back to each listener component's value. Use `addListener` instead when you need a generic callback that does not automatically set a component value. The sender button has no knowledge of the listeners — only the broadcaster and the listeners are coupled, keeping the sender's logic independent.

## Using the broadcaster wizard to generate broadcaster setup code [15:06]

Open the broadcaster wizard via Tools > Show Broadcaster Wizard. The wizard generates the same code you would write manually, but guides you through the options step by step. It is most useful for discovering available connection types.

1. Give the broadcaster an ID (e.g. `BC_sender`), then click Next.
2. Select the capability — "Component Value" listens for control value changes. Other available capabilities include component properties (size, colour, text), mouse events (lets you attach mouse callbacks to controls that don't natively have them), and more.
3. Enter the source component ID (e.g. `BTN_sender`). The field offers a dropdown populated from existing components.
4. Add optional metadata (e.g. `"sender broadcaster"`), then click Next.
5. Select the target type — "Component Value" to propagate a value change to listener components, a plain callback for arbitrary logic, or property changes on the target components.
6. Enter the target component IDs as a comma-separated list (e.g. `BTN_friend_0, BTN_friend_1, BTN_friend_2`).
7. Leave the Function ID field empty to generate an anonymous inline listener callback. If you supply a name here, the wizard uses that as the callback function identifier.
8. Add optional metadata (e.g. `"friend listener"`), then click Next.
9. Review the generated code — it is equivalent to writing the broadcaster manually. Click Finish to copy it to the clipboard, then paste it into your script editor and recompile (F5).

## Visualizing broadcaster connections with the broadcaster map [19:10]

The broadcaster map is a panel in the script editor (toggled via the triangle icon on the side) that visualizes all broadcaster connections in your project. Activate it once with the power button — the setting persists across HISE sessions.

The map renders three columns for each broadcaster: senders on the left, the broadcaster node (labeled by its variable name/ID) in the center, and listeners on the right. The center node displays the current value live as you interact with UI controls.

Multiple senders can feed into a single broadcaster, and a single sender can feed into multiple broadcasters — the center column stacks additional broadcaster nodes when this is the case. Multiple listeners can be attached to the same broadcaster — they stack on the right and each receives the value independently. This means a single sender interaction can trigger multiple independent callbacks on multiple components simultaneously, which is a core advantage over standard control callbacks.

Each listener and broadcaster entry in the map is clickable and jumps directly to the corresponding line of code in the script editor. This is the primary utility of the map in large projects with broadcasters spread across multiple namespaces: use it as a navigation tool to locate and audit connections without manually searching the codebase.
