# Functions

## Components

### `ZodForm`
Runtime React component that renders a type-safe form from a Zod v4 schema.

Walks `schema` to produce `FormField[]`, wires React Hook Form with a
`zodResolver`, and renders each field using the matched component from
`components` (defaults to `defaultComponentMap`). Sections defined in
`componentConfig.fields` are rendered as grouped fieldsets.
```ts
ZodForm<TSchema>(props: ZodFormProps<TSchema>): ReactNode
```
**Parameters:**
- `props: ZodFormProps<TSchema>` — Schema, event handlers, and optional component/config overrides.
**Returns:** `ReactNode` — A `<FormProvider>`-wrapped form element.
```tsx
import { ZodForm } from '@zod-to-form/react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

<ZodForm schema={loginSchema} onSubmit={(data) => console.log(data)} />
```

## Hooks

### `useZodForm`
React Hook Form integration hook for Zod v4 schemas.

Walks the schema to produce `FormField[]` and wires `useForm` with a
`zodResolver`. When `options.optimization` is set the `zodResolver` is
replaced by per-field validation (via `schemaLite`) and the resolver
import is tree-shaken in production builds.
```ts
useZodForm<TSchema>(schema: TSchema, options?: UseZodFormOptions<TSchema>): { form: UseFormReturn<output<TSchema>, any, output<TSchema>>; fields: FormField[]; schemaError: string | null; schemaLite: $ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>> | null }
```
**Parameters:**
- `schema: TSchema` — The `z.object({...})` schema to generate the form from.
- `options: UseZodFormOptions<TSchema>` (optional) — Optional hook configuration.
**Returns:** `{ form: UseFormReturn<output<TSchema>, any, output<TSchema>>; fields: FormField[]; schemaError: string | null; schemaLite: $ZodType<unknown, unknown, $ZodTypeInternals<unknown, unknown>> | null }` — `{ form, fields }` — the RHF `UseFormReturn` and the `FormField[]` array.
```tsx
const { form, fields } = useZodForm(loginSchema);
return (
  <form onSubmit={form.handleSubmit(onSubmit)}>
    {fields.map((f) => <input key={f.key} {...form.register(f.key)} />)}
  </form>
);
```

## Normalization

### `normalizeFormValues`
Normalize raw HTML form values for Zod parsing.

HTML inputs produce values that don't match Zod's expectations:
- Empty strings "" for unset optional fields (Zod .optional() accepts undefined, not "")
- FileList objects for file inputs (Zod expects File or undefined)

This function recursively normalizes these mismatches so that
schema.safeParse(normalizeFormValues(values)) works correctly.

Called unconditionally in the resolver wrapper to ensure consistent
behavior across all component libraries. While shadcn components handle
most value conversions natively, normalization provides a safety net for
edge cases like FileList objects.

Handles two critical HTML-to-Zod mismatches:
1. Empty strings "" (from unset inputs) → undefined (what Zod .optional() expects)
2. FileList → File | undefined (assumes single-file inputs)
Recursively applies to arrays and nested objects.
```ts
normalizeFormValues(value: unknown): unknown
```
**Parameters:**
- `value: unknown` — The raw form value to normalize (may be nested object, array, string, or FileList).
**Returns:** `unknown` — The normalized value with empty strings replaced by `undefined` and FileList unwrapped.

## Optimization

### `wrapWithSchemaLite`
Wraps a form `onSubmit` handler with `schemaLite` client-side validation.

Runs `schemaLite.safeParse(normalizeFormValues(data))` before calling the
original handler. On failure, maps each validation issue to the corresponding
RHF field via `setError`. On success, delegates to `onSubmit` unchanged.

Used by optimization-level codegen output to perform fast per-field
validation with a trimmed schema that omits cross-field refinements.

The wrapper calls `normalizeFormValues()` on the data before passing it to `schemaLite.safeParse()`.
This ensures empty strings from HTML inputs are converted to `undefined`, matching Zod's `.optional()` expectation.
Each validation issue's `path` array is joined with `.` to produce the RHF field path for `setError`.
```ts
wrapWithSchemaLite<TData>(schemaLite: $ZodType, setError: UseFormSetError<TData>, onSubmit: (data: TData) => void | Promise<void>): (data: TData) => void | Promise<void>
```
**Parameters:**
- `schemaLite: $ZodType` — The stripped Zod schema produced by `walkSchema` at optimization level 1+.
- `setError: UseFormSetError<TData>` — RHF's `setError` function from `useFormContext`.
- `onSubmit: (data: TData) => void | Promise<void>` — The original submit handler to call on successful validation.
**Returns:** `(data: TData) => void | Promise<void>` — A wrapped submit handler with the same signature as `onSubmit`.
**Throws:** Never — validation errors are mapped to RHF's `setError` rather than thrown.
```ts
const handleSubmit = wrapWithSchemaLite(schemaLite, setError, async (data) => {
  await fetch('/api/submit', { method: 'POST', body: JSON.stringify(data) });
});
// Pass handleSubmit to RHF's form.handleSubmit(handleSubmit)
```
