# Contract: Row Renderer

**Branch**: `013-z2f-editor-migration` | **Phase**: 1 (design)
**Audience**: implementers of Phase E (row renderer migration)

This document defines what an inline row renderer (`AttributeRow`,
`ChoiceOptionRow`, `EnumValueRow`, function-input row) must satisfy to be
registered as a `FormMeta.render` override against its item schema and invoked
by the form host. The `InheritedAttributeRow` (ghost row) is documented
separately because it is a render-only artifact, not a form-bound row.

---

## 1. Registration

A row renderer is registered against an item schema via `z.registry<FormMeta>()`
(or the `registerComponent`-equivalent that ships with the upstream
`010-editor-primitives` worked example). The registration lives once, in
`packages/visual-editor/src/components/forms/rows/index.ts`, and is imported
by the components module so the typed config can resolve it.

```ts
// packages/visual-editor/src/components/forms/rows/index.ts (illustrative)
import { z2fRegistry } from '@zod-to-form/core';
import { memberSchema } from '../../../schemas/form-schemas.js';
import { AttributeRow } from '../../editors/AttributeRow.js';

z2fRegistry.add(memberSchema, { render: AttributeRow });
// …repeat for ChoiceOptionRow, EnumValueRow, function-input row…
```

The form host invokes the registered renderer once per row in the array,
threading it the row's `index`, the item-schema-scoped `useFormContext`, and
any per-row callbacks declared on the typed config.

---

## 2. Reading item context

A row renderer MUST read its data via the documented per-item hooks:

- **Index-scoped field values**: each row receives an `index: number` prop;
  the row composes field paths as `${arrayPrefix}.${index}.${field}` (e.g.
  `members.${index}.name`) and reads via
  `useFormContext().watch(...)` / `getValues(...)` / `setValue(...)` exactly
  as today's `AttributeRow.tsx:78-84` does.
- **Sibling reads**: a row MAY read other rows' values via
  `useFormContext().watch('members')` for cross-row affordances (e.g.
  uniqueness hints). Cross-row writes are discouraged; emit an action callback
  instead.
- **Form-level metadata**: errors and dirty state come from
  `useFormState({ name: '${arrayPrefix}.${index}' })` for index-scoped error
  surfacing.

A row renderer MUST NOT instantiate its own form state, mount a separate
`FormProvider`, or hold long-lived `useState` for any value that lives in
form state. Per-row local UI state (e.g. a "menu open" boolean) is fine.

---

## 3. Per-row callbacks (action wiring)

The row receives per-row callbacks that map onto the action surface
(`EditorFormActions<K>`). The names match today's `AttributeRow` props
(`AttributeRow.tsx:30-59`):

| Callback | Forwards to | Notes |
|----------|-------------|-------|
| `onUpdate(index, oldName, newName, type, card, …)` | `actions.updateAttribute` (or kind-equivalent) | Debounced via the row's own `useAutoSave(commitFn, 500)`. |
| `onRemove(index)` | `actions.removeAttribute` (or kind-equivalent) | Immediate; no debounce. |
| `onReorder(fromIndex, toIndex)` | `actions.reorderAttribute` (or kind-equivalent) | Fired by the upstream reorder primitive (R5 of `research.md`); the row's drag handlers call this directly. |
| `onRevert?()` | Triggered for an override-row — internally calls `onRemove` against the row index plus any state cleanup. Optional. |
| `onOverride()` (ghost row only) | `actions.addAttribute` for the inherited entry | Only present on ghost rows (`InheritedAttributeRow`). |

The row MUST forward each callback verbatim; no re-mapping of the action
surface is allowed (FR-002 preservation).

---

## 4. Focus and cursor preservation on re-render

Rows re-render on every form-state change to any field they watch. The
contract:

- Inputs inside the row MUST preserve focus across re-renders. This is
  satisfied by using `Controller` from React Hook Form (which holds a stable
  ref to the input) or by composing inputs with stable `key` props tied to
  the row's stable identity (the `useFieldArray` `id`, not the array index).
- Cursor position inside `<input>` and `<textarea>` MUST be preserved when
  a sibling field updates form state. The current `<Controller>`-based
  pattern in `AttributeRow.tsx:183-203` already provides this; the
  registered renderer MUST keep the pattern.
- The row MUST NOT call `form.reset(…)`. Resets are owned by
  `useExternalSync` at the form root.

---

## 5. Drag-handle and reorder

The row owns the gesture surface (drag handle, keyboard shortcut listeners).
The current native-DnD implementation in `AttributeRow.tsx:131-147` is the
template; the row's drag-start/drag-over/drop handlers translate to the
upstream reorder primitive's `onReorder(from, to)` callback.

- The drag handle MUST be visually identical to today (`⠿` character, muted
  colour, same hover affordance). SC-004 pixel-equivalence applies.
- Keyboard reorder shortcuts (the same set that work today, owned by the
  package) continue to fire `onReorder` directly.
- Reorder when the array length is 1 MUST be a no-op; the drag affordance
  MAY be visually suppressed (matches spec Edge Case §2).

---

## 6. Override and revert (Data form only)

Override-state rendering is a Data-form-specific concern. The contract:

- A row whose `isOverride === true` shows the dimmed appearance and the
  "override" badge currently rendered by `AttributeRow.tsx:232-239`.
- A row whose `isOverride === true` AND has an `onRevert` callback shows the
  Revert button instead of the Remove button (current pattern). The renderer
  fires `onRevert()` on click.
- A `<InheritedAttributeRow>` (ghost) shows the Override button instead.
  After upstream P2 ghost-row support lands, the form host invokes ghost
  rows via `arrayConfig.before/after`; until then, the form file renders
  ghost rows inline alongside real rows in the same `.map()` (R6 of
  `research.md`).

---

## 7. Failure modes

- **Row registered against a schema that the form's array does not use**: the
  form host falls back to the default row renderer and emits a developer-mode
  warning.
- **Per-row callback not provided**: the row renders read-only (no edit
  affordances) and emits a developer-mode warning.
- **`useFormContext` returns `undefined`**: the row throws ("AttributeRow
  must be rendered inside a FormProvider"). This is current behaviour.
