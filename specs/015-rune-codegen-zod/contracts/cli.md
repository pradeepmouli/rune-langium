# Contract — `rune-codegen` CLI

**Binary**: `rune-codegen` (registered in `packages/codegen/package.json`
under `"bin": { "rune-codegen": "./dist/bin/rune-codegen.js" }`).
**Spec hooks**: FR-001, FR-015, FR-016, FR-025, SC-001.

---

## Synopsis

```
rune-codegen [options] <input...>
```

`<input...>` is one or more `.rune` file paths or a directory. When a
directory is given, all `.rune` files under it are discovered
recursively. Relative paths are resolved from `cwd`.

---

## Flags

| Flag | Short | Type | Default | Description |
|------|-------|------|---------|-------------|
| `--target` | `-t` | `'zod' \| 'json-schema' \| 'typescript'` | `'zod'` | Which emitter target to use. |
| `--output` | `-o` | `string` | `./generated` | Output directory root. `relativePath` from each `GeneratorOutput` is joined to this path. |
| `--watch` | `-w` | `boolean` | `false` | Watch mode: re-generate whenever any input file changes. Uses Node.js `fs.watch` on the input directory/files. Exit via Ctrl-C. |
| `--strict` | | `boolean` | `false` | Treat any generator-time error diagnostic as a fatal error. Exits non-zero immediately; no partial output is written. |
| `--json` | | `boolean` | `false` | Emit machine-readable JSON to stdout instead of human-readable progress output. See stdout format below. |
| `--version` | `-v` | | | Print `rune-codegen <version>` and exit 0. |
| `--help` | `-h` | | | Print usage and exit 0. |

---

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Generation succeeded; all output written; no error diagnostics (or `--strict` was not set and errors were non-fatal). |
| `1` | One or more error diagnostics with `--strict`; OR input files not found; OR an unexpected runtime exception. |
| `2` | Usage error (unknown flag, invalid `--target` value, no input given). |

---

## Stdout / stderr conventions

### Default (human-readable) mode

```
rune-codegen: generating 'zod' for 3 documents...
  ✓ cdm/base/math.zod.ts
  ✓ cdm/base/types.zod.ts
  ✓ cdm/product/rates.zod.ts
rune-codegen: done (0 errors, 0 warnings) in 1.23s
```

Errors print to **stderr**:

```
rune-codegen: error in model.rune:42:8 [unknown-attribute]
  Condition "OneOf" references attribute "partyX" which does not exist on type "Party"
```

Warnings print to **stderr** with `warning:` prefix.

Progress output (file names as they are written) goes to **stdout**.

### JSON mode (`--json`)

```json
{
  "target": "zod",
  "durationMs": 1230,
  "files": [
    { "relativePath": "cdm/base/math.zod.ts", "diagnostics": [] }
  ],
  "diagnostics": [],
  "success": true
}
```

The schema is closed: exactly `target`, `durationMs`, `files`,
`diagnostics`, `success`. Callers MUST NOT rely on additional fields.
`diagnostics` at the top level aggregates all diagnostics across all
output files (deduped by `{sourceUri, line, char, code}`).

---

## Watch mode behaviour

```
rune-codegen --watch src/ -o generated/
rune-codegen: watching src/ for changes...
[10:42:01] change detected: src/model.rune
[10:42:01] rune-codegen: generating 'zod' for 1 documents...
  ✓ cdm/base/math.zod.ts
[10:42:01] rune-codegen: done (0 errors) in 0.45s
^C
rune-codegen: stopped.
```

In watch mode:
- The initial generation runs on startup.
- Each file-change event triggers a fresh `generate()` call on the
  affected document (and any documents that import from it, resolved
  transitively).
- On error: the failing file's error diagnostic is printed to stderr;
  the last-successful output is NOT overwritten (matches FR-017's
  last-known-good semantics for the Studio).
- SIGINT / SIGTERM exits cleanly (exit code 0).

---

## `--target` values

| Value | Output extension | Validates against |
|-------|-----------------|------------------|
| `zod` | `*.zod.ts` | `tsc --noEmit` + Zod 4 parse test |
| `json-schema` | `*.schema.json` | JSON Schema 2020-12 meta-schema |
| `typescript` | `*.ts` | `tsc --noEmit` (no Zod import) |

Invalid `--target` values print an error to stderr and exit 2:

```
rune-codegen: error: unknown target 'scala'. Expected: zod, json-schema, typescript.
```

---

## Example invocations

```sh
# Basic Zod generation (default target)
pnpm rune-codegen src/models/ -o generated/

# JSON Schema target, explicit
pnpm rune-codegen src/models/ --target json-schema -o generated/

# Full TypeScript class target, strict mode
pnpm rune-codegen src/models/ --target typescript --strict -o generated/

# Watch mode during development
pnpm rune-codegen src/models/ --watch -o generated/

# CI pipeline: JSON output for downstream parsing
pnpm rune-codegen src/models/ --json > codegen-result.json
```

---

## `package.json` bin registration

```jsonc
// packages/codegen/package.json
{
  "bin": {
    "rune-codegen": "./dist/bin/rune-codegen.js"
  }
}
```

When installed as a workspace dep, `pnpm rune-codegen` (from the
root) or `pnpm exec rune-codegen` (from a filter) resolves the binary.
For end-users installing the package from npm:
`npx rune-codegen` works after `npm install @rune-langium/codegen`.
