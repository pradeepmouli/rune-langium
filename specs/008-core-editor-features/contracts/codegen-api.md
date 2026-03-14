# Contract: Code Generation API

**Scope**: Public API for exporting Rune DSL models via rosetta-code-generators.

## CLI Command

### `rune-dsl generate`

```
rune-dsl generate --language <lang> --input <paths...> --output <dir> [--generator-opts <json>]
```

**Arguments**:
- `--language, -l` — Target language (required). Values: java, python, scala, csharp, etc.
- `--input, -i` — .rosetta file paths or directories (required)
- `--output, -o` — Output directory for generated code (required)
- `--generator-opts` — JSON string of generator-specific options
- `--list-languages` — List available code generators and exit
- `--json` — Output results as JSON

**Exit codes**: 0 = success, 1 = generation errors, 2 = invalid input

**JSON output** (when `--json`):
```json
{
  "language": "java",
  "files": [{ "path": "com/rosetta/MyType.java", "size": 1234 }],
  "errors": [{ "sourceFile": "model.rosetta", "construct": "...", "message": "..." }],
  "warnings": ["..."]
}
```

## Service API (for Studio integration)

### `POST /api/generate`

**Request**:
```json
{
  "language": "java",
  "files": [{ "path": "model.rosetta", "content": "..." }],
  "options": {}
}
```

**Response** (200):
```json
{
  "files": [{ "path": "com/rosetta/MyType.java", "content": "..." }],
  "errors": [],
  "warnings": []
}
```

**Response** (422): Validation errors in input model.
**Response** (400): Unknown language or invalid request.
