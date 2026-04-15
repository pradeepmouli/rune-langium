---
title: Installation
---

# Installation

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 10.0.0

## Install packages

```bash
# Language core
pnpm add @rune-langium/core

# CLI
pnpm add -D @rune-langium/cli

# LSP server (for editor integrations)
pnpm add @rune-langium/lsp-server

# Code generators
pnpm add -D @rune-langium/codegen
```

## Try the Studio

```bash
git clone https://github.com/pradeepmouli/rune-langium.git
cd rune-langium
pnpm install
pnpm dev:studio
```
