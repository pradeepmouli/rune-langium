# rune-langium

> A TypeScript-native toolchain for the [Rune DSL](https://github.com/finos/rune-dsl) — parser, AST, language server, codegen, visual editor, and the Studio IDE — so you can work with ISDA CDM and DRR models in any browser or Node environment. No Eclipse. No Java. No setup.

> **⚠️ Pre-1.0 software** — APIs are subject to change between minor versions. Pin to exact versions in production. See the [CHANGELOG](./CHANGELOG.md) for breaking changes between releases.

<p align="center">
  <a href="https://github.com/pradeepmouli/rune-langium/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/pradeepmouli/rune-langium/ci.yml?style=flat-square" alt="ci" /></a>
  <img src="https://img.shields.io/badge/core-MIT-blue?style=flat-square" alt="core license" />
  <img src="https://img.shields.io/badge/studio-FSL--1.1--ALv2-orange?style=flat-square" alt="studio license" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen?style=flat-square" alt="node" />
  <img src="https://img.shields.io/badge/TypeScript-5.9+-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="ts" />
</p>

<p align="center">
  <img src="site/assets/screenshot-graph.png" alt="Rune Studio — graph view showing CDM type inheritance trees with grouped layout, namespace explorer, and type filtering" width="900">
</p>

📚 **Documentation:** <https://pradeepmouli.github.io/rune-langium/>

## Overview

The [Rune DSL](https://github.com/finos/rune-dsl) is the language behind ISDA's [Common Domain Model (CDM)](https://www.finos.org/common-domain-model) and the Digital Regulatory Reporting (DRR) framework — a domain-specific language for describing financial products, events, lifecycle transitions, and the rule logic that drives post-trade processing and regulatory reporting. The canonical Rune toolchain is a JVM stack built on Xtext and Eclipse; rich, but heavy, hard to embed, and impossible to run in a browser.

`rune-langium` is a from-scratch reimplementation of the Rune language in pure TypeScript on top of [Langium](https://langium.org/). Grammar, AST, scope provider, validator, serializer, LSP server, code generators, and visual editor all run as ESM modules in Node, in a web worker, or bundled into an SPA — so you can `pnpm add @rune-langium/core` and load a `.rosetta` file in the same process that renders your UI.

Use `rune-langium` if you are building a browser-based model explorer, a VS Code / Monaco integration for CDM, a CI validator for Rune files, a codegen pipeline targeting TypeScript / JSON Schema / Zod, or a form-driven editor that reads and writes Rune models. Use the [Rune Studio](apps/studio) application if you want the batteries-included three-panel IDE (graph + form + code) ready to run.

## Features

- **Pure TypeScript, browser-ready** — the parser, language server, and every downstream tool run anywhere JavaScript runs; no JVM, no Eclipse headless, no Docker.
- **Langium-based grammar** — full Rune surface syntax with a clean AST, scope provider, validator, and serializer that round-trips `.rosetta` source.
- **Full LSP support** — completion, diagnostics, hover, go-to-definition, find-references, document symbols, formatting — served by `@rune-langium/lsp-server` over stdio or a web worker.
- **CDM & DRR out of the box** — vendored fixtures and parsing paths cover ISDA CDM, the FINOS Rune DSL, and Rune FpML; load a namespace and explore thousands of types without any preprocessing.
- **Visual graph editor** — a `@xyflow/react`-powered component (`@rune-langium/visual-editor`) that renders type inheritance, rule call graphs, and model structure with grouped layouts, namespace filtering, and live synchronization to the underlying AST.
- **Codegen pipeline** — `@rune-langium/codegen` targets TypeScript types, JSON Schema, Zod schemas, and form descriptors derived from Rune model structure; scriptable from CI.
- **CLI for scripting** — `@rune-langium/cli` exposes parse, validate, serialize, and codegen as a commander-based CLI for build pipelines.
- **Design system** — `@rune-langium/design-system` ships the theme, tokens, and UI primitives used by Studio so downstream apps inherit the same look.
- **Studio IDE** — a three-panel web app (graph + form + code) with undo/redo (zundo), IndexedDB caching (idb), File System Access API integration, and no backend required.
- **Langium-native extensibility** — because everything is Langium services, you can subclass `RuneDslValidator`, `RuneDslScopeProvider`, or the parser and plug your extension into the same DI container.

## Install

```bash
pnpm add @rune-langium/core
# optional pieces
pnpm add @rune-langium/cli @rune-langium/codegen @rune-langium/lsp-server
```

Requires **Node.js ≥ 20** and **pnpm ≥ 10** for local development.

## Quick Start

Parse a Rune file and walk the AST:

```typescript
import { parse, serializeModel } from '@rune-langium/core';

const source = `
namespace demo
type Trade:
  tradeId string (1..1)
  notional number (1..1)
`;

const { model, diagnostics } = await parse(source);

if (diagnostics.length) {
  console.error(diagnostics);
  process.exit(1);
}

for (const element of model.elements) {
  console.log(element.$type, element.name);
}

// Round-trip back to source
console.log(serializeModel(model));
```

Validate a workspace of `.rosetta` files from the CLI:

```bash
pnpm dlx @rune-langium/cli validate ./path/to/cdm
```

Embed the LSP server in a web worker for an in-browser Monaco editor, or spawn it over stdio for a desktop editor — the same `@rune-langium/lsp-server` package drives both.

## How it works

```
┌───────────────────────────────────────────────────────┐
│                     apps/studio                       │  ← FSL-1.1-ALv2
│   Three-panel IDE: graph | form | code (browser-only) │
└──────────────┬──────────────────┬─────────────────────┘
               │                  │
   ┌───────────▼──────┐   ┌───────▼────────────┐
   │ @rune-langium/   │   │ @rune-langium/     │
   │ visual-editor    │   │ design-system      │
   └───────┬──────────┘   └────────┬───────────┘
           │                       │
           └─────────┬─────────────┘
                     │
        ┌────────────▼────────────┐     ┌─────────────────────┐
        │   @rune-langium/core    │◄────┤ @rune-langium/      │
        │ (Langium services, AST, │     │ lsp-server          │
        │  parser, validator,     │     └─────────────────────┘
        │  scope, serializer)     │     ┌─────────────────────┐
        │                         │◄────┤ @rune-langium/      │
        └────────────┬────────────┘     │ codegen             │
                     │                  └─────────────────────┘
                     │                  ┌─────────────────────┐
                     └──────────────────┤ @rune-langium/cli   │
                                        └─────────────────────┘
                                        ▲
                                        │  ← MIT
```

`@rune-langium/core` is the single source of truth — grammar, generated AST, and Langium services. Every other package consumes it. Studio wires them together with React 19, `@xyflow/react`, zustand, Tailwind 4, and a browser-only workspace backed by the File System Access API and IndexedDB.

## Packages

| Package | License | Description |
|---|---|---|
| [`@rune-langium/core`](packages/core) | MIT | Grammar, AST, parser, validator, scope provider, serializer |
| [`@rune-langium/lsp-server`](packages/lsp-server) | MIT | LSP server (stdio + worker) for editor integration |
| [`@rune-langium/codegen`](packages/codegen) | MIT | TypeScript / JSON Schema / Zod / form-descriptor generators |
| [`@rune-langium/cli`](packages/cli) | MIT | Parse / validate / serialize / codegen from the command line |
| [`@rune-langium/visual-editor`](packages/visual-editor) | MIT | React Flow graph editor component |
| [`@rune-langium/design-system`](packages/design-system) | MIT | Theme, tokens, UI primitives |
| [`apps/studio`](apps/studio) | **FSL-1.1-ALv2** | Rune Studio — the three-panel IDE web application |

## Development

```bash
git clone https://github.com/pradeepmouli/rune-langium.git
cd rune-langium
pnpm install

pnpm dev        # run Studio + watch packages
pnpm test       # vitest across the workspace
pnpm lint
pnpm format
```

Integration tests and Studio scenarios use vendored `.rosetta` fixtures under `.resources/`. Refresh them with:

```bash
bash scripts/update-fixtures.sh
# or pin specific tags
bash scripts/update-fixtures.sh --cdm-tag 7.0.0-dev.83 --rune-tag 9.76.2 --fpml-tag master
```

See [docs/WORKSPACE.md](docs/WORKSPACE.md), [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), and [docs/TESTING.md](docs/TESTING.md) for more.

## Ecosystem

rune-langium builds on these libraries from the same author:

| Library | Purpose | npm |
|---|---|---|
| [lspeasy](https://github.com/pradeepmouli/lspeasy) | LSP framework powering rune-langium's language server | [![npm](https://img.shields.io/npm/v/@lspeasy/server?style=flat-square)](https://www.npmjs.com/package/@lspeasy/server) |
| [langium-zod](https://github.com/pradeepmouli/langium-zod) | Generate Zod schemas from Langium grammars | [![npm](https://img.shields.io/npm/v/langium-zod?style=flat-square)](https://www.npmjs.com/package/langium-zod) |
| [zod-to-form](https://github.com/pradeepmouli/zod-to-form) | Generate React forms from Zod schemas — runtime or CLI codegen | [![npm](https://img.shields.io/npm/v/@zod-to-form/core?style=flat-square)](https://www.npmjs.com/package/@zod-to-form/core) |
| [x-to-zod](https://github.com/pradeepmouli/x-to-zod) | Convert JSON Schema to Zod schemas | [![npm](https://img.shields.io/npm/v/x-to-zod?style=flat-square)](https://www.npmjs.com/package/x-to-zod) |

Together these form a pipeline: **Grammar → Zod schemas → React forms**, with [lspeasy](https://github.com/pradeepmouli/lspeasy) providing the LSP layer and JSON Schema as an alternative input path via x-to-zod.

## License

This repository uses a split licensing model:

- **Core packages** (`packages/*`) — [MIT](./LICENSE). Free for any use, commercial or otherwise.
- **Rune Studio** (`apps/studio/`) — [FSL-1.1-ALv2](./apps/studio/LICENSE). Source-available under the Functional Source License v1.1 with an Apache 2.0 Future License: you may use, copy, modify, and redistribute the Studio source for any purpose **except** offering a commercial product that competes with Rune Studio. Each release converts to Apache 2.0 after the `Change Date` specified in `apps/studio/LICENSE` for that release (typically two years after publication).

The core grammar, language server, codegen, CLI, visual editor, and design-system packages are and will remain MIT-licensed. Rune Studio is **source-available**, not open source.

See [NOTICE](./NOTICE) for third-party attribution.

## Contributing

Please see [CONTRIBUTING.md](CONTRIBUTING.md).

---

ISDA® is a registered trademark of the International Swaps and Derivatives Association, Inc. CDM is hosted by FINOS under the Community Specification License. `rune-langium` and Rune Studio are not affiliated with or endorsed by ISDA or FINOS.

**Author**: [Pradeep Mouli](https://github.com/pradeepmouli)
