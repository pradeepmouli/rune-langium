---
title: Introduction
---

# Introduction

Rune Studio provides web-native tooling for the [Rune DSL](https://github.com/finos/rune-dsl) — the language behind ISDA's Common Domain Model (CDM) and Digital Regulatory Reporting (DRR). No Eclipse, no Java, no setup.

> **Pre-1.0 software** — APIs are subject to change between minor versions.

## Packages

| Package | Description |
|---|---|
| `@rune-langium/core` | Langium-based language core for Rune DSL |
| `@rune-langium/cli` | Command-line tools for parsing, validating, and generating from Rune models |
| `@rune-langium/lsp-server` | Language Server Protocol server (Node or web worker) |
| `@rune-langium/codegen` | Code generators targeting multiple output formats |
| `@rune-langium/visual-editor` | Embeddable React components for visual model editing |

The `apps/studio` Rune Studio IDE is a separate application released under FSL-1.1-ALv2 and is not part of this API reference.

## Next Steps

- [Installation](./installation)
- [Usage](./usage)
- [API Reference](/api/)
