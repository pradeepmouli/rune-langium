# Types & Enums

## types

### `GenerationTarget`
A single (schema, variant, config) triple that produces exactly one
generated form. The cache key space.

Discriminated on `sourceKind`: query-mode targets carry a user-named
variant (or empty string for the default), while generate-mode targets
use the reserved `__generate_<n>` prefix. Encoding the prefix in the
type system prevents accidentally crossing the streams.
```ts
GenerationTargetBase & { sourceKind: "query"; variant: string } | GenerationTargetBase & { sourceKind: "generate"; variant: `__generate_${string}` }
```

### `CompilationEntry`
One cached compilation result. The cache stores entries keyed by
`${schemaFile}::${variant}::${configHash}`.
**Properties:**
- `target: GenerationTarget` — The triple that produced this entry.
- `generatedSource: string` — The `.tsx` source emitted by `generateFormComponent`.
- `schemaLiteSource: string | null` — The companion `.lite.ts` source emitted by `generateSchemaLiteFile`,
or `null` if the walk produced no top-level effects.
- `sourceMap: unknown` — Reserved for a future sourcemap back to the original schema.
- `emittedAt: number` — `Date.now()` at compile time. Used for debug logging and HMR ordering.

### `GenerateSite`
A single `<ZodForm>` JSX element matched by generate mode.
Lives only during a single `transform` call — not persisted.
**Properties:**
- `sourceFile: string` — Absolute path to the source file containing the matched `<ZodForm>` site.
- `range: { start: number; end: number }` — Byte range of the original `<ZodForm>` element in the source file.
- `schemaFile: string` — Absolute path to the schema file the `schema={X}` identifier resolves to.
- `exportName: string` — Export name of the identifier in the schema module.
- `generatedIdentifier: string` — Local identifier that replaces `ZodForm` at this call site.
Unique within the source file.
- `variant: string` — Synthesized variant name for cache keying. Always `__generate_<n>` where
`<n>` is a per-source-file counter.

### `HMRInvalidationMap`
The graph edges that `handleHotUpdate` walks when a watched file changes.

Built incrementally as the plugin sees `resolveId` / `load` / `transform`
calls. Reset on dev server restart.
**Properties:**
- `schemaToTargets: Map<string, Set<string>>` — For each schema file, the set of cache keys depending on it.
- `schemaToImporters: Map<string, Set<string>>` — For each schema file, the set of Vite module ids that import it.
- `targetToImporters: Map<string, Set<string>>` — For each cache entry, the set of modules that import its virtual id.
- `configWatchers: Set<string>` — All modules that depend on the config (for config-change fan-out).

## errors

### `Z2FViteErrorCode`
Plugin error classes.

Every plugin error carries a stable `code` string and an optional `location`
(file path + line/column). Codes are part of the public contract — see
`specs/007-vite-codegen-plugin/contracts/plugin-options.md`.

Errors are recoverable during `vite dev` (the plugin catches and reports
them via the dev server's error collector without crashing). On `vite build`
they propagate normally and abort the build.
```ts
"Z2F_VITE_CONFIG_NOT_FOUND" | "Z2F_VITE_CONFIG_INVALID" | "Z2F_VITE_SCHEMA_NOT_FOUND" | "Z2F_VITE_SCHEMA_OUTSIDE_ROOT" | "Z2F_VITE_SCHEMA_NOT_ZOD" | "Z2F_VITE_AMBIGUOUS_EXPORT" | "Z2F_VITE_UNKNOWN_VARIANT" | "Z2F_VITE_QUERY_COMPOSITION_UNSUPPORTED" | "Z2F_VITE_INVALID_VARIANT_NAME" | "Z2F_VITE_CODEGEN_FAILURE" | "Z2F_VITE_GENERATE_PARSE_ERROR" | "Z2F_VITE_WOULD_CLOBBER_FILE" | "Z2F_VITE_INVALID_OPTIONS" | "Z2F_VITE_NOT_IMPLEMENTED" | "Z2F_VITE_RESOLVER_STRIP_FAILED"
```

## Errors

### `Z2FViteErrorLocation`
Source location attached to a `Z2FViteError` for IDE navigation and Vite overlay display.
All properties are optional — only `file` is always available; `line`/`column` require
parse-time or AST-level context.
**Properties:**
- `file: string` (optional) — Absolute or project-relative file path where the error originated.
- `line: number` (optional) — 1-based line number within `file`, when available.
- `column: number` (optional) — 0-based column offset within the line, when available.
