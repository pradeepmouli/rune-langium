# rune-langium: @zod-to-form adoption

**Prerequisite**: changes described in `zod-to-form-enhance.md` have been implemented in
`@zod-to-form` `002-zodform-rune-integration`. All Phases 1–5 tasks are complete; only
Phase 6 polish tasks remain open.

This spec covers the changes needed inside `rune-langium` to adopt the enhanced `@zod-to-form`
APIs. The existing hand-written form components (`DataTypeForm`, `EnumForm`, etc.) are **not
replaced** by this work — the scope is wiring the toolchain so generated forms are a viable
alternative going forward.

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

The `fields` keys follow the `@zod-to-form` convention `{schemaVariableName}.{fieldPath}`, matching the variable names in `src/schemas/form-schemas.ts`. The exact key format is determined by the `@zod-to-form/cli` processor — adjust once the CLI is available for testing.

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

The input schema changes from the full generated AST schema to the hand-authored form-surface schemas, which are already projected to the fields that matter for each form.

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
"scaffold:forms": "pnpm scaffold:enumForm && pnpm scaffold:dataTypeForm",
"scaffold:enumForm": "zodform generate --schema src/schemas/form-schemas.ts --export enumFormSchema --out src/components/forms/generated --mode auto-save --component-config component-config.ts",
"scaffold:dataTypeForm": "zodform generate --schema src/schemas/form-schemas.ts --export dataTypeFormSchema --out src/components/forms/generated --mode auto-save --component-config component-config.ts"
```

The generated output goes into `src/components/forms/generated/` alongside the hand-written forms. Generated files are checked in (they are deterministic outputs from committed inputs) and regenerated whenever `form-schemas.ts` or `component-config.ts` changes.

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

**Schema scoping**: only `name` and `parentName` are tracked in form state for auto-save. The `members` array is managed directly through store callbacks (append/remove/reorder commit immediately) — it does NOT need to be part of the form's Zod schema. Including `members` in the schema would cause ZodForm to render a default `ArrayBlock` for it; excluding it is cleaner since no validation or auto-save is needed on the array.

```typescript
// Only name + parentName tracked in form state; members use direct store callbacks
const enumCoreSchema = enumFormSchema.pick({ name: true, parentName: true });
type EnumCoreValues = z.infer<typeof enumCoreSchema>;
```

The `formRegistry` configures TypeSelector for `parentName`:

```typescript
const formRegistry = new MapFormRegistry();
formRegistry.add(enumCoreSchema.shape.parentName, {
  render: (_field, props) => {
    const p = props as { value: string; onChange: (v: string) => void };
    return (
      <TypeSelector
        value={resolveValue(p.value)}
        options={parentOptions}
        onSelect={(v) => {
          p.onChange(resolveLabel(v));              // update form state
          actions.setEnumParent(nodeId, v);         // update store immediately
        }}
        placeholder="Select parent enum..."
        allowClear
      />
    );
  }
});
```

The `EnumValuesList` child accesses `control` from the shared `FormProvider` via `useFormContext`. Since `members` is not in `enumCoreSchema`, `useFieldArray` manages the array state independently of the Zod schema validation:

```tsx
function EnumValuesList({ nodeId, actions }) {
  const { control } = useFormContext();  // members path not in enumCoreSchema — that's fine
  const { fields, append, remove, move } = useFieldArray({ control, name: 'members' });
  // ... add/remove/reorder callbacks commit to store directly ...
}
```

Full `EnumForm` shape:

```tsx
<ZodForm
  schema={enumCoreSchema}
  defaultValues={{ name: data.name, parentName: data.parentName }}
  onValueChange={handleNameParentCommit}   // debounced auto-save; valid only; post-mount only
  mode="onChange"
  formRegistry={formRegistry}
  className="flex flex-col gap-4 p-4"
>
  <ExternalDataSync data={data} toValues={() => ({ name: data.name, parentName: data.parentName })} />
  <EnumValuesList nodeId={nodeId} actions={actions} />
  <InheritedMembersSection groups={inheritedGroups} />
  <AnnotationSection ... />
  <MetadataSection ... />   {/* direct store callbacks — not in form state */}
</ZodForm>
```

`handleNameParentCommit` applies the 500ms debounce (via `useAutoSave`) and commits `name`/`parentName` changes to the store.

**Migration order**: `EnumForm` → `ChoiceForm` → `DataTypeForm` → `FunctionForm`. The `MapFormRegistry` and `ExternalDataSync` utilities are shared across all migrations.

### Acceptance criteria

- `MapFormRegistry` is importable from `packages/visual-editor/src/components/forms/`
- At least one form (`EnumForm`) renders via `ZodForm` and behaves identically to the hand-written version
- `TypeSelector` renders for `parentName` via `formRegistry` `render` override
- `EnumValuesList` uses `useFieldArray({ control, name: 'members' })` from the shared `FormProvider`
- Name/parentName changes auto-save via `onValueChange` with 500 ms debounce; `parentName` also commits immediately via `onSelect`
- `onValueChange` is NOT called on initial mount, only after valid user-initiated changes
- External data changes (undo/redo) reset the form via `ExternalDataSync` with `keepDirtyValues`
- No regressions in hand-written forms (they coexist until fully migrated)

---

## Summary

| Change | File(s) | Depends on |
|---|---|---|
| 1. `/components` subpath | `package.json`, `src/components.ts` | — |
| 2. `component-config.ts` | `component-config.ts` | Change 1; `zod-to-form` 002 Phase 2 |
| 3. `scaffold:forms` update | `package.json` | Change 2; `zod-to-form` 002 Phases 3–5 |
| 4. `@zod-to-form/react` dep | `package.json` | `zod-to-form` 002 Phases 4–5 |
| 5. `ZodForm` wiring | form component files | Changes 1–4 |

Changes 1–4 are mechanical and low-risk. Change 5 is the integration point and should be done incrementally by form type.
