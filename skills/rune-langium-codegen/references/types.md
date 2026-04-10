# Types & Enums

## types

### `CodeGenerationRequest`
Request to generate code from Rune DSL model files.
**Properties:**
- `language: string` — Target language (e.g., "java", "python", "scala", "csharp")
- `files: { path: string; content: string }[]` — .rosetta files with path and content
- `options: Record<string, string>` (optional) — Generator-specific options

### `CodeGenerationResult`
Result of a code generation run.
**Properties:**
- `language: string` — Target language used
- `files: GeneratedFile[]` — Output code files
- `errors: GenerationError[]` — Errors encountered during generation
- `warnings: string[]` — Non-fatal warnings

### `GeneratedFile`
A single generated output file.
**Properties:**
- `path: string` — Output file path (e.g., "com/rosetta/model/MyType.java")
- `content: string` — Generated source code

### `GenerationError`
Error encountered during code generation for a specific construct.
**Properties:**
- `sourceFile: string` — .rosetta file that caused the error
- `construct: string` — DSL construct that failed
- `message: string` — Error description

### `GeneratorInfo`
Metadata about a known code generator.
**Properties:**
- `id: string` — Generator identifier (e.g., "java", "scala")
- `label: string` — Human-readable label
