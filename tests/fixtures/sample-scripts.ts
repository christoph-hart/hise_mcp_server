/**
 * Sample scripts for testing
 */

export const SIMPLE_SCRIPT = `const Component = Content.getComponent("Panel");
const value = 123;
const name = "test";
Component.setValue(value);
Component.repaint();`;

export const REPETITIVE_SCRIPT = `const knob1 = Content.getComponent("Knob1");
knob1.set("text", "Gain");
knob1.set("min", 0);
knob1.set("max", 100);

const knob2 = Content.getComponent("Knob2");
knob2.set("text", "Pan");
knob2.set("min", -100);
knob2.set("max", 100);

const knob3 = Content.getComponent("Knob3");
knob3.set("text", "Width");
knob3.set("min", 0);
knob3.set("max", 100);`;

export const EMPTY_SCRIPT = '';

export const SINGLE_LINE_SCRIPT = 'Console.print("Hello");';

export const SCRIPT_30_LINES = Array(30).fill('const x = 1;').join('\n');

export const SCRIPT_31_LINES = Array(31).fill('const x = 1;').join('\n');

export const SCRIPT_50_LINES = Array(50).fill('const x = 1;').join('\n');

export const SCRIPT_51_LINES = Array(51).fill('const x = 1;').join('\n');

export const SCRIPT_100_LINES = Array(100).fill('const x = 1;').join('\n');
