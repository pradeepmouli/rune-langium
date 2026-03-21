# @rune-langium/lsp-server

Language Server Protocol (LSP) server for the Rune DSL, powered by [Langium](https://langium.org) and [@lspeasy/server](https://github.com/pradeepmouli/lspy).

Provides autocomplete, validation, go-to-definition, hover info, and diagnostics for `.rosetta` files.

## Installation

```bash
npm install @rune-langium/lsp-server
```

## Usage

### As a standalone server

```bash
rune-lsp-server --stdio
```

### Programmatic

```typescript
import { createRuneLspServer } from '@rune-langium/lsp-server';
```

## License

MIT
