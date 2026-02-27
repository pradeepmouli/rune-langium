# Enhancement: zod-to-form Additions for rune-langium Integration

**Package**: `@zod-to-form` ([pradeepmouli/zodforms](https://github.com/pradeepmouli/zodforms), `001-zodforms` branch)
**Requested by**: [`rune-langium`](https://github.com/pradeepmouli/rune-langium) spec 004 + 005
**Date**: 2026-02-27

---

## Summary

`@zod-to-form` is currently deferred in rune-langium because three conditions aren't met yet:

1. The processor registry (`processors/` is empty) — the plugin API is typed but has no documented examples or built-in processors exported for reuse
2. The form lifecycle is submit-button only — rune-langium uses a 500ms debounced auto-save, not a submit handler
3. The CLI has no awareness of cross-reference fields — fields that need a `TypeSelector` (combobox) rather than a text input

Four changes unlock adoption:

1. **Processor API** — document the plugin contract, ship a `processors/string.ts` reference example, export built-in processors so they can be extended
2. **`onValueChange` lifecycle** — add an `onValueChange(values)` callback to `useZodForm` / `ZodForm` for onChange-driven commit patterns
3. **CLI: auto-save output mode** — `--mode auto-save` generates `watch` + `useEffect` instead of a submit button
4. **Cross-reference field processor** — a `crossRef` processor + `FormMeta.fieldType: 'cross-ref'` that the CLI uses to emit a named placeholder component instead of `<input type="text">`

---

## Change 1 — Processor API: documentation + reference implementation

### Problem

`types.ts` defines `FormProcessor`, `FormProcessorContext`, and `WalkOptions.processors`, but:

- `processors/` directory is empty — no example to learn from
- The built-in processors (how `z.string()` becomes `{ component: 'Input' }`, etc.) are inlined into `walker.ts` and not exported
- There is no documented way to register a processor for a specific Zod schema type or field metadata
- `components/` directory (in `@zod-to-form/react`) is also empty — no example of the render-side complement

The result: `@zod-to-form/core`'s registry system is architecturally complete but inaccessible to consumers.

### Required change

**a) Export built-in processors**

Extract the walker's built-in type handlers into named modules under `processors/` and export them from `@zod-to-form/core`:

```
packages/core/src/processors/
├── string.ts       # ZodString → { component: 'Input', constraints: { minLength, maxLength, pattern } }
├── number.ts       # ZodNumber → { component: 'NumberInput', constraints: { min, max, step } }
├── boolean.ts      # ZodBoolean → { component: 'Switch' }
├── enum.ts         # ZodEnum → { component: 'Select', options: [...] }
├── object.ts       # ZodObject → { component: 'Fieldset', children: [...] }
├── array.ts        # ZodArray → { component: 'ArrayField', arrayItem: ... }
└── index.ts        # re-exports all built-ins
```

**b) Document the processor contract**

Add a `PROCESSORS.md` or expand the README with:

```typescript
// How to write a custom processor
import type { FormProcessor } from '@zod-to-form/core';

export const myCustomProcessor: FormProcessor = (schema, ctx, field, params) => {
  // Mutate `field` to customise the FormField
  field.component = 'MyWidget';
  field.props['specialProp'] = true;
};

// How to register it
import { walkSchema } from '@zod-to-form/core';

const fields = walkSchema(mySchema, {
  processors: { ZodString: myCustomProcessor },  // override by Zod type name
});
```

**c) Document `FormMeta` + `ZodFormRegistry` integration**

Show how to use Zod's registry to annotate schemas:

```typescript
const formRegistry = z.registry<FormMeta>();

const nameField = z.string().min(1);
formRegistry.add(nameField, { fieldType: 'Input', order: 1 });

const fields = walkSchema(mySchema, { formRegistry });
```

### Acceptance criteria

- `import { stringProcessor, numberProcessor } from '@zod-to-form/core/processors'` works
- A consumer can override `ZodString` handling by passing `processors: { ZodString: myProcessor }` to `walkSchema`
- A consumer can register metadata via `ZodFormRegistry` and see `field.component` set accordingly
- README contains a working end-to-end custom processor example

---

## Change 2 — `onValueChange` lifecycle for auto-save

### Problem

`useZodForm` and `ZodForm` only support a submit-button pattern:

```tsx
// Current — submit only
<ZodForm schema={MySchema} onSubmit={(data) => save(data)} />
```

rune-langium forms use a 500ms debounced auto-save (`useAutoSave`) that commits on every change, with no submit button. There is no way to attach an `onValueChange` callback to the current API.

The `FieldRenderer.tsx` already uses `react-hook-form` internally, which supports `mode: 'onChange'`. The gap is that `useZodForm` doesn't surface this.

### Required change

Add `onValueChange` to `useZodForm` options and `ZodForm` props:

```typescript
// useZodForm
interface UseZodFormOptions<T extends z.ZodType> {
  schema: T;
  defaultValues?: z.infer<T>;
  onSubmit?: (data: z.infer<T>) => void | Promise<void>;
  onValueChange?: (data: z.infer<T>) => void;  // ← new
  mode?: 'onSubmit' | 'onChange' | 'onBlur';   // ← new (passed to react-hook-form)
}
```

When `onValueChange` is provided, `useZodForm` subscribes to `watch()` and calls it on every validated change. When only `onSubmit` is provided, the behaviour is unchanged.

```tsx
// Usage in rune-langium
const { form } = useZodForm({
  schema: createDataSchema({ Data: allTypeNames }),
  defaultValues: node.data,
  onValueChange: (values) => autoSave(values),
  mode: 'onChange',
});
```

### Acceptance criteria

- `onValueChange` is called with the latest valid form values on every field change
- `onValueChange` is NOT called while the form is in an invalid state (partial input)
- `mode: 'onChange'` wires through to react-hook-form's `useForm({ mode })`
- Providing only `onSubmit` (no `onValueChange`) behaves identically to today — no regression
- Providing both `onSubmit` and `onValueChange` works: both callbacks are invoked at their respective triggers

---

## Change 3 — CLI: auto-save output mode

### Problem

The CLI generates submit-button components:

```tsx
// Current CLI output
<form onSubmit={handleSubmit(onSubmit)}>
  {/* fields */}
  <button type="submit">Submit</button>
</form>
```

rune-langium needs onChange-driven components:

```tsx
// Desired CLI output
const { watch, control } = useForm({ resolver: zodResolver(schema), mode: 'onChange' });

useEffect(() => {
  const subscription = watch((values) => onValueChange?.(values));
  return () => subscription.unsubscribe();
}, [watch, onValueChange]);

<form>
  {/* fields — no submit button */}
</form>
```

### Required change

Add `--mode` flag to `@zod-to-form/cli`:

```bash
# Default (unchanged)
zod-to-form generate --schema ./schemas.ts --out ./forms/

# Auto-save mode
zod-to-form generate --schema ./schemas.ts --out ./forms/ --mode auto-save
```

In `auto-save` mode, the generated component:

1. Accepts an `onValueChange?: (values: T) => void` prop instead of / alongside `onSubmit`
2. Uses `watch()` + `useEffect` for the subscription
3. Omits the submit button
4. Sets `mode: 'onChange'` on `useForm`

The generated prop type:

```typescript
interface DataFormProps {
  defaultValues?: Partial<DataFormValues>;
  onValueChange?: (values: DataFormValues) => void;
  onSubmit?: (values: DataFormValues) => void;  // kept for flexibility
}
```

### Acceptance criteria

- `--mode auto-save` generates a component with `watch` + `useEffect` subscription pattern
- Generated component accepts `onValueChange` prop
- No submit button in generated output when `--mode auto-save`
- Default mode (no flag) generates identically to today

---

## Change 4 — Cross-reference field processor and CLI `--component-config`

### Problem

When `langium-zod` with `--cross-ref-validation` generates a schema, cross-reference fields are `z.string()` with a `.refine()` validator. There is no schema-level signal to `@zod-to-form` that this field requires a `TypeSelector` (combobox with live model lookups) rather than a plain `<input type="text">`.

Additionally, the CLI cannot accept a React component map directly — it runs in Node.js at build time, so it can only receive component **names and import paths as strings**, not component references. Any approach that hard-codes component names in the CLI is wrong; different consumers use different component libraries.

### Design

**a) `FormMeta.fieldType: 'cross-ref'` (runtime side)**

Allow consumer code to tag a field as a cross-reference using `ZodFormRegistry`:

```typescript
const formRegistry = z.registry<FormMeta>();
formRegistry.add(schema.shape.superType, {
  fieldType: 'cross-ref',
  props: { refType: 'Data' },   // which type collection to look up at runtime
});
```

`@zod-to-form/core` documents this convention. A `crossRef` processor sets `field.component = 'cross-ref'` (the field type token, not a component name) and copies `props.refType` through to `field.props`. The actual component name is resolved by the renderer or the CLI config, not the processor.

**b) CLI `--component-config <file>` flag (codegen side)**

A JSON config file that separates two concerns the CLI cannot resolve at runtime:
- **what this field type is** → keyed by `FormMeta.fieldType` or explicit field path
- **how to render it** → component name + import path (strings only)

```json
// component-config.json
{
  "fieldTypes": {
    "cross-ref": {
      "component": "TypeSelector",
      "import": "@rune-langium/visual-editor/components/TypeSelector"
    },
    "cardinality": {
      "component": "CardinalityPicker",
      "import": "@rune-langium/visual-editor/components/CardinalityPicker"
    }
  },
  "fields": {
    "DataForm.superType":    { "fieldType": "cross-ref", "props": { "refType": "Data" } },
    "AttributeForm.typeCall": { "fieldType": "cross-ref", "props": { "refType": "Data" } }
  }
}
```

The config file can be `.json` or `.ts`. The CLI resolves `.ts` configs via `jiti` (bundled as a dep, no user setup required), matching the pattern used by Vite and Tailwind v4:

```typescript
// component-config.ts — type-checked via `satisfies`
import type { ZodToFormComponentConfig } from '@zod-to-form/cli';

export default {
  fieldTypes: {
    'cross-ref': {
      component: 'TypeSelector',
      import: '@rune-langium/visual-editor/components/TypeSelector',
    },
    'cardinality': {
      component: 'CardinalityPicker',
      import: '@rune-langium/visual-editor/components/CardinalityPicker',
    },
  },
  fields: {
    'DataForm.superType':     { fieldType: 'cross-ref', props: { refType: 'Data' } },
    'AttributeForm.typeCall': { fieldType: 'cross-ref', props: { refType: 'Data' } },
  },
} satisfies ZodToFormComponentConfig;
```

```bash
zod-to-form generate --schema ./schemas.ts \
  --out ./forms/ \
  --component-config ./component-config.ts   # .ts or .json, both accepted
```

For fields matched by the config, the CLI emits the correct import and component name:

```tsx
// Generated — import comes from component-config.json, not hard-coded
import { TypeSelector } from '@rune-langium/visual-editor/components/TypeSelector';

// ...
<TypeSelector
  name="superType"
  control={control}
  refType="Data"
/>
```

Fields not covered by the config fall back to the default input for their Zod type.

**c) Built-in `crossRef` processor in `@zod-to-form/core`**

```typescript
// packages/core/src/processors/cross-ref.ts
export const crossRefProcessor: FormProcessor = (schema, ctx, field, params) => {
  field.component = 'cross-ref';   // token, not a component name
  const meta = ctx.formRegistry?.get(schema);
  if (meta?.props?.refType) field.props['refType'] = meta.props.refType;
};
```

Exported from `@zod-to-form/core/processors`. The CLI resolves `'cross-ref'` → actual component via `component-config.json`; the runtime renderer resolves it via its own component map.

### Acceptance criteria

- `formRegistry.add(field, { fieldType: 'cross-ref', props: { refType: 'Data' } })` → `field.component === 'cross-ref'` in walker output
- CLI with `--component-config` resolves `'cross-ref'` → correct component name and emits the matching import
- Both `.json` and `.ts` config files are accepted; `.ts` is executed via `jiti` with no user setup required
- A `ZodToFormComponentConfig` type is exported from `@zod-to-form/cli` so `.ts` configs can use `satisfies` for compile-time validation
- CLI without `--component-config` falls back to plain `<input>` for all string fields (no hard-coded component names in the CLI itself)
- `crossRefProcessor` importable from `@zod-to-form/core/processors`
- Two projects using different component libraries can point `cross-ref` to different components via their own `component-config.json`
- Fields not listed in config or registry continue to render as their default type

---

## Priority

| # | Change | Priority | Notes |
|---|---|---|---|
| 1 | Processor API docs + built-in exports | **P0** | Blocks all custom field work; zero-effort workaround exists only by forking |
| 2 | `onValueChange` lifecycle | **P1** | Blocks `@zod-to-form/react` adoption in rune-langium |
| 3 | CLI auto-save mode | **P1** | Blocks `@zod-to-form/cli` scaffold usability in rune-langium |
| 4 | Cross-ref processor + CLI placeholder | **P2** | Reduces manual post-scaffold wiring; `TypeSelector` stubs still needed either way |

## Relationship to langium-zod changes

These changes are complementary to the `langium-zod` upstream spec:

- `langium-zod` Change 3 (projection) narrows the schema to form-surface fields before `@zod-to-form` sees it — reduces the scope of what `@zod-to-form/cli` needs to handle
- `langium-zod` Change 5 (`--cross-ref-validation`) generates `create*Schema` factories with `.refine()` validators — `@zod-to-form` Change 4 provides the render-side complement (TypeSelector component slot)
- The intended pipeline once both packages are updated:

```
.langium grammar
  → [langium-zod --projection form-surfaces.json --cross-ref-validation]
  → projected zod-schemas.ts  (only form fields; with cross-ref refinements)
  → [zod-to-form generate --mode auto-save --component-config component-config.json]
  → DataTypeForm.tsx (auto-save, TypeSelector imported + wired for cross-ref fields)
  → developer adds useAutoSave hook and tunes field layouts
```

## Out of scope

- shadcn/ui built-in components for `@zod-to-form/react` (consumer provides their own component map)
- Server-action generation (Next.js specific; rune-langium is browser-only)
- Array field drag-and-drop reordering
- Nested object recursion depth beyond what `walker.ts` already handles
