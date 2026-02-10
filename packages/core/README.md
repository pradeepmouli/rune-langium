# @rune-langium/core

Langium-based parser and typed AST for the [Rune DSL](https://github.com/finos/rune-dsl) (`.rosetta` files).

## Overview

`@rune-langium/core` ports the Xtext-based Rune DSL grammar (~95 rules) to [Langium](https://langium.org/), auto-generating fully typed TypeScript AST interfaces. It provides a clean programmatic API for parsing, validating, and traversing `.rosetta` files used in the ISDA Common Domain Model (CDM).

## Installation

```bash
npm install @rune-langium/core
# or
pnpm add @rune-langium/core
```

## Quick Start

```typescript
import { parse } from '@rune-langium/core';

const result = await parse(`
  namespace demo.model
  version "1.0.0"

  type Trade:
    tradeDate date (1..1)
    product Product (1..1)
`);

console.log(result.ast.name);           // "demo.model"
console.log(result.ast.elements[0].$type); // "Data"
console.log(result.diagnostics);        // []
```

## API

### `parse(source: string): Promise<ParseResult>`

Parse a single `.rosetta` source string into a typed AST.

### `parseWorkspace(files: Map<string, string>): Promise<WorkspaceResult>`

Parse multiple `.rosetta` files with cross-file reference resolution.

### AST Types

All ~95 generated AST interfaces are exported:

```typescript
import type {
  RosettaModel,
  Data,
  Choice,
  Attribute,
  Enumeration,
  Function,
  Expression
} from '@rune-langium/core';
```

### Type Guards

Generated type guard functions for all AST node types:

```typescript
import { isData, isChoice, isFunction } from '@rune-langium/core';

if (isData(element)) {
  console.log(element.attributes);
}
```

### Utilities

```typescript
import {
  CardinalityUtils,
  ChoiceUtils,
  ExpressionUtils
} from '@rune-langium/core';
```

## Platform Support

- **Node.js** >= 20
- **Browsers**: ES2020+ (via bundler)
- **Web Workers**: Use `createWorkerParser()` for off-main-thread parsing

## Development

```bash
# Generate AST types from grammar
pnpm run generate

# Build
pnpm run build

# Test
pnpm run test

# Type check
pnpm run type-check
```

## License

MIT
