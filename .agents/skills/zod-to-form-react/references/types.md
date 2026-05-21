# Types & Enums

## Types

### `FormField`
Intermediate representation of a single form field produced by `walkSchema`.
Each processor fills in component, props, constraints, and optional children.
This structure is consumed by codegen (static TSX generation) and by the
runtime `FieldRenderer` to produce a live React component tree.
**Properties:**
- `key: string` — Field path, e.g. "name", "address.street", "items.0.name"
- `component: string` — Component name from ComponentMap, e.g. "Input", "Select", "Textarea"
- `props: Record<string, unknown>` — Pass-through props for the component
- `label: string` — Display label
- `description: string` (optional) — Help text from .describe() or .meta()
- `placeholder: string` (optional) — Placeholder from examples[0] or metadata
- `required: boolean` — Whether the field is required
- `defaultValue: unknown` (optional) — Default value from z.default() or metadata
- `readOnly: boolean` — Read-only from z.readonly() or metadata
- `hidden: boolean` — Hidden but present in form state
- `order: number` (optional) — Display order override from form registry
- `disabled: boolean` — Non-interactive state (greyed out)
- `helpText: string` (optional) — Help text rendered below the input, distinct from description (below label)
- `deprecated: boolean` — Whether the field is marked as deprecated in the schema registry
- `options: FormFieldOption[]` (optional) — Options for enum/union select fields
- `children: FormField[]` (optional) — Children for nested objects
- `arrayItem: FormField` (optional) — Template for array items
- `constraints: FormFieldConstraints` — Validation constraints extracted from Zod v4 constraint bag (_zod.bag)
- `zodType: string` — Original Zod def.type for reference
- `hasCustomRender: boolean` (optional) — Whether a custom render function is registered for this field (runtime only)
- `render: (field: FormField, props: Record<string, unknown>) => unknown` (optional) — Custom render function from FormMeta (runtime only, not serialisable)
- `zodSchema: $ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>>` (optional) — Atomic Zod schema for this field, set by L1 optimizer
- `validation: ValidationStrategy` (optional) — Validation strategy set by optimizers (undefined = use zodResolver)

### `FormFieldOption`
An individual option in a Select, RadioGroup, or similar enum-driven component.
Generated from z.enum(), z.literal(), and z.union() of literals by their processors.
**Properties:**
- `value: string | number` — The option value submitted with the form (must be string or number for HTML compatibility).
- `label: string` — Human-readable label displayed in the Select, RadioGroup, or Combobox.
- `disabled: boolean` (optional) — When true, the option is shown but cannot be selected.

### `FormFieldConstraints`
Structural constraints extracted from Zod's `_zod.bag` for a field.
Used to populate HTML validation attributes (min, max, minLength, pattern, etc.)
and to drive the L2 native-rules optimizer output.
**Properties:**
- `min: number` (optional) — Minimum numeric value (from `z.number().min()`).
- `max: number` (optional) — Maximum numeric value (from `z.number().max()`).
- `minLength: number` (optional) — Minimum string length (from `z.string().min()`).
- `maxLength: number` (optional) — Maximum string length (from `z.string().max()`).
- `pattern: string` (optional) — Regex pattern as a string (from `z.string().regex()`).
- `format: string` (optional) — String format name (from `z.string().email()` → `'email'`, etc.).
- `step: number` (optional) — Step constraint for numeric inputs (1 for integer-constrained fields).

### `FormMeta`
Per-schema annotation stored in a `z.registry<FormMeta>()`.
Extends `FieldConfig` with a runtime-only `render` function for custom field rendering.
Used with `registerDeep()` / `registerFlat()` to attach form metadata to Zod schemas.
```ts
FieldConfig<T> & { render?: (field: FormField, props: unknown) => unknown }
```

### `FieldTemplateProps`
Props passed to the field template component that wraps each rendered form field.
The template controls layout: label position, description placement, error display, etc.
Override the default template by providing a `FieldTemplate` export in `componentModule`.
**Properties:**
- `children: ReactNode` — The rendered field input (passed as `children`).
- `label: string` — Human-readable field label derived from the schema key or `title` metadata.
- `description: string` (optional) — Optional description text from `.describe()` or `.meta({ description })`.
- `helpText: string` (optional) — Optional help text from `FormMeta.helpText`, displayed below the input.
- `error: string` (optional) — Validation error message from RHF `formState.errors`, if present.
- `name: string` — Field path used as the `htmlFor` target on the label.
- `required: boolean` (optional) — Whether the field is required (drives asterisk or `aria-required`).
- `disabled: boolean` (optional) — Whether the field is disabled (drives `disabled` on the wrapper).
- `deprecated: boolean` (optional) — Whether the field is deprecated (drives strikethrough on the label).
