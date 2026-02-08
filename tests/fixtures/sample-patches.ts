/**
 * Sample patches for testing
 */

// Valid patch: Replace single line
export const PATCH_REPLACE_SINGLE_LINE = `@@ -1,5 +1,5 @@
 const Component = Content.getComponent("Panel");
-const value = 123;
+const value = 456;
 const name = "test";
 Component.setValue(value);
 Component.repaint();`;

// Valid patch: Delete a line
export const PATCH_DELETE_LINE = `@@ -1,5 +1,4 @@
 const Component = Content.getComponent("Panel");
 const value = 123;
-const name = "test";
 Component.setValue(value);
 Component.repaint();`;

// Valid patch: Insert a line
export const PATCH_INSERT_LINE = `@@ -1,5 +1,6 @@
 const Component = Content.getComponent("Panel");
 const value = 123;
+const extra = "inserted";
 const name = "test";
 Component.setValue(value);
 Component.repaint();`;

// Valid patch: Multiple changes in one hunk
export const PATCH_MULTIPLE_CHANGES = `@@ -1,5 +1,5 @@
 const Component = Content.getComponent("Panel");
-const value = 123;
-const name = "test";
+const value = 456;
+const name = "updated";
 Component.setValue(value);
 Component.repaint();`;

// Valid patch: Insert at end
export const PATCH_INSERT_AT_END = `@@ -3,3 +3,5 @@
 const name = "test";
 Component.setValue(value);
 Component.repaint();
+
+Console.print("done");`;

// Invalid patch: Wrong context (will fail to apply)
export const PATCH_WRONG_CONTEXT = `@@ -1,3 +1,3 @@
 const WRONG = "this doesn't exist";
-const value = 123;
+const value = 456;
 const name = "test";`;

// Invalid patch: Malformed (missing @@ header)
export const PATCH_MALFORMED = `This is not a valid patch
-old line
+new line`;

// Multi-hunk patch
export const PATCH_MULTI_HUNK = `@@ -1,2 +1,2 @@
-const Component = Content.getComponent("Panel");
+const Component = Content.getComponent("MainPanel");
 const value = 123;
@@ -4,2 +4,2 @@
 Component.setValue(value);
-Component.repaint();
+Component.repaintImmediately();`;
