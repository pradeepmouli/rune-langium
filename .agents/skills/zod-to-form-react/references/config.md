# Configuration

## FieldConfig

Per-field configuration that customises how a Zod schema field is rendered.

Merges base options (component override, visibility, order, props) with type-aware
extras: nested `fields` for object schemas, and `arrayItems` for array schemas.
Use this type when annotating a `ZodFormsConfig.fields` record or a per-schema
`schemas.[key].fields` map.

## WalkOptions

### Properties

#### formRegistry

Custom form registry for metadata annotations

**Type:** `ZodFormRegistry`

#### processors

Custom processors to add or override built-in ones

**Type:** `Record<string, FormProcessor<$ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>>>`

#### maxDepth

Maximum recursion depth for lazy/recursive schemas (default: 5)

**Type:** `number`

#### optimization

Validation optimization settings.

This is the walker's API surface — callers (useZodForm, CLI codegen) pass
the optimization config here. The CLI reads `config.defaults.optimization`
and forwards it; useZodForm accepts it via its own options. Both converge
here as the single source of truth for the walker.

**Type:** `{ level: 1 | 2 | 3; optimizers?: Record<string, FormOptimizer[]> }`

## RuntimeComponentConfig

### Properties

#### components

Component source and optional per-component overrides.
`source` is used by CLI codegen to emit a static import statement (not used at runtime).
`overrides` maps component names to `ComponentOverride` metadata (controlled, props, etc.).

**Type:** `{ source: string; overrides?: Record<string, ComponentOverride> }`

**Required:** yes

#### componentModule

The pre-imported components module object, e.g. `import * as myComponents from './components'`.
Used to resolve component functions by name at runtime.
Section components are also resolved from this module.

**Type:** `Record<string, unknown>`

#### fields



**Type:** `Record<string, FieldConfig>`