# Configuration

## PluginOptions

Plugin options passed to `z2fVite(options)`. Every field is optional;
the bare `z2fVite()` invocation produces a working plugin.

Pass this to `z2fVite()` in your `vite.config.ts`. Only known keys are
accepted — unknown keys throw `Z2F_VITE_INVALID_OPTIONS` at startup.

### Properties

#### configPath

Path to `z2f.config.{ts,js,mjs}`. Auto-discovered from the Vite root
if undefined.

**Type:** `string`

#### configOverride

Shallow override merged on top of the loaded config.

**Type:** `Partial<Z2FViteConfig>`

#### generate

Generate mode: scan JSX source for `<ZodForm>` elements and replace
statically resolvable call sites with generated form components at
build time. The name mirrors the CLI's `zod-to-form generate`
command — it's the same codegen, driven by static analysis of your
JSX instead of explicit CLI invocation.

**OFF by default** (FR-024): generate mode silently changes compiled
output for code the developer didn't explicitly annotate, so it is a
deliberate opt-in. Presence of this object (even empty `{}`) enables
it; omit the field entirely to keep it off. This avoids the invalid
state where `include` is set but the mode is disabled.

**Type:** `{ include?: string[]; exclude?: string[] }`

#### write

Optional opt-in to emit generated files to disk.

**Type:** `WriteOptions`

#### logLevel

Plugin-specific log level. Independent of Vite's log level.

**Type:** `"silent" | "warn" | "info" | "debug"`

### Use when
- Pointing the plugin to a non-standard config file path (`configPath`)
- Enabling generate mode to rewrite `<ZodForm>` call sites at build time (`generate`)
- Overriding config programmatically without a `z2f.config.ts` (`configOverride`)
- Adjusting diagnostic verbosity (`logLevel`)

### NEVER
- NEVER set `generate: {}` in production without auditing what files it matches — by default it targets all `**/*.{ts,tsx,js,jsx}` and rewrites every `<ZodForm>` call site it can statically resolve, which changes compiled output the developer didn't explicitly annotate
- NEVER pass unknown option keys — the plugin validates the options object at startup and throws `Z2F_VITE_INVALID_OPTIONS` for any unrecognized key

## Z2FViteConfig

The full config the Vite plugin operates on: a base `CodegenConfig`
plus optional per-variant overrides.

`exportName` is relaxed to optional at the plugin boundary — the plugin
auto-detects a single Zod schema export when the user omits it, and
throws `Z2F_VITE_AMBIGUOUS_EXPORT` on ambiguity. The codegen package
still requires it, and the plugin promotes the resolved name before
invoking codegen.

Place this in `z2f.config.ts` as a default export. The plugin auto-discovers
that file from the Vite root (searches `z2f.config.{ts,mts,js,mjs}` in order).
Use `defineConfig` from `@zod-to-form/core` for type-safe config authoring.

### Use when
- Centralizing form generation options for all `?z2f` imports in a project
- Applying a consistent UI preset (shadcn/html) and field overrides across forms

### NEVER
- NEVER place `z2f.config.ts` outside the Vite root — the auto-discovery only searches `resolvedConfig.root` and will silently fall back to defaults if the file is not found
- NEVER export an async function as the config default — only plain objects are supported; async evaluation is not handled by `ssrLoadModule`

## VariantConfigs

Variant overrides keyed by the `?z2f=<name>` query value.
Per-variant settings merge on top of the global `CodegenConfig`.

### Use when
- You need different generated form styles for the same schema (e.g. `?z2f=mobile` vs `?z2f=desktop`)
- You want variant-specific UI presets or component overrides without separate schema files

## WriteOptions

Optional disk-write settings. When omitted, generated forms are served
as virtual modules only (no files written).

### Properties

#### outDir

Directory for emitted files. If undefined, write each generated file
beside its source schema.

**Type:** `string`

#### filenamePattern

File naming pattern with substitution tokens.
Default: `'{schemaBasename}.{variant}.generated.tsx'`.

**Type:** `string`