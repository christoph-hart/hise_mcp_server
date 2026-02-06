# Style Guide Development

This document explains how to add and manage style guides in the HISE MCP Server.

## Overview

Style guides are MCP resources that help LLMs understand HISE-specific coding patterns. They are:
- **Context-efficient** - Concise markdown, minimal token usage
- **On-demand** - Loaded only when needed via `get_resource()`
- **Hinted** - Script tools suggest loading relevant guides when errors occur

## Architecture

### File Location

All style guides are defined in:
```
src/style-guides.ts
```

### Data Structure

```typescript
export interface StyleGuide {
  id: string;          // Unique identifier (used in URLs and get_resource)
  name: string;        // Human-readable name
  description: string; // Brief description (shown in list_resources)
  content: string;     // Markdown content - the actual guide
}

export const STYLE_GUIDES: StyleGuide[] = [
  { id: 'hisescript-style', name: '...', description: '...', content: `...` },
  // Add more guides here
];
```

### Access Methods

| Method | URI/Call | Returns |
|--------|----------|---------|
| List all guides | `get_resource('hisescript-style')` | Guide content as markdown |
| Native MCP list | `hise://style-guides` | JSON array of {id, name, description} |
| Native MCP read | `hise://style-guides/{id}` | Guide content as markdown |
| Tool: list | `list_resources` → `styleGuides` | Array of available guides |
| Tool: get | `get_resource({ id: '{id}' })` | Guide content as markdown |

### Auto-Hints

When script-related tools encounter errors, they include a hint:
```json
{
  "success": false,
  "errors": [...],
  "_hint": "Tip: Use get_resource('hisescript-style') for HiseScript syntax reference"
}
```

Affected tools: `hise_runtime_set_script`, `hise_runtime_edit_script`, `hise_runtime_recompile`

## Adding a New Style Guide

### Step 1: Add to STYLE_GUIDES array

In `src/style-guides.ts`, add a new entry:

```typescript
export const STYLE_GUIDES: StyleGuide[] = [
  // Existing guide
  {
    id: 'hisescript-style',
    // ...
  },
  // NEW: Add your guide
  {
    id: 'scriptnode-style',  // Use kebab-case
    name: 'Scriptnode Style Guide',
    description: 'Best practices for Scriptnode DSP development',
    content: `# Scriptnode Style Guide

Your markdown content here...
`
  },
];
```

### Step 2: Build and Test

```bash
npm run build
```

The guide is automatically available via:
- `get_resource({ id: 'scriptnode-style' })`
- `hise://style-guides/scriptnode-style`

No changes to `index.ts` required - the handlers iterate over `STYLE_GUIDES` dynamically.

## Content Guidelines

### Keep It Concise

Style guides should be **light on the context window**:
- Focus on differences from common languages (JavaScript, C++)
- Use tables for quick reference
- Show Wrong/Right code examples
- Avoid verbose explanations

### Target Audience

Write for an LLM that:
- Already knows JavaScript/TypeScript well
- Needs to understand HISE-specific quirks
- Will make syntax errors without guidance

### Example Structure

```markdown
# [Topic] Style Guide

Brief intro (1-2 sentences).

## [Category 1]

| Pattern | Example |
|---------|---------|
| Do this | `code` |
| Not this | `code` |

## [Category 2]

\`\`\`javascript
// Wrong
bad_code();

// Right
good_code();
\`\`\`
```

## Current Style Guides

| ID | Purpose | Status |
|----|---------|--------|
| `hisescript-style` | Core HiseScript vs JavaScript differences | Implemented |

## Context-Specific Hints (Future)

The hint system could be extended to suggest context-specific guides based on error type. This would require updating the hint logic in `src/index.ts` to detect error context.
