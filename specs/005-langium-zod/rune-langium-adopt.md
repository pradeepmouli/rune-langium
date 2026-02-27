# rune-langium: @zod-to-form adoption

**Prerequisite**: changes described in `zod-to-form-enhance.md` must be released first.

This spec covers the changes needed inside `rune-langium` to adopt the enhanced `@zod-to-form` APIs. The existing hand-written form components (`DataTypeForm`, `EnumForm`, etc.) are **not replaced** by this work — the scope is wiring the toolchain so generated forms are a viable alternative going forward.

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

**jiti safety**: the file contains only `import type`, a `type` alias (both erased), and an object literal of string values. jiti sees only strings.

### Acceptance criteria

- `@zod-to-form/cli` loads `component-config.ts` via jiti without errors
- `component: 'BadName'` that is not an export of `VisualModule` produces a TypeScript compile error
- `@zod-to-form/react` renderer resolves `TypeSelector` and `CardinalityPicker` from the string module path at runtime

---

## Change 3: Update `scaffold:forms` script

**Why**: add `--component-config` so the CLI emits `TypeSelector`/`CardinalityPicker` imports for cross-ref and cardinality fields instead of plain `<input>` elements; add `--mode auto-save` so generated forms emit `onValueChange` callbacks instead of submit-button handlers.

The input schema changes from the full generated AST schema to the hand-authored form-surface schemas, which are already projected to the fields that matter for each form.

**`packages/visual-editor/package.json`** — update script:

```json
"scaffold:forms": "zod-to-form generate \
  --schema src/schemas/form-schemas.ts \
  --out src/components/forms/generated \
  --component-config component-config.ts \
  --mode auto-save"
```

The generated output goes into `src/components/forms/generated/` alongside the hand-written forms. Generated files are checked in (they are deterministic outputs from committed inputs) and regenerated whenever `form-schemas.ts` or `component-config.ts` changes.

### Acceptance criteria

- `pnpm scaffold:forms` runs without error
- Generated files in `src/components/forms/generated/` include `import { TypeSelector } from '@rune-langium/visual-editor/components'` for fields matching `cross-ref` entries in the config
- Generated form components accept an `onValueChange` prop (from `--mode auto-save`)
- Fields not covered by the config fall back to standard `<input>` elements

---

## Change 4: Add `@zod-to-form/react` as a runtime dependency

**Why**: the generated form components `import { ZodForm } from '@zod-to-form/react'` — it must be a runtime dependency, not just a devDependency.

**`packages/visual-editor/package.json`**:

```json
"dependencies": {
  "@zod-to-form/react": "*",
  ...existing deps...
}
```

Remove `@zod-to-form/cli` from `devDependencies` if it's only needed for the scaffold script (it can stay as a devDep — it is never imported at runtime).

### Acceptance criteria

- `@zod-to-form/react` resolves at build time and runtime
- Generated form components compile without unresolved import errors

---

## Change 5: Wire `ZodForm` into existing form components

**Why**: make `ZodForm` the form-state and field-rendering layer inside the existing form components, replacing `useNodeForm` + `FormProvider` + manual `Controller` wrappers. The store-action callbacks remain unchanged.

### Actual API (v0.2.3)

Inspecting the published package reveals:

```typescript
// ZodForm props — v0.2.3
type ZodFormProps<TSchema extends ZodObject> = {
  schema: TSchema;
  onSubmit: (data: TSchema['_zod']['output']) => unknown;  // no onValueChange yet
  defaultValues?: Partial<TSchema['_zod']['output']>;
  components?: Partial<typeof defaultComponentMap>;         // component name → React component
  formRegistry?: ZodFormRegistry;                          // field-level metadata/render overrides
  processors?: Record<string, FormProcessor>;
  className?: string;
  children?: ReactNode;   // rendered INSIDE FormProvider — useFormContext() works here
};

// ZodFormRegistry — consumer must implement; z.registry<FormMeta>() satisfies it
type ZodFormRegistry = {
  get(schema: ZodType): FormMeta | undefined;
  has(schema: ZodType): boolean;
};

// FormMeta — key field for custom rendering
interface FormMeta {
  fieldType?: string;
  order?: number;
  hidden?: boolean;   // skips rendering AND registration — field absent from form.watch()
  gridColumn?: string;
  render?: (field: FormField, props: unknown) => unknown;  // custom component per field
}
```

`ZodForm` wraps its output in `FormProvider`, so `children` can call `useFormContext()`, `useFieldArray`, etc.

`hidden: true` removes the field from both the UI and `form.watch()`. This means hidden fields cannot be tracked by `AutoSaveHelper`. Fields intended for auto-save must be registered (not hidden), even if their rendering is overridden via `render`.

### AutoSaveHelper pattern

Since `onValueChange` is not yet on `ZodForm` (tracked in `zod-to-form-enhance` Change 2), auto-save is bridged via a null-rendering child:

**`packages/visual-editor/src/components/forms/AutoSaveHelper.tsx`**:

```tsx
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { useAutoSave } from '../../hooks/useAutoSave.js';

interface AutoSaveHelperProps<T> {
  onCommit: (values: Partial<T>) => void;
  delay?: number;
}

export function AutoSaveHelper<T>({ onCommit, delay = 500 }: AutoSaveHelperProps<T>) {
  const form = useFormContext<T>();
  const save = useAutoSave(onCommit, delay);
  useEffect(() => {
    const { unsubscribe } = form.watch((values) => save(values as Partial<T>));
    return unsubscribe;
  }, [form, save]);
  return null;
}
```

Once `zod-to-form-enhance` Change 2 ships `onValueChange` on `ZodForm`, `AutoSaveHelper` is retired and replaced with `onValueChange={handleCommit}` directly on `ZodForm`.

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

`EnumForm` is the migration target (fewest dependencies). The schema is narrowed to fields ZodForm manages:

```typescript
// Only name + parentName tracked in form state; metadata uses direct store callbacks
const enumCoreSchema = enumFormSchema.pick({ name: true, parentName: true, members: true });
type EnumCoreValues = z.infer<typeof enumCoreSchema>;
```

The `formRegistry` configures TypeSelector for `parentName`. `members` is NOT hidden (hidden skips registration, breaking `useFieldArray`) — instead, `FieldRenderer` is intercepted via `render` to return null, while `useFieldArray` in a child registers the field independently:

```typescript
reg.add(enumCoreSchema.shape.parentName, {
  render: (_field, props) => {
    const p = props as { value: string; onChange: (v: string) => void };
    return (
      <TypeSelector
        value={resolveValue(p.value)}
        options={parentOptions}
        onSelect={(v) => {
          p.onChange(resolveLabel(v));   // update form state
          actions.setEnumParent(nodeId, v);  // update store immediately
        }}
        placeholder="Select parent enum..."
        allowClear
      />
    );
  }
});

// Suppress ZodForm's ArrayBlock for members — EnumValuesList child renders it
reg.add(enumCoreSchema.shape.members, {
  render: () => null   // return null, not hidden: true, so useFieldArray can still register
});
```

The `EnumValuesList` child accesses the shared `FormProvider` via `useFormContext`:

```tsx
function EnumValuesList({ nodeId, actions, committedRef }) {
  const { control } = useFormContext<EnumCoreValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: 'members' });
  // ... same add/remove/reorder callbacks as before ...
}
```

Full `EnumForm` shape:

```tsx
<ZodForm
  schema={enumCoreSchema}
  onSubmit={() => {}}
  defaultValues={defaultValues}
  components={{ Input }}      // design-system Input for name field
  formRegistry={formRegistry}
  className="flex flex-col gap-4 p-4"
>
  <ExternalDataSync data={data} toValues={() => toFormValues(data)} />
  <AutoSaveHelper<EnumCoreValues> onCommit={handleNameCommit} />
  <EnumValuesList nodeId={nodeId} actions={actions} committedRef={committedRef} />
  <InheritedMembersSection groups={inheritedGroups} />
  <AnnotationSection ... />
  <MetadataSection ... />   {/* direct store callbacks — not in form state */}
</ZodForm>
```

**Migration order**: `EnumForm` → `ChoiceForm` → `DataTypeForm` → `FunctionForm`. The `MapFormRegistry` and `AutoSaveHelper` utilities are shared across all migrations.

### Acceptance criteria

- `AutoSaveHelper` and `MapFormRegistry` are importable from `packages/visual-editor/src/components/forms/`
- At least one form (`EnumForm`) renders via `ZodForm` and behaves identically to the hand-written version
- `TypeSelector` renders for `parentName` via `formRegistry.render`; `members` list renders via `EnumValuesList` child using `useFieldArray`
- Name changes auto-save via `AutoSaveHelper` with 500 ms debounce; `parentName` commits immediately via `onSelect`
- External data changes (undo/redo) reset the form via `ExternalDataSync` with `keepDirtyValues`
- When `zod-to-form-enhance` Change 2 ships `onValueChange`, `AutoSaveHelper` is retired
- No regressions in hand-written forms (they coexist until fully migrated)

---

## Summary

| Change | File(s) | Depends on |
|---|---|---|
| 1. `/components` subpath | `package.json`, `src/components.ts` | — |
| 2. `component-config.ts` | `component-config.ts` | Change 1; `zod-to-form-enhance` Change 4b |
| 3. `scaffold:forms` update | `package.json` | Change 2; `zod-to-form-enhance` Changes 3 & 4b |
| 4. `@zod-to-form/react` dep | `package.json` | `zod-to-form-enhance` Changes 1 & 2 |
| 5. `EditorFormPanel` wiring | `EditorFormPanel.tsx` | Changes 1–4 |

Changes 1–4 are mechanical and low-risk. Change 5 is the integration point and should be done incrementally by form type.
