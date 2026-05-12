---
description: Documentation site and generated agent skills for rune-langium APIs
name: rune-langium-codegen
---

# @rune-langium/codegen

Documentation site and generated agent skills for rune-langium APIs

Use `generate()` when you need emitted files for a concrete target, and
`generatePreviewSchemas()` when UI tooling needs structured field metadata and
source maps for a selected data type. This package expects parsed Langium
documents from `@rune-langium/core`.

## Configuration

2 configuration interfaces — see references/config.md for details.

## Quick Reference

**codegen/src:** `generate` (Generate code from one or more parsed Langium documents), `generatePreviewSchemas` (Generate structured form-preview schemas from one or more parsed Langium documents)
**types:** `GeneratorError` (Thrown when strict mode is enabled and any error diagnostic is produced), `FormPreviewKind`, `FormPreviewSchema`, `GeneratorOutput` (One emitted output file from the generator), `GeneratorDiagnostic` (A generator-time diagnostic (not a Langium validation diagnostic)), `PreviewField`, `PreviewFieldKind`, `PreviewSourceMapEntry`, `SourceMapEntry` (One source-map entry: maps an output line back to a source location), `Target` (The three supported generator targets), `GeneratedFunc` (Metadata for a single emitted Rune `func` (TypeScript target only)), `RuneTypeAlias`, `Condition`, `TypeParam`, `RuneRule`, `RuneReport`, `RuneAnnotationDecl`, `AnnotationAttribute`, `RuneLibraryFunc`, `LibraryFuncParam`
**emit:** `NamespaceManifest`, `NamespaceRegistry`
**helpers:** `RUNTIME_HELPER_JS_SOURCE` (Plain JavaScript equivalent of `RUNTIME_HELPER_SOURCE` — no type annotations)

## References

Load these on demand — do NOT read all at once:

- When calling any function → read `references/functions.md` for full signatures, parameters, and return types
- When using a class → read `references/classes.md` for properties, methods, and inheritance
- When defining typed variables or function parameters → read `references/types.md`
- When using exported constants → read `references/variables.md`
- When configuring options → read `references/config.md` for all settings and defaults

## Links

- Author: Pradeep Mouli <pmouli@mac.com> (https://github.com/pradeepmouli)