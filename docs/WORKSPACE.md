# Workspace Guide

This repository uses **pnpm workspaces** for managing multiple packages in a monorepo.

## Directory Structure

```
rune-langium/
├── packages/
│   ├── core/                  # Langium-based Rune DSL parser + AST
│   ├── cli/                   # CLI tool for parsing/validation
│   └── visual-editor/         # ReactFlow component library
├── apps/
│   └── studio/                # Standalone web app (Vite + React)
├── scripts/
├── e2e/
├── docs/
├── specs/
│   ├── 001-langium-port/
│   └── 002-reactflow-visual-editor/
├── pnpm-workspace.yaml
└── package.json
```

## Key Concepts

### Workspace Protocol

Use the `workspace:*` protocol to reference packages within the monorepo:

```json
{
  "dependencies": {
    "@rune-langium/core": "workspace:*"
  }
}
```

This ensures:
- Local packages are always used during development
- Versions stay synchronized
- No need to publish to npm during development

### Package Exports

Each package should define proper exports in its `package.json`:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./utils": {
      "types": "./dist/utils.d.ts",
      "default": "./dist/utils.js"
    }
  }
}
```

This enables:
- Clean import paths: `import { helper } from '@rune-langium/utils'`
- Subpath exports: `import { testing } from '@rune-langium/utils/testing'`
- Proper TypeScript support

## Common Commands

### Development

```bash
pnpm install
pnpm run dev
pnpm --filter @rune-langium/core run dev
```

### Building

```bash
pnpm run build
pnpm --filter @rune-langium/utils run build
pnpm run build -- --recursive
```

### Testing

```bash
pnpm run test
pnpm run test:watch
pnpm run test:coverage
pnpm --filter @rune-langium/core run test
```

### Code Quality

```bash
pnpm run lint
pnpm run lint:fix
pnpm run format:check
pnpm run format
pnpm run type-check
```

### Dependency Management

```bash
pnpm run fresh
```

### Versioning & Publishing

```bash
pnpm run changeset
pnpm run changeset:version
pnpm run changeset:publish
```

## Adding New Packages

1. Create a new directory in `packages/`.
2. Add a `package.json` with proper exports.

```json
{
  "name": "@rune-langium/my-package",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  }
}
```

3. Create `tsconfig.json` extending the root.

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "../../dist/my-package",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

4. Add source files:

```
src/
├── index.ts
└── index.test.ts
```

5. Update workspace references in other packages that depend on it:

```json
{
  "dependencies": {
    "@rune-langium/my-package": "workspace:*"
  }
}
```

## Package Dependencies

### Valid Dependency Patterns

```javascript
// ✅ Workspace package (during development)
"@rune-langium/core": "workspace:*"

// ✅ Specific version
"zod": "^4.2.1"

// ✅ Latest version
"@types/node": "^25.0.3"

// ❌ Avoid circular dependencies
// Package A depends on B, B depends on A
```

### Checking Dependency Graph

```bash
pnpm ls --depth 0 -r
pnpm ls --filter @rune-langium/core
pnpm --filter @rune-langium/utils run type-check
```

## Best Practices

### 1. Keep Packages Focused

- Each package should have a single responsibility
- Avoid bloated monolithic packages
- Share code through dedicated packages

### 2. Consistent Naming

```
✅ @rune-langium/core
✅ @rune-langium/utils
✅ @rune-langium/test-utils
✅ @rune-langium/components (if using React)

❌ @rune-langium/utils-core
❌ @rune-langium/shared-utils-lib
```

### 3. Version Management

- Use changesets for versioning across packages
- Keep related packages at similar versions
- Document breaking changes in CHANGELOG.md

### 4. Testing Cross-Package

- Use integration tests to verify package interactions
- Place integration tests in root `integration.test.ts`
- Mock external dependencies, not workspace packages

## Troubleshooting

### Circular dependency errors

**Problem**: Package A depends on B, B depends on A

**Solution**:
1. Extract shared code to a third package
2. Have both A and B depend on the shared package
3. Or restructure packages to break the cycle

### Slow builds

**Problem**: Building all packages takes too long

**Solution**:
```bash
pnpm --filter "...{packages/core}" run build
pnpm --filter @rune-langium/core run build
```

## Resources

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [Monorepo Best Practices](https://monorepo.tools/)
