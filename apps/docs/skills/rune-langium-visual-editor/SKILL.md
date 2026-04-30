---
name: rune-langium-visual-editor
description: "Documentation site and generated agent skills for rune-langium APIs Use when: Rendering two or more `RuneTypeGraph` components simultaneously (different...."
---

# @rune-langium/visual-editor

Documentation site and generated agent skills for rune-langium APIs

Use `RuneTypeGraph` for an interactive type graph, the exported panel and
editor components for custom shells, and the store/layout helpers when you
need to embed the editor in a larger application.

## When to Use

**Use this skill when:**
- Rendering two or more `RuneTypeGraph` components simultaneously (different namespaces, split-pane editors, etc.)
- Writing tests that need an isolated store per test case

**Do NOT use when:**
- You only need a single graph — use the pre-created `useEditorStore` singleton.

API surface: 49 functions, 62 types, 10 constants

## Configuration

6 configuration interfaces — see references/config.md for details.

## Quick Reference

**Key functions:** `createEditorStore` (Create an isolated zustand editor store instance)

*121 exports total — see references/ for full API.*

## References

Load these on demand — do NOT read all at once:

- When calling any function → read `references/functions.md` for full signatures, parameters, and return types
- When defining typed variables or function parameters → read `references/types.md`
- When using exported constants → read `references/variables.md`
- When configuring options → read `references/config.md` for all settings and defaults

## Links

- Author: Pradeep Mouli <pmouli@mac.com> (https://github.com/pradeepmouli)