# @rune-langium/core

> Parse `.rosetta` files into typed ASTs, build cross-file workspaces, and serialize models back to source text.

Core parsing, AST, and serialization utilities for Rune DSL / Rosetta tooling.

## Features

- Parse single files with `parse`
- Parse related document sets with `parseWorkspace`
- Access raw Langium services with `createRuneDslServices`
- Render an AST back to `.rosetta` source via `renderModel` / `renderNode` from `@rune-langium/codegen/rosetta` (the JSON `serialize` path stays in core's `JsonSerializer`)
