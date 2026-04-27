---
name: rune-langium
description: "Use when working with rune-langium (core, cli, lsp-server, codegen, visual-editor)."
---
# rune-langium

**Use this skill for ANY work with rune-langium.** It routes to the correct package.

## When to Use

Use this router when:
- Documentation site for rune-langium
- Documentation site for rune-langium
- Documentation site for rune-langium
- Documentation site for rune-langium
- Documentation site for rune-langium

## Decision Tree

1. Documentation site for rune-langium? → `rune-langium-core`
2. Documentation site for rune-langium? → `rune-langium-cli`
3. Documentation site for rune-langium? → `rune-langium-lsp-server`
4. Documentation site for rune-langium? → `rune-langium-codegen`
5. Documentation site for rune-langium? → `rune-langium-visual-editor`

## Routing Logic

### core → `rune-langium-core`

- Validating a single `.rosetta` file or snippet in memory
- Building a parse pipeline in a Node.js script
- Unit-testing grammar rules in isolation

Key APIs: `RuneDslAstReflection`, `RuneDslScopeProvider`, `RuneDslValidator`, `isAnnotation`, `isAnnotationDeepPath`

### cli → `rune-langium-cli`

### lsp-server → `rune-langium-lsp-server`

- Embedding a Rune DSL language server in a web application via WebSocket
- Running a standalone LSP server process bridging to a VS Code / Theia client
- Integration-testing LSP features (hover, completion, diagnostics)

Key APIs: `createRuneLspServer`, `createConnectionAdapter`

### codegen → `rune-langium-codegen`

Key APIs: `GeneratorError`, `generate`

### visual-editor → `rune-langium-visual-editor`

- Rendering two or more `RuneTypeGraph` components simultaneously (different namespaces, split-pane editors, etc.)
- Writing tests that need an isolated store per test case

Key APIs: `DetailPanel`, `TypeSelector`, `getKindBadgeClasses`

## Anti-Rationalization

| Thought | Reality |
|---------|---------|
| "I'll just use core for everything" | core is for documentation site for rune-langium. Parsing files that have cross-references to other documents — unresolved references will have `ref === undefined`. Use `parseWorkspace()` instead. |
| "I'll just use lsp-server for everything" | lsp-server is for documentation site for rune-langium. Parsing `.rosetta` files in a script — use `createRuneDslServices()` and `parse()` / `parseWorkspace()` instead (no LSP overhead). |
| "I'll just use visual-editor for everything" | visual-editor is for documentation site for rune-langium. You only need a single graph — use the pre-created `useEditorStore` singleton. |

## Example Invocations

User: "I need to documentation site for rune-langium"  
→ Load `rune-langium-core`

User: "I need to documentation site for rune-langium"  
→ Load `rune-langium-cli`

User: "I need to documentation site for rune-langium"  
→ Load `rune-langium-lsp-server`

User: "I need to documentation site for rune-langium"  
→ Load `rune-langium-codegen`

User: "I need to documentation site for rune-langium"  
→ Load `rune-langium-visual-editor`

## NEVER

- NEVER load all package skills simultaneously — pick the one matching your task
- If your task spans multiple packages, load the foundational one first (typically core/shared), then the specific one
