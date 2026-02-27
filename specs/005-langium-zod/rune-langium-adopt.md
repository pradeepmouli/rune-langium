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

## Change 5: Wire generated forms in `EditorFormPanel`

**Why**: make generated forms available as an alternative to the hand-written forms. This is the only consumer-facing change — nothing else imports the generated files.

**`packages/visual-editor/src/components/panels/EditorFormPanel.tsx`** — add generated form variants behind a feature flag or alongside existing forms:

```tsx
import componentConfig from '../../component-config';
import { ZodForm } from '@zod-to-form/react';
import { dataTypeFormSchema } from '../../schemas/form-schemas';

// Inside the panel, where the node type is 'data':
<ZodForm
  schema={dataTypeFormSchema}
  values={toFormValues(node.data)}
  componentConfig={componentConfig}
  onValueChange={(values) => autoSave(values)}
/>
```

The `toFormValues()` and `autoSave()` functions are already implemented in the existing form hooks (`useNodeForm`, `useAutoSave`) — they are reused here.

**Migration order**: start with the simplest form (`EnumForm` — name + parentName + values only), validate the generated output matches the hand-written behaviour, then migrate `ChoiceForm`, `DataTypeForm`, `FunctionForm` in that order.

Array fields (`members` via `useFieldArray`) are the most complex — the generated form handles them only if `@zod-to-form` supports `z.array(...)` with inline add/remove controls. Until then, keep hand-written array sections and compose them with the generated form for the scalar fields.

### Acceptance criteria

- At least one form (`EnumForm`) renders via `ZodForm` in the live editor and behaves identically to the hand-written version
- `onValueChange` triggers auto-save with the same 500 ms debounce as `useAutoSave`
- `TypeSelector` renders for `parentName`; `CardinalityPicker` renders for attribute `cardinality` fields
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
