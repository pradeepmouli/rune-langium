# rune-langium: @zod-to-form adoption

## Prerequisites

Two upstream packages have been enhanced and are now complete:

| Package | Spec | Status |
|---|---|---|
| `langium-zod` | `002-rune-dsl-enhancements` | All phases complete (T001–T045 `[x]`) |
| `@zod-to-form` | `002-zodform-rune-integration` | Phases 1–5 complete; Phase 6 polish open |

**`langium-zod` additions now available:**
- `--strip-internals` — removes `$container`, `$cstNode`, `$document`, `$containerProperty`, `$containerIndex` from every schema
- `--projection <file>` — picks specific fields per type using a JSON config
- `--include <csv>` / `--exclude <csv>` — filter which grammar types are generated
- `--cross-ref-validation` — emits `create*Schema(refs)` factories and `*SchemaRefs` interfaces; `zRef()` always exported
- `--conformance --ast-types <path>` — generates a `.conformance.ts` file with bidirectional assignability checks against `ast.ts`

This spec covers the changes needed inside `rune-langium` to adopt both sets of enhancements.
The existing hand-written form components (`DataTypeForm`, `EnumForm`, etc.) are **not
replaced** by this work — the scope is wiring the toolchain so generated forms are a viable
alternative going forward.

---

## Change 0: Generate form-surface schemas via `langium-zod`

**Why**: instead of hand-authoring `src/schemas/form-schemas.ts`, drive `langium-zod` to generate it from the Rune DSL grammar directly. This gives form schemas that stay in sync with the grammar as it evolves, include cross-ref validation factories, and can be verified against `ast.ts` at compile time.

### Projection config

**`packages/visual-editor/form-surfaces.json`** — specifies which fields each form needs:

```json
{
  "defaults": {
    "strip": ["$container", "$document", "$cstNode", "$containerProperty", "$containerIndex"]
  },
  "types": {
    "Data": {
      "fields": ["name", "superType", "description", "attributes"]
    },
    "RosettaEnumeration": {
      "fields": ["name", "superEnum", "enumValues"]
    },
    "Attribute": {
      "fields": ["name", "typeCall", "card"]
    },
    "RosettaFunction": {
      "fields": ["name", "outputType", "parameters"]
    },
    "ChoiceType": {
      "fields": ["name", "superType", "options"]
    }
  }
}
```

Adjust field names to match the actual Rune grammar (`superType`, `superEnum`, `typeCall`, etc.).

### Generate script

**`packages/visual-editor/package.json`** — add `generate:schemas` script:

```json
"generate:schemas": "langium-zod generate \
  --out src/generated/zod-schemas.ts \
  --projection form-surfaces.json \
  --cross-ref-validation \
  --conformance --ast-types src/generated/ast.ts"
```

This produces two files:
- `src/generated/zod-schemas.ts` — form-surface schemas with cross-ref factories
- `src/generated/zod-schemas.conformance.ts` — compile-time assignability checks

Both are checked into source control (deterministic from grammar + config inputs) and regenerated when the grammar or projection config changes. Add a comment header to suppress lint rules on the generated file if needed.

### Generated output shape

For a type with cross-reference fields (e.g., `RosettaEnumeration.superEnum`), the generator emits:

```typescript
// Static base schema — always emitted
export const RosettaEnumerationSchema = z.object({
  $type: z.literal('RosettaEnumeration'),
  name: z.string(),
  superEnum: z.string().optional(),   // cross-ref → factory adds .refine()
  enumValues: z.array(EnumValueSchema).min(1),
});

// Factory — emitted when --cross-ref-validation is set
export interface RosettaEnumerationSchemaRefs {
  RosettaEnumeration?: string[];  // valid superEnum targets
}

export function createRosettaEnumerationSchema(refs: RosettaEnumerationSchemaRefs = {}) {
  return RosettaEnumerationSchema.extend({
    superEnum: z.string()
      .refine(v => !v || !refs.RosettaEnumeration || refs.RosettaEnumeration.includes(v),
              { message: 'Unknown RosettaEnumeration type' })
      .optional(),
  });
}
```

### Acceptance criteria

- `pnpm generate:schemas` runs without error and writes `src/generated/zod-schemas.ts`
- Generated schemas contain only the projected fields (Langium internals absent)
- Types with `+=Rule+` cardinality emit `.min(1)` on the array
- Cross-ref fields get `create*Schema(refs)` factories and `*SchemaRefs` interfaces
- `tsc --noEmit` on `zod-schemas.conformance.ts` passes (schemas match `ast.ts`)
- Regenerating after a grammar field change causes a compile error in the conformance file

---

## Change 1: Add `/components` subpath export to `@rune-langium/visual-editor`

**Why**: `component-config.ts` uses `type VisualModule = typeof import('@rune-langium/visual-editor/components')` to give TypeScript the module shape for the `component: keyof T` constraint. Without a `/components` export in the package, TypeScript cannot resolve that import type.

The subpath is focused on form widgets — not the full graph editor API — so it's also a cleaner surface for external consumers who only need the widget components.

**`packages/visual-editor/package.json`** — add entry to `exports`:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  },
  "./components": {
    "types": "./dist/components.d.ts",
    "default": "./dist/components.js"
  },
  "./styles.css": "./dist/styles.css"
}
```

**`packages/visual-editor/src/components.ts`** — new file, re-exports form widgets:

```typescript
// @rune-langium/visual-editor/components
// Focused subpath for form widget components used by @zod-to-form component-config.
export { TypeSelector } from './components/editors/TypeSelector.js';
export { CardinalityPicker } from './components/editors/CardinalityPicker.js';
```

Add `./dist/components.{js,d.ts}` to the `files` array (or ensure the build picks it up).

### Acceptance criteria

- `import('@rune-langium/visual-editor/components')` resolves at runtime
- `typeof import('@rune-langium/visual-editor/components')` resolves in TypeScript with `TypeSelector` and `CardinalityPicker` as keys
- Existing `.` export is unchanged

---

## Change 2: Create `component-config.ts`

**Why**: maps rune-langium's custom field types (`cross-ref`, `cardinality`) to the widgets from `@rune-langium/visual-editor/components`, and declares which form fields use those field types. This file is consumed by both the `@zod-to-form/cli` scaffold and the `@zod-to-form/react` runtime renderer.

**`packages/visual-editor/component-config.ts`**:

```typescript
import type { ZodToFormComponentConfig } from '@zod-to-form/cli';

// Type alias — erased at compile time; jiti never sees it.
// Gives TypeScript the module shape so `component: keyof VisualModule` is checked.
type VisualModule = typeof import('@rune-langium/visual-editor/components');

export default {
  components: '@rune-langium/visual-editor/components',

  fieldTypes: {
    'cross-ref':   { component: 'TypeSelector' },
    'cardinality': { component: 'CardinalityPicker' },
  },

  fields: {
    // Data type parent (inherits from another Data type)
    'dataTypeForm.parentName':   { fieldType: 'cross-ref', props: { refType: 'Data' } },
    // Attribute type reference and cardinality
    'attributeForm.typeName':    { fieldType: 'cross-ref' },
    'attributeForm.cardinality': { fieldType: 'cardinality' },
    // Function output type
    'functionForm.outputType':   { fieldType: 'cross-ref' },
    // Enum parent
    'enumForm.parentName':       { fieldType: 'cross-ref', props: { refType: 'Enum' } },
    // Shared member schema (used by useFieldArray rows)
    'memberSchema.typeName':     { fieldType: 'cross-ref' },
    'memberSchema.cardinality':  { fieldType: 'cardinality' },
  },
} satisfies ZodToFormComponentConfig<VisualModule>;
```

The `fields` keys follow the `@zod-to-form` convention `{schemaVariableName}.{fieldPath}`, matching the **generated** schema variable names from `src/generated/zod-schemas.ts` (produced by Change 0). The exact field names depend on the Rune grammar (e.g., `superEnum`, `superType`, `typeCall`) — adjust to match the actual generated schema exports.

**Alternative: `defineComponentConfig` helper** — if the `satisfies` pattern becomes unwieldy with multiple schemas, use the typed helper exported from `@zod-to-form/cli`:

```typescript
import { defineComponentConfig } from '@zod-to-form/cli';
import type { EnumFormValues } from './src/schemas/form-schemas.js';

type VisualModule = typeof import('@rune-langium/visual-editor/components');

export default defineComponentConfig<VisualModule, EnumFormValues>({
  components: '@rune-langium/visual-editor/components',
  fieldTypes: { 'cross-ref': { component: 'TypeSelector' } },
  fields: { 'parentName': { fieldType: 'cross-ref', props: { refType: 'Enum' } } },
});
```

**Type relationship**: `ZodToFormComponentConfig<T>` (from `@zod-to-form/cli`) is the build-time typed form of the config. At runtime, `ZodForm` accepts `componentConfig?: RuntimeComponentConfig` (from `@zod-to-form/react`) — this is the same shape at the value level but without the generic `T` constraint. Since the runtime type is structurally identical, a `component-config.ts` typed with `ZodToFormComponentConfig<VisualModule>` can be passed directly as `RuntimeComponentConfig`.

**jiti safety**: the file contains only `import type`, a `type` alias (both erased), and an object literal of string values. jiti sees only strings.

### Acceptance criteria

- `@zod-to-form/cli` loads `component-config.ts` via jiti without errors
- `component: 'BadName'` that is not an export of `VisualModule` produces a TypeScript compile error
- `@zod-to-form/react` renderer resolves `TypeSelector` and `CardinalityPicker` from the string module path at runtime

---

## Change 3: Update `scaffold:forms` script

**Why**: add `--component-config` so the CLI emits `TypeSelector`/`CardinalityPicker` imports for cross-ref and cardinality fields instead of plain `<input>` elements; add `--mode auto-save` so generated forms emit `onValueChange` callbacks instead of submit-button handlers.

The input schema is the **generated** `src/generated/zod-schemas.ts` from Change 0, not a hand-authored file. Each `zodform generate` invocation targets one schema export.

**CLI signature** (each invocation generates one form component):

```bash
zodform generate \
  --schema <path>        \   # required — path to schema file
  --export <name>        \   # required — named export of the ZodObject schema
  --out <path>           \   # output directory or .tsx file path
  --mode auto-save       \   # omits submit button; emits onValueChange wiring
  --component-config <path>  # .json or .ts component config
```

**`packages/visual-editor/package.json`** — update script (one invocation per form schema):

```json
"generate:schemas": "langium-zod generate --out src/generated/zod-schemas.ts --projection form-surfaces.json --cross-ref-validation --conformance --ast-types src/generated/ast.ts",
"scaffold:forms": "pnpm scaffold:enumForm && pnpm scaffold:dataTypeForm",
"scaffold:enumForm": "zodform generate --schema src/generated/zod-schemas.ts --export RosettaEnumerationSchema --out src/components/forms/generated --mode auto-save --component-config component-config.ts",
"scaffold:dataTypeForm": "zodform generate --schema src/generated/zod-schemas.ts --export DataSchema --out src/components/forms/generated --mode auto-save --component-config component-config.ts"
```

The generated form output goes into `src/components/forms/generated/`. Both `src/generated/zod-schemas.ts` and the form components are checked in (deterministic from grammar + config). Regenerate with `pnpm generate:schemas && pnpm scaffold:forms` when the grammar or projection config changes.

**Note on export names**: `zodform generate` reads the named export as a `ZodObject`. Use the static base schema (e.g., `RosettaEnumerationSchema`), not the factory (`createRosettaEnumerationSchema`). The runtime wiring in Change 5 uses the factory for validation; the scaffold only needs the shape.

### Acceptance criteria

- `pnpm scaffold:forms` runs without error
- Generated files in `src/components/forms/generated/` include `import { TypeSelector } from '@rune-langium/visual-editor/components'` for fields matching `cross-ref` entries in the config
- Generated form components accept an `onValueChange` prop (from `--mode auto-save`)
- No submit button in generated output
- Fields not covered by the config fall back to standard `<input>` elements

---

## Change 4: Add `@zod-to-form/react` as a runtime dependency

**Why**: the generated form components `import { ZodForm } from '@zod-to-form/react'` — it must be a runtime dependency, not just a devDependency.

**`packages/visual-editor/package.json`**:

```json
"dependencies": {
  "@zod-to-form/react": "*",
  ...existing deps...
},
"devDependencies": {
  "@zod-to-form/cli": "*",    // scaffold script + component-config.ts typing
  ...existing devDeps...
}
```

### Acceptance criteria

- `@zod-to-form/react` resolves at build time and runtime
- Generated form components compile without unresolved import errors
- `@zod-to-form/cli` resolves in devDependencies for the scaffold script and `ZodToFormComponentConfig` type import

---

## Change 5: Wire `ZodForm` into existing form components

**Why**: make `ZodForm` the form-state and field-rendering layer inside the existing form components, replacing `useNodeForm` + `FormProvider` + manual `Controller` wrappers. The store-action callbacks remain unchanged.

### Current API (002-zodform-rune-integration — all Phases 1–5 complete)

```typescript
// ZodForm props — current implementation
type ZodFormProps<TSchema extends ZodObject> = {
  schema: TSchema;
  onSubmit?: (data: TSchema['_zod']['output']) => unknown;     // optional
  onValueChange?: (data: TSchema['_zod']['output']) => void;   // fires on valid, post-mount changes
  mode?: 'onSubmit' | 'onChange' | 'onBlur';                   // passed to react-hook-form
  defaultValues?: Partial<TSchema['_zod']['output']>;
  components?: Partial<typeof defaultComponentMap>;             // component name → React component
  componentConfig?: RuntimeComponentConfig;                     // from @zod-to-form/react
  formRegistry?: ZodFormRegistry;                               // field-level metadata/render overrides
  processors?: Record<string, FormProcessor>;
  className?: string;
  children?: ReactNode;   // rendered INSIDE FormProvider — useFormContext() works here
};

// RuntimeComponentConfig — from @zod-to-form/react (structurally same as ZodToFormComponentConfig)
type RuntimeComponentConfig = {
  components: string;
  fieldTypes: Record<string, RuntimeComponentEntry>;
  fields?: Partial<Record<string, RuntimeFieldOverride>>;
};
```

`ZodForm` wraps its output in `FormProvider`, so `children` can call `useFormContext()`, `useFieldArray`, etc.

**`onValueChange` semantics**: fires only when `info?.name` is present (user-initiated, not on mount) and `schema.safeParse(values)` succeeds (valid state only). No emission at initial mount even with valid `defaultValues`.

### MapFormRegistry helper

The library does not provide a concrete registry class — consumers create one. A reusable helper:

**`packages/visual-editor/src/components/forms/MapFormRegistry.ts`**:

```typescript
import type { ZodFormRegistry, FormMeta } from '@zod-to-form/core';
import type { ZodType } from 'zod';

export class MapFormRegistry implements ZodFormRegistry {
  private map = new Map<ZodType, FormMeta>();
  add(schema: ZodType, meta: FormMeta): this {
    this.map.set(schema, meta);
    return this;
  }
  get(schema: ZodType): FormMeta | undefined { return this.map.get(schema); }
  has(schema: ZodType): boolean { return this.map.has(schema); }
}
```

### ExternalDataSync pattern

`ZodForm` does not replicate `useNodeForm`'s `keepDirtyValues` reset-on-external-change. A child component restores this:

```tsx
function ExternalDataSync<T>({ data, toValues }: { data: unknown; toValues: () => T }) {
  const form = useFormContext<T>();
  const prevRef = useRef(data);
  useEffect(() => {
    if (prevRef.current !== data) {
      prevRef.current = data;
      form.reset(toValues(), { keepDirtyValues: true });
    }
  }, [data, form, toValues]);
  return null;
}
```

### Migration pattern for `EnumForm`

`EnumForm` is the migration target (fewest dependencies).

**Schema scoping**: only `name` and the cross-ref parent field are tracked in form state for auto-save. The `enumValues` array is managed directly through store callbacks (append/remove/reorder commit immediately) — it does NOT need to be part of the form's Zod schema. Including it would cause ZodForm to render a default `ArrayBlock`; excluding it is cleaner since no auto-save is needed on the array.

**Using the cross-ref factory from Change 0**: `createRosettaEnumerationSchema(refs)` provides runtime cross-ref validation for the parent field. The schema is narrowed to the auto-save fields and memoized so `zodResolver` gets a stable reference:

```typescript
import {
  RosettaEnumerationSchema,
  createRosettaEnumerationSchema,
} from '../../generated/zod-schemas.js';

// Narrow to auto-save fields; use factory for parent cross-ref validation
const enumCoreSchema = useMemo(
  () =>
    createRosettaEnumerationSchema({ RosettaEnumeration: validParentNames })
      .pick({ name: true, superEnum: true }),   // adjust field name to match grammar
  [validParentNames]
);
type EnumCoreValues = z.infer<typeof enumCoreSchema>;
```

`validParentNames` comes from the store (list of enum names in the model); when it changes (undo/redo, new type added) the schema refreshes and `ExternalDataSync` resets the form.

The `formRegistry` configures TypeSelector for the parent field:

```typescript
const formRegistry = new MapFormRegistry();
// enumCoreSchema.shape key must match the actual grammar field name (e.g., superEnum)
formRegistry.add(enumCoreSchema.shape.superEnum, {
  render: (_field, props) => {
    const p = props as { value: string; onChange: (v: string) => void };
    return (
      <TypeSelector
        value={p.value}
        options={parentOptions}
        onSelect={(v) => {
          p.onChange(v);                         // update form state (triggers onValueChange)
          actions.setEnumParent(nodeId, v);      // update store immediately
        }}
        placeholder="Select parent enum..."
        allowClear
      />
    );
  }
});
```

The `EnumValuesList` child accesses `control` from the shared `FormProvider` via `useFormContext`. Since `enumValues` is not in `enumCoreSchema`, `useFieldArray` manages the array state independently of Zod schema validation:

```tsx
function EnumValuesList({ nodeId, actions }) {
  const { control } = useFormContext();  // enumValues path not in enumCoreSchema — fine
  const { fields, append, remove, move } = useFieldArray({ control, name: 'enumValues' });
  // ... add/remove/reorder callbacks commit to store directly ...
}
```

Full `EnumForm` shape:

```tsx
<ZodForm
  schema={enumCoreSchema}                            // memoized factory result, narrowed
  defaultValues={{ name: data.name, superEnum: data.superEnum }}
  onValueChange={handleNameParentCommit}             // debounced auto-save; valid only; post-mount only
  mode="onChange"
  formRegistry={formRegistry}
  componentConfig={componentConfig}                  // resolves TypeSelector via config
  className="flex flex-col gap-4 p-4"
>
  <ExternalDataSync
    data={data}
    toValues={() => ({ name: data.name, superEnum: data.superEnum })}
  />
  <EnumValuesList nodeId={nodeId} actions={actions} />
  <InheritedMembersSection groups={inheritedGroups} />
  <AnnotationSection ... />
  <MetadataSection ... />   {/* direct store callbacks — not in form state */}
</ZodForm>
```

`handleNameParentCommit` applies the 500ms debounce (via `useAutoSave`) and commits `name`/`superEnum` changes to the store. Invalid states (e.g., typing a parent that doesn't exist) are suppressed by the factory's `.refine()` — `onValueChange` only fires when the schema parses successfully.

**Migration order**: `EnumForm` → `ChoiceForm` → `DataTypeForm` → `FunctionForm`. The `MapFormRegistry` and `ExternalDataSync` utilities are shared across all migrations. Adjust field names (`superType`, `superEnum`, `typeCall`, etc.) to match the Rune grammar as confirmed from the generated schemas.

### Acceptance criteria

- `MapFormRegistry` is importable from `packages/visual-editor/src/components/forms/`
- At least one form (`EnumForm`) renders via `ZodForm` and behaves identically to the hand-written version
- `TypeSelector` renders for the parent field via `formRegistry` `render` override
- `EnumValuesList` uses `useFieldArray({ control, name: 'enumValues' })` from the shared `FormProvider`
- Name/parent changes auto-save via `onValueChange` with 500 ms debounce; parent also commits immediately via `onSelect`
- `onValueChange` is NOT called on initial mount, only after valid user-initiated changes
- Typing an unknown parent name does NOT trigger `onValueChange` (blocked by `createRosettaEnumerationSchema` refine)
- External data changes (undo/redo) reset the form via `ExternalDataSync` with `keepDirtyValues`
- No regressions in hand-written forms (they coexist until fully migrated)

---

## Summary

| Change | File(s) | Depends on |
|---|---|---|
| 0. Generate form-surface schemas | `package.json`, `form-surfaces.json` | `langium-zod` 002 (complete) |
| 1. `/components` subpath | `package.json`, `src/components.ts` | — |
| 2. `component-config.ts` | `component-config.ts` | Change 0 (field names); Change 1 |
| 3. `scaffold:forms` update | `package.json` | Changes 0 & 2; `zod-to-form` 002 Phases 3–5 |
| 4. `@zod-to-form/react` dep | `package.json` | `zod-to-form` 002 Phases 4–5 |
| 5. `ZodForm` wiring | form component files | Changes 0, 1–4 |

Changes 0–4 are mechanical and low-risk. Change 5 is the integration point and should be done incrementally by form type.

### End-to-end pipeline (once all changes are done)

```
rune.langium grammar
  → [langium-zod generate --projection form-surfaces.json --cross-ref-validation --conformance]
  → src/generated/zod-schemas.ts     (form-surface schemas with create*Schema factories)
  → src/generated/zod-schemas.conformance.ts  (compile-time drift detection)
  → [zodform generate --schema src/generated/zod-schemas.ts --export XxxSchema --mode auto-save --component-config component-config.ts]
  → src/components/forms/generated/XxxForm.tsx  (auto-save, TypeSelector wired for cross-ref fields)
  → developer tunes layout, adds EnumValuesList child, passes createXxxSchema(refs) at runtime
```
