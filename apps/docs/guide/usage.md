---
title: Usage
---

# Usage

## Parse and validate

```ts
import { createRuneServices } from '@rune-langium/core';

const services = createRuneServices();
const document = services.shared.workspace.LangiumDocumentFactory.fromString(
  source,
  URI.file('model.rune')
);
await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
```

## LSP server

```ts
import { startLanguageServer } from '@rune-langium/lsp-server';
startLanguageServer();
```

## Codegen

```bash
pnpm rune-langium codegen --target typescript --input model.rune
```

See the [API Reference](/api/) for the full surface area.
