# Agent Guidelines for HISE MCP Server

This document provides essential information for AI agents working in this repository.

## Git Policy

**CRITICAL: This repository uses AI-assisted development with human code review.**

- **NEVER commit changes** - Always present changes for user review first
- **NEVER push to remote** - The user will handle all git operations
- **NEVER use `git commit`** - Even with good commit messages, let the user decide when to commit
- Use `git status` and `git diff` to show pending changes when asked
- You may prepare commit messages as suggestions, but do not execute the commit

When changes are complete:
1. Summarize what was changed and why
2. Show `git status` to list modified files
3. Suggest a commit message
4. **Stop and wait** for the user to commit manually

## Build Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Start the MCP server (requires build first)
npm start

# Build and run in development mode
npm run dev
```

**Important:** This project does not have automated tests configured. When implementing features, manually test by:
1. Building the project: `npm run build`
2. Running the server locally
3. Using MCP client tools to verify functionality

## Code Style Guidelines

### Project Type
- TypeScript/Node.js ES Module project
- Target: ES2022
- Module system: NodeNext with .js extensions in imports

### Imports
- Always use `.js` extensions for TypeScript imports (ESM requirement)
- Group imports: external libraries first, local modules second
- Named imports preferred over default imports
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { HISEDataLoader } from './data-loader.js';
```

### Type Definitions
- All types defined in `src/types.ts`
- Use interfaces for data structures, types for unions/primitives
- Export all interfaces that cross file boundaries
```typescript
export interface UIComponentProperty {
  id: string;
  componentType: string;
  propertyName: string;
}
```

### Class Design
- Private fields with underscore prefix for internal state
- Public methods for API
- Constructor with minimal logic
- Async methods for I/O operations (loading data)
```typescript
export class HISEDataLoader {
  private data: HISEData | null = null;
  private propertyIndex: Map<string, UIComponentProperty> = new Map();

  async loadData(): Promise<void> { /* ... */ }
  queryUIProperty(componentProperty: string): UIComponentProperty | null { /* ... */ }
}
```

### Error Handling
- Use try-catch for async operations
- Throw descriptive errors with context
- Return null for not-found scenarios (not errors)
- Log errors to stderr (MCP server convention)
```typescript
try {
  const data = readFileSync(path, 'utf8');
  return JSON.parse(data);
} catch (error) {
  throw new Error(`Failed to load HISE data: ${error}`);
}
```

### Null Handling
- Use null for missing values (not undefined)
- Use nullish coalescing (??) for defaults
- Optional chaining for nested access
- Check null before using data
```typescript
const defaultValue: string | number | boolean = propData.defaultValue ?? null;
const result = this.propertyIndex.get(key) || null;
if (!this.data) return [];
```

### Naming Conventions
- Classes: PascalCase (e.g., `HISEDataLoader`)
- Interfaces: PascalCase (e.g., `UIComponentProperty`)
- Methods: camelCase (e.g., `queryUIProperty`)
- Constants: UPPER_SNAKE_CASE (e.g., `TOOLS`)
- Private members: no prefix, just private modifier
- File names: kebab-case (e.g., `data-loader.ts`)

### Indexing Pattern
- Use Map for O(1) lookups
- Normalize keys to lowercase for case-insensitive queries
- Build indexes once after data loading
- Clear and rebuild on data reload
```typescript
private buildIndexes(): void {
  for (const prop of this.data.uiComponentProperties) {
    const key = `${prop.componentType}.${prop.propertyName}`.toLowerCase();
    this.propertyIndex.set(key, prop);
  }
}
```

### MCP Tool Implementation
- Define tools as const array with Tool interface
- Use switch statements for request routing
- Return structured responses with content array
- Handle errors with isError flag
- Use JSON.stringify with 2-space indentation for pretty output
```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case 'query_ui_property':
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return { content: [{ type: 'text', text: `Error: ${error}` }], isError: true };
  }
});
```

### Data Transformation
- Keep transform methods private
- Normalize data structure during load
- Use descriptive method names (`transformUIProperties`, `transformSnippets`)
- Handle type errors gracefully
```typescript
private transformUIProperties(data: Record<string, any>): UIComponentProperty[] {
  const properties: UIComponentProperty[] = [];
  for (const [componentType, props] of Object.entries(data)) {
    if (typeof props !== 'object' || props === null) continue;
    // Transform and add to array
  }
  return properties;
}
```

### Code Organization
- `src/types.ts` - All type definitions
- `src/data-loader.ts` - Data loading, indexing, queries
- `src/index.ts` - MCP server, tool definitions, request handlers
- `data/*.json` - Source data files (JSON format)

### Logging
- Use console.error for server startup/errors (MCP stdio protocol)
- Do not use console.log for output (conflicts with MCP communication)
```typescript
console.error('HISE MCP server started');  // OK
console.log('Processing request');  // DON'T USE
```

### TypeScript Configuration
- Strict mode enabled
- No implicit any
- Force consistent casing in file names
- Generate declarations and source maps
- All imports must use .js extension for ESM

## Common Patterns

### Add a New Query Tool
1. Add interface to `types.ts` for result type
2. Add transformation method in `data-loader.ts`
3. Add index Map field to `HISEDataLoader` class
4. Implement query method returning result or null
5. Add tool definition to TOOLS array in `index.ts`
6. Add case in CallToolRequestSchema handler
7. Build and test: `npm run dev`

### Add New Data Source
1. Update HISEData interface in `types.ts`
2. Create JSON file in `data/` directory
3. Add file loading in `loadData()` method
4. Create transformation method
5. Add to buildIndexes()
6. Build and test
