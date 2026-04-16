# Types & Enums

## Codegen

### `CodeGenerationRequest`
Request to generate code from one or more Rune DSL model files.
**Properties:**
- `language: string` — Target language (e.g., "scala", "typescript", "kotlin"). See KNOWN_GENERATORS.
- `files: { path: string; content: string }[]` — `.rosetta` files with absolute path and content, including all dependency namespaces.
- `options: Record<string, string>` (optional) — Generator-specific options forwarded to the JVM generator as key-value pairs.

### `CodeGenerationResult`
Result of a code generation run.
**Properties:**
- `language: string` — Target language used
- `files: GeneratedFile[]` — Output code files
- `errors: GenerationError[]` — Errors encountered during generation (may coexist with partial output).
- `warnings: string[]` — Non-fatal warnings

### `GeneratedFile`
A single generated output file.
**Properties:**
- `path: string` — Output file path relative to the output directory (e.g., `"com/rosetta/model/MyType.java"`).
- `content: string` — Generated source code content.

### `GenerationError`
An error encountered during code generation for a specific DSL construct.
**Properties:**
- `sourceFile: string` — `.rosetta` file that caused the error
- `construct: string` — DSL construct that failed (e.g., type name or function name)
- `message: string` — Error description

### `GeneratorInfo`
Metadata about a known code generator.
**Properties:**
- `id: string` — Generator identifier used in the CLI and API (e.g., `"java"`, `"scala"`).
- `label: string` — Human-readable label for display (e.g., `"Scala"`).
