# Contract: Section Component

**Branch**: `013-z2f-editor-migration` | **Phase**: 1 (design)
**Audience**: implementers of Phase C (sections refactor)

This document defines what a section component (Annotations, Conditions,
Metadata) must satisfy to be registered against the components module and
referenced declaratively by `section:` in `z2f.config.ts`. It applies to all
three current section components and to any future section additions.

---

## 1. Registration

A section component is registered exactly once on
`packages/visual-editor/src/components/zod-form-components.tsx` and exposed
under a stable name (e.g. `AnnotationSection`, `ConditionSection`,
`MetadataSection`). The typed config (`z2f.config.ts`) references the
section by name via a `section:` declaration; the form host resolves the name
through `componentModule`.

```ts
// z2f.config.ts (illustrative — do not copy verbatim)
schemas: {
  DataSchema: {
    sections: [
      { component: 'AnnotationSection', fields: ['annotations'] },
      { component: 'ConditionSection', fields: ['conditions', 'postConditions'] },
      { component: 'MetadataSection', fields: ['definition', 'comments', 'synonyms'] }
    ]
  }
}
```

**No imports of section components inside form files.** After Phase C, no form
file imports `AnnotationSection`, `ConditionSection`, or `MetadataSection`
directly. The single import path is the components module, and the form host
performs the lookup.

---

## 2. Reading form context

A section component MUST read its data via the documented form context hooks:

- **Field values**: `useFormContext().getValues(fieldName)` for one-off reads,
  `useFormContext().watch(fieldName)` for reactive reads, or `Controller` for
  fully-controlled inputs.
- **Field arrays** (e.g. synonyms): `useFieldArray({ control, name })` from
  the surrounding `FormProvider`.
- **Field metadata** (errors, dirty state): `useFormContext().formState` or
  `useFormState({ name })`.

The current `MetadataSection.tsx` already follows this pattern (see
`MetadataSection.tsx:55-63`); the migration does not change the in-component
pattern.

A section component MUST NOT:

- Receive its data via deep prop-drilling from the form (the typed config's
  `fields:` declaration is the contract; the prop shape is fixed by the host).
- Reach into the parent form via direct refs or via React context other than
  the documented `FormProvider`/`useFormContext` surface.
- Re-instantiate a `useForm` of its own. There is exactly one `useForm`
  (or upstream equivalent) per editor pane.

---

## 3. Receiving `fields: string[]`

The form host hands the section component a `fields: string[]` prop, where
each entry is a path into the surrounding form (e.g. `['definition',
'comments', 'synonyms']` for `MetadataSection`). The section component:

- MAY ignore the prop and render its known fields directly (today's
  `MetadataSection` does this — it knows it owns `definition`, `comments`,
  and `synonyms`).
- SHOULD honour `fields` if it is a generic-shaped section that varies across
  forms.
- MUST NOT crash if `fields` is empty — render an empty container.

The `fields` prop is the form host's expression of what was declared in the
typed config. It is the *contract input* the section sees; it is not derived
from form state.

---

## 4. Container, layout, and accessibility

Section components render inside a stable wrapper:

- Each section is a `<FieldSet>` (from
  `@rune-langium/design-system/ui/field`) with a `<FieldLegend>` that uses
  the existing `variant="label"` and the current `text-muted-foreground`
  styling. The migration MUST NOT change the legend wording or class set;
  SC-004 is pixel-equivalence.
- The container has a `data-slot` attribute matching the existing one
  (e.g. `data-slot="metadata-section"`). Visual-regression tests pin the
  selector.
- Accessibility roles, labels, and tab order are preserved; the section
  component owns the same `<FieldLabel>` per-field as today.

---

## 5. Commit callbacks (action wiring)

Section components fire graph actions via prop callbacks. After Phase C the
callback set is unchanged from today's contract (see `data-model.md` §3):

| Section | Required props |
|---------|---------------|
| `AnnotationSection` | `annotations`, `onAdd(name)`, `onRemove(index)` |
| `ConditionSection` | `conditions`, `onAdd(condition)`, `onRemove(index)`, `onUpdate(index, updates)`, `onReorder(from, to)`, `renderExpressionEditor?` |
| `MetadataSection` | `onDefinitionCommit(string)`, `onCommentsCommit(string)`, `onSynonymAdd(string)`, `onSynonymRemove(index)`, `readOnly?` |

The form host wires these props from the form's per-action commit callbacks
(today's pattern, see `DataTypeForm.tsx:441-464`). Each PR keeps the wiring
verbatim; the section refactor's only change is *how* the section component
is summoned (via `componentModule` lookup), not *what* it receives.

---

## 6. Failure modes

- **Missing required prop callback**: the section emits a developer-mode
  warning and renders the read-only view of its data (no edit affordances).
- **Form context unavailable**: the section throws an obvious error
  ("MetadataSection must be rendered inside a FormProvider"). This is the
  current behaviour and is preserved.
- **Field path declared in the typed config is not present in the schema**:
  the form host emits a developer-mode warning at registration time and
  passes the unknown path through; the section ignores unknown paths.
