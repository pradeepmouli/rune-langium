# Phase 1 Data Model: Migrate Visual Editor Forms to zod-to-form

**Branch**: `013-z2f-editor-migration` | **Date**: 2026-04-25
**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), [`research.md`](./research.md)

This document captures the entities the migration touches. Schemas are
referenced by file path rather than re-printed; the goal is to make the
relationships and contracts legible, not to duplicate the source.

---

## 1. Form-surface schemas (canonical, post-migration)

**Source**: `packages/visual-editor/src/schemas/form-schemas.ts`

After Phase A (config alignment), this is the single canonical set of Zod
schemas the typed config and all five forms reference. There are five top-level
schemas, one shared row schema (`memberSchema`), and a small set of named
sub-shapes for sections and per-form rows.

| Schema | TS type | Drives form | Required leaf fields | Optional / metadata fields |
|--------|---------|-------------|---------------------|---------------------------|
| `dataTypeFormSchema` | `DataTypeFormValues` | `DataTypeForm.tsx` | `name` (min 1, "Type name is required"), `parentName` (string), `members` (array<`memberSchema`>) | `definition`, `comments`, `synonyms` |
| `choiceFormSchema` | `ChoiceFormValues` | `ChoiceForm.tsx` | `name` (min 1, "Choice name is required"), `members` (array<`memberSchema`>, default `[]`) | `definition`, `comments`, `synonyms` |
| `enumFormSchema` | `EnumFormValues` | `EnumForm.tsx` | `name` (min 1, "Enum name is required"), `parentName`, `members` (array<`memberSchema`>, default `[]`) | `definition`, `comments`, `synonyms` |
| `functionFormSchema` | `FunctionFormValues` | `FunctionForm.tsx` | `name` (min 1, "Function name is required"), `outputType`, `expressionText` | `members` (array<`memberSchema`>), `definition`, `comments`, `synonyms` |
| `typeAliasFormSchema` | `TypeAliasFormValues` | `TypeAliasForm.tsx` | `name` (min 1, "Type alias name is required") | `definition`, `comments`, `synonyms` |

**Validation rules** are in-file at
`packages/visual-editor/src/schemas/form-schemas.ts`. The migration MUST NOT
weaken any rule; the only allowable change is the addition of error messages or
of fields that today live in form state but aren't schema-validated.

### `memberSchema` (shared row shape)

Used by `dataTypeFormSchema.members`, `choiceFormSchema.members`,
`enumFormSchema.members` (renamed to enum-value semantics on display), and
optionally by `functionFormSchema.members`. The schema is intentionally narrow —
just `name`, `typeName`, `cardinality`, optional `isOverride`, optional
`displayName`. Per-form rows specialize via the typed config and the registered
`FormMeta.render` (see §4).

### `attributeSchema` and `enumValueSchema` (form-internal projections)

These exist in `form-schemas.ts` as stricter variants of `memberSchema`
(attribute-name-required, value-name-required). The migration may consolidate
them with `memberSchema` *iff* error messages stay equivalent (FR-001
preservation). If consolidation introduces any wording divergence, keep them
separate.

---

## 2. Relationship to AST schemas (post-migration)

**Source**: `packages/visual-editor/src/generated/zod-schemas.ts` (langium-zod
output)

After this migration:

- The AST schemas (`DataSchema`, `ChoiceSchema`, `RosettaEnumerationSchema`,
  `RosettaFunctionSchema`, `RosettaTypeAliasSchema`, `AttributeSchema`,
  `RosettaCardinalitySchema`, `TypeCallSchema`, …) are **not consumed by any
  form**.
- They remain as a separate validation surface for tests/conformance and for
  the langium-zod regeneration pipeline. They are out of scope for FR-008.
- The form-surface schemas are a **projection** of the AST shapes, not a copy.
  The mapping is the existing `toFormValues(data)` helper that lives in each
  form file (e.g. `DataTypeForm.tsx:66-82`):

  | AST field | Form field |
  |-----------|------------|
  | `data.name` | `name` |
  | `getRefText(data.superType)` | `parentName` |
  | `data.attributes[].name` | `members[].name` |
  | `getTypeRefText(data.attributes[].typeCall)` | `members[].typeName` |
  | `formatCardinality(data.attributes[].card)` | `members[].cardinality` |
  | `data.attributes[].override` | `members[].isOverride` |
  | `data.definition` | `definition` |
  | `data.comments` | `comments` |
  | `classExprSynonymsToStrings(data.synonyms)` | `synonyms` |

  The reverse mapping (`fromFormValues`) is implicit — the form does not
  reverse-project; instead, per-field commit callbacks (`actions.renameType`,
  `actions.addAttribute`, …) translate user edits into graph actions on the
  AST. This contract is the existing `EditorFormActions` (§5) and is fixed.

**Why a projection, not a copy**: the AST has structural fields the user never
touches (`$type`, `$container`, `references`, `labels`, `ruleReferences`,
`typeCall.arguments`); driving a form against those produces noise and makes
overrides ubiquitous. The projection produces clean validation surface with
human-readable error messages and is the right layer for the form host to
consume.

---

## 3. Section data shapes

Each of the three section components reads its data from the surrounding form
context (`useFormContext`) plus prop-drilled commit callbacks. After Phase C
the components are registered against the components module and looked up via
`section:` declarations in `z2f.config.ts`; the data shapes are unchanged.

| Section | Data fields read from form context | Commit callbacks (today; preserved) |
|---------|-----------------------------------|------------------------------------|
| `AnnotationSection` | `annotations: AnnotationDisplayInfo[]` (derived from raw AST `annotations` via `annotationsToDisplay`; not currently in form state — passed as a prop) | `onAdd(name)`, `onRemove(index)` |
| `ConditionSection` | `conditions: ConditionDisplayInfo[]` (similar derivation; passed as a prop today) | `onAdd(condition)`, `onRemove(index)`, `onUpdate(index, updates)`, `onReorder(fromIndex, toIndex)` |
| `MetadataSection` | `definition` (string), `comments` (string), `synonyms` (`string[]`) — all read via `useFormContext().getValues(...)` and a `useFieldArray({ name: 'synonyms' })` | `onDefinitionCommit(string)`, `onCommentsCommit(string)`, `onSynonymAdd(string)`, `onSynonymRemove(index)` |

**Notable**: `AnnotationSection` and `ConditionSection` do **not** today put
their data into form state — they receive raw AST refs as props and project
internally. This is a deliberate decision (annotations are a flat AST array;
conditions are nested rich nodes). The migration **preserves this**: the
section components stay the right level of abstraction, and the typed config's
`section:` declaration only nominates the component, not the data wiring.

---

## 4. Row data shapes

Each inline row corresponds to one item-schema entry (`memberSchema` or its
specialized projection). The row component reads its index-scoped data via
`useFormContext` and the prefix `members.${index}` (Data/Choice forms),
`enumValues.${index}` (Enum form), or `inputs.${index}` (Function form). The
schema is scoped per form via the typed config (see `z2f.config.ts:99-149`).

| Row | Item schema | Field paths read | Per-row callbacks |
|-----|-------------|------------------|-------------------|
| `AttributeRow` (Data form) | `memberSchema` | `members.${i}.name`, `.typeName`, `.cardinality`, `.isOverride` | `onUpdate(i, oldName, newName, type, card)`, `onRemove(i)`, `onReorder(from, to)`, `onRevert?()` |
| `ChoiceOptionRow` (Choice form) | `memberSchema` (with `name` hidden via config) | `members.${i}.typeName`, `.cardinality` | `onUpdate(i, type, card)`, `onRemove(i)`, `onReorder(from, to)` |
| `EnumValueRow` (Enum form) | `enumValueSchema` (or `memberSchema` with `displayName`) | `members.${i}.name`, `.displayName` (or `enumValues.${i}.…`) | `onUpdate(i, oldName, newName, displayName)`, `onRemove(i)`, `onReorder(from, to)` |
| Function-input row (Function form) | `memberSchema` | `inputs.${i}.name`, `.typeName`, `.cardinality` | `onUpdate(i, …)`, `onRemove(i)`, `onReorder(from, to)` |
| `InheritedAttributeRow` (Data form, ghost row) | _none — pure render_ | n/a (ghost) | `onOverride()` |

**Ghost-row distinction**: `InheritedAttributeRow` does not participate in form
state. It is rendered alongside `AttributeRow` from the same `.map()` over
`effectiveAttributes` (the union of local + inherited rows produced by
`useEffectiveMembers`). After upstream `010` P2 lands, this becomes the
configured `arrayConfig.before/after` slot (R6).

---

## 5. `EditorFormActions` contract (unchanged)

**Source**: `packages/visual-editor/src/types.ts:343-372`
([reference](../../../packages/visual-editor/src/types.ts))

The action contract is fixed by the existing types. The migration does not
change action names, signatures, or fire timing. Preserving this contract is
the explicit FR-002 requirement.

**Action surfaces** (kind-narrowed via `EditorFormActions<K>`):

- **Common (all kinds)**: `renameType`, `setInheritance`, `updateDefinition`,
  `updateComments`, `addSynonym`, `removeSynonym`, `addAnnotation`,
  `removeAnnotation`, `addCondition`, `removeCondition`, `updateCondition`,
  `reorderCondition`.
- **Data**: `addAttribute`, `removeAttribute`, `updateAttribute`,
  `reorderAttribute`.
- **Enum**: `addEnumValue`, `removeEnumValue`, `updateEnumValue`,
  `reorderEnumValue`.
- **Choice**: `addChoiceOption`, `removeChoiceOption`, `updateChoiceOption`,
  `reorderChoiceOption`.
- **Func**: `addInput`, `removeInput`, `updateInput`, `reorderInput`,
  `setOutput`, `updateExpression`.

**Migration constraint**: every action is currently fired from a per-field
commit callback. Each callback is preserved or moved verbatim — the names,
arguments, and call sites continue to fire identically. This is what SC-007
(timing within ±50 ms) and FR-002 (no observable change) measure.

For the full type definitions, see `packages/visual-editor/src/types.ts`.

---

## 6. Typed-config entities (relationships)

**Source**: `packages/visual-editor/z2f.config.ts`

The typed config binds three things together:

- **Schemas listed under `include:`** — the post-migration list resolves to
  the form-surface schemas in `form-schemas.ts` (R1). Today the names match
  the AST-side schemas (`DataSchema`, …), which is the FR-008 mismatch this
  migration closes.
- **Field maps under `fields:` and `schemas.{X}.fields`** — declarative path-
  to-component bindings (e.g. `'attributes[].card': { component:
  'CardinalitySelector' }`). These are unchanged in shape; the only updates
  are: (a) per-form section declarations once Phase C lands, and (b) any
  paths that relocate when `members[]` becomes the canonical array name across
  all forms.
- **Component registrations under `components` + `fieldTypes`** — already
  point at the bespoke overrides (`TypeSelector`, `CardinalitySelector`); these
  stay. After Phase C/E, the components module also re-exports the registered
  sections (`AnnotationSection`, …) and rows (`AttributeRow`, …).

**Single source of truth (FR-008)**: post-migration, every name appearing in
`z2f.config.ts` resolves to a form-surface entity (a schema in
`form-schemas.ts` or a component in `zod-form-components.tsx`). No orphan
references on either side. SC-006 is the measurement.
