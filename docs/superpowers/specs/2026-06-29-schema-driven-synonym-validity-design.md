# Schema-Driven Synonym Validity — Design

**Date:** 2026-06-29
**Status:** Proposed (awaiting review)
**Author:** Pradeep Mouli (with Claude)
**Builds on:** B2 editable-surface rendering (rune #350, merged). Follow-up
recorded in memory `project_schema_driven_synonym_validity`.

## Problem

B2 made the visual editor's synonym editing *round-trip* but not *valid*. The
metadata UI collects a synonym as a single free-text tag; the store builds a
`RosettaClassSynonym`/`RosettaSynonym`, and render-core hand-rolls per-construct
validity guards (return `null` when a grammar-required field is missing) so it
never emits unparsable `[synonym ]`. Two things are wrong with that shape:

1. **Validity is hand-rolled in the renderer**, duplicating constraints that
   belong to the schema (the SSoT). The grammar requires `[' 'synonym'
   sources+=[RosettaSynonymSource:QualifiedName] …` — at least one source, each a
   *cross-reference* to a declared `RosettaSynonymSource`.
2. **The validation layer already exists at z2f** and is bypassed. Forms use
   `useZodForm(Schema, { mode: 'onChange' })`, and langium-zod even emits
   `createRosettaClassSynonymSchema(refs)` ref-factories that validate `sources`
   as cross-references against the available `RosettaSynonymSource` names. But the
   synonym field is edited as a `string[]` tag list (`appendSynonym(string)`,
   `getValues('synonyms'): string[]`) and committed unconditionally, so the
   schema-validated, ref-checked path z2f provides is never exercised.

Separately, the generated schema cannot fully express the grammar: langium-zod
emits `.array(...).min(1)` only when a single rule call carries an explicit `+`.
The comma-list idiom `sources+=X (',' sources+=X)*` (≥1 by grammar) carries no
`+` on any single assignment, so `RosettaSynonymSchema.sources` is a bare
`z.array(...)` that accepts `[]`. So even a correct z2f path would not reject an
empty `sources` until langium-zod is taught to recover the minimum from the
grammar.

## Goals

- Synonym `sources` is edited through z2f as a **cross-reference field**
  (pick a declared `RosettaSynonymSource`), not a free-text tag — so z2f
  validates it natively on change (presence, ref validity).
- Cover all three synonym constructs across two enum control locations:
  - **`RosettaClassSynonym`** (Data/Choice) — source picker only (`value`
    optional) → `[synonym SRC]`.
  - **`RosettaSynonym`** (enum-level, on the enumeration) — source picker **+ a
    value field** → `[synonym SRC value "X"]`, edited in the shared metadata
    control.
  - **`RosettaEnumSynonym`** (per enum value) — source picker **+ a value field**
    → per-value `[synonym SRC value "X"]`, edited in a **new control in
    `EnumForm`'s value rows**.
- The generated schema expresses "≥1 source": langium-zod emits `.min(1)` for the
  comma-list `+=` idiom, so an empty `sources` is invalid at the schema level.
- Remove render-core's hand-rolled synonym validity guards — with valid input
  guaranteed upstream, the renderer trusts its input.

## Non-Goals (deferred)

- **Non-empty-body refine in langium-zod.** The `RosettaSynonymBody`
  content-bearing constraint (must have one of value/hint/merge/meta) is a
  mandatory-*alternative-group* requirement that lowers to a Zod `.refine()`/union,
  not a field flag. Deferred — and **not needed** here: the enum-level synonym's
  value field always populates `body.values` by construction, so the UI never
  produces a body-less synonym; `body` being *required* is already in the schema.
  Only the abstract "body present but empty" case (which the UI cannot reach)
  stays unenforced at the schema level.
- **Richer synonym body shapes.** Enum synonyms support only the minimal
  `value "X"` body (`RosettaSynonymBody.values` / `RosettaEnumSynonym.synonymValue`).
  The `hint`/`merge`/`meta`/`mappingLogic` body alternatives, plus the
  `dateFormat`/`pattern`/`removeHtml`/`mapper` modifiers, are not inspector-editable
  and ride CST when unchanged.
- **A `mutateGraph` schema write-gate** and a generated `$type→Schema` registry —
  considered and dropped: z2f's per-type `createXSchema` factories already are
  the validation layer; a parallel store gate would duplicate it and risk
  false-rejecting curated/typeKind-only nodes.
- **UX for a blocked add** beyond what z2f surfaces today (inline field error).

## Architecture

Two separable units. Piece B (langium-zod) is a dependency of Piece A's "≥1"
enforcement but otherwise independent; Piece A delivers the ref-field even
against today's schema (where presence is enforced but `[]` still slips through).

### Piece A — synonym source as a z2f cross-reference field (rune, visual-editor)

**A1. Focused source-ref picker on shared primitives.** `TypeReferenceField` is
the canonical *type*-reference surface, used at ~5 call sites (DataTypeForm
superType, TypeAliasForm wrapped type, FunctionForm input + output types,
AttributeRow, EnumForm parent), and `CardinalityPicker` mirrors its idiom — but
*all* of those are type refs that depend on its type-coupled behavior
(`TypeOption.kind`→`TypeChip` colors, the type-ref drop target, the type-node nav
arrow, `NamespaceTreePicker`). Synonym source is the **first non-type ref field**,
which wants none of that. So `TypeReferenceField` is left **unchanged** (no
generalization — 5 type-ref sites depend on it, and a source picker reuses none
of the type-specific surface), and the source picker is built directly on the
shared design-system primitives it and the source picker have in common: a
`Popover` whose trigger is a neutral ref chip and whose content is a flat list of
`options` (`value`/`label`), with `nodrag/nopan` on interactive controls. The
genuinely shared shell is ~15 lines over the design-system `Popover`; extracting
a generic `ReferenceField` core is **deferred (YAGNI)** until a *second* non-type
ref consumer exists.

`ReferenceOption` is `{ value: string; label: string; namespace?: string }`
(the ref's canonical id, display name, and namespace for cross-namespace
qualification — mirroring `TypeOption`'s ref-relevant subset).

**A2. Gather `RosettaSynonymSource` options.** `RosettaSynonymSource` is a
top-level model element (`'synonym' 'source' RosettaNamed …`), not a graph node,
and nothing in VE surfaces it today. Add a collection step that, at
parse/load, walks the workspace model elements for `$type ===
'RosettaSynonymSource'` and produces `ReferenceOption[]` (value =
`namespace.Name` canonical id, label = bare name, namespace). Plumb it through
`EditorFormPanel` to the metadata surface exactly as `availableTypes` is plumbed
to the attribute pickers.

**A3. Host-aware synonym control in the metadata surface.** Replace
MetadataSection's string-tag synonym input with a `sources` editor: a
`useFieldArray` over the synonym's `sources`, each row a `SourceRefField` (the A1
focused picker) bound to the synonym-source options, plus add/remove (same row
pattern as attributes). The control is **host-aware**:

- **Data/Choice** → `RosettaClassSynonym` (`sources: [{ $refText }]`, optional
  `value`), validated by `createRosettaClassSynonymSchema(refs)`.
- **Enum (enumeration-level)** → `RosettaSynonym` with an added **value text
  field** producing `body: { values: [{ name: "X" }] }`
  (`sources: [{ $refText }], body`), validated by `RosettaSynonymSchema`.

Cross-namespace sources qualify their `$refText` as `namespace.Name` (mirroring
the TypeAlias wrapped-type qualify from #350). The unconditional
`appendSynonym(string)` + direct `addSynonym(string)` commit path is removed;
commits flow through the validated form field. The store's `addSynonym` is
updated to carry the picked source ref (+ value for the enum-level case) instead
of a bare string.

**A4. Per-enum-value synonym control in `EnumForm`.** Add a new synonym editor in
`EnumForm`'s enum-value rows for `RosettaEnumSynonym` (today not surfaced at all):
a `useFieldArray` over the enum value's `enumSynonyms`, each entry a
`SourceRefField` **+ a value text field** producing
`{ $type: 'RosettaEnumSynonym', sources: [{ $refText }], synonymValue: "X" }`
(`[synonym SRC value "X"]`), validated by `RosettaEnumSynonymSchema`. A new store
action (`addEnumValueSynonym(enumNodeId, valueIndex, sourceRef, value)` /
removal) routes the mutation through `mutateGraph`.

**A5. Remove render-core synonym guards.** With upstream input guaranteed valid,
`renderClassSynonym`/`renderSynonym`/`renderEnumSynonym` drop their
`null`-on-missing-field guards and emit unconditionally. (Render-core stays a
pure structural emitter; no schema import.)

### Piece B — langium-zod `.min(1)` for the comma-list idiom (sibling repo)

A new grammar-analysis pass computes each array property's **minimum
occurrence**: for every grammar `Assignment` that targets the property (available
from the `collectAst` type model's originating nodes / the `Grammar`), walk the
ancestor chain to the `ParserRule`; the property's minimum is ≥1 if **any**
assignment occurs on an unconditional path (no `?`/`*` cardinality and no
optional `Alternatives`/group ancestor). For an array property (`+=`) with
minimum ≥1, emit `.array(...).min(1)`. This is **additive** to the existing
`cardinality === '+'` rule, which stays. Release langium-zod `0.9.0 → 0.9.1`
(additive, backward-compatible: schemas only gain `.min(1)`), update the exact
pin in `pnpm-workspace.yaml`, and regenerate core + VE schemas. The
`check-generated` CI job guards drift.

## Data flow

```
parse workspace → model.elements
  ├─ Data/Choice/Enum/… → graph nodes (existing)
  └─ RosettaSynonymSource → ReferenceOption[]  (A2, new)
                                  │ plumbed via EditorFormPanel (like availableTypes)
                                  ▼
inspector forms (useZodForm(Schema, onChange))
  MetadataSection → sources useFieldArray            (A1/A3, Data/Choice/Enum)
     each row: <SourceRefField options={sourceOptions}/> [+ <ValueField/> if enum]
        Data/Choice → {sources:[{$refText}]}                 → RosettaClassSynonym
        Enum        → {sources:[{$refText}], body:{values:[{name}]}} → RosettaSynonym
        z2f validates via create*Schema(refs)  ← min(1) from Piece B
  EnumForm value row → enumSynonyms useFieldArray   (A4, per enum value)
     each row: <SourceRefField/> + <ValueField/>
        → {sources:[{$refText}], synonymValue}            → RosettaEnumSynonym
        z2f validates via RosettaEnumSynonymSchema
  ▼
render-core renderClassSynonym / renderSynonym / renderEnumSynonym
  → emit unconditionally (A5)
```

## Key decisions

- **Validation lives at z2f** (the form), not a store gate or the renderer. The
  schema (with Piece B's `.min(1)`) is the SSoT; z2f enforces it on change.
- **Focused source picker on shared primitives, `TypeReferenceField` untouched.**
  It's the canonical type-ref surface at ~5 type-coupled call sites; a non-type
  source picker reuses none of its type-specific behavior, so generalizing it is
  pure regression risk. Build on the shared `Popover`+chip+list primitives now;
  extract a generic `ReferenceField` core only when a second non-type ref field
  appears (YAGNI).
- **`ReferenceOption` is a minimal `{value,label,namespace}`**, not `TypeOption`
  (no `kind`/chip-color coupling).
- **langium-zod min-1 is additive**; the `'+'` rule is preserved.

## Risks

- **No declared `RosettaSynonymSource` in real corpora.** If a workspace declares
  no sources, the picker is correctly empty and a synonym cannot be added (you
  cannot reference a source that doesn't exist) — acceptable, but it means
  Piece A's UI value is gated on corpora actually using synonym sources. Verify
  during planning with the `.resources/` corpus; if absent, Piece B (min-1) still
  stands on its own (it fixes every comma-list `+=` property, not just sources).
- **min-1 analysis correctness.** The ancestor-cardinality walk must handle
  nested groups, alternatives, and multi-producer types (e.g.
  `RosettaExternalEnumSynonym infers RosettaEnumSynonym` omits `sources`, so the
  *merged* type's minimum is 0 — must stay `.optional()`/no-min). Covered by a
  unit matrix (below).
- **Regeneration churn / lockstep.** The `.min(1)` tightens form validation;
  re-run the full VE suite and watch the `@zod-to-form` pin lockstep
  (`project_zod_to_form_pin`).
- **Removing render-core guards.** Parsed data is valid by parse; the upstream
  field guarantees valid new synonyms — but a defensive review must confirm no
  other path constructs synonyms unvalidated before the guards come out.
- **New `EnumForm` value-row surface (A4).** `RosettaEnumSynonym` is not edited
  anywhere today, so A4 is net-new UI + a new store action + plumbing the source
  options into the value rows — the largest single piece of Piece A. It can be
  staged last (A1–A3 deliver the class + enum-level coverage independently).

## Testing

- **langium-zod (Piece B):** unit matrix on minimal grammars — comma-list
  `x+=A (',' x+=A)*` → `.min(1)`; explicit `x+=A+` → `.min(1)` (unchanged);
  optional `x+=A*` and `(x+=A)*` → no min; multi-producer where one producer
  omits the property → no min (stays optional). Plus a regression that the rune
  grammar regenerates `RosettaSynonymSchema.sources` / `RosettaClassSynonymSchema.sources`
  with `.min(1)` and unrelated arrays are unchanged.
- **rune (Piece A):** `SourceRefField` renders options + selects (component
  test); MetadataSection adds/removes a source and commits a schema-shaped
  `RosettaClassSynonym` (Data/Choice) and a `RosettaSynonym` with `value`
  (enum-level); `EnumForm` value-row control commits a `RosettaEnumSynonym`
  (source + value); z2f flags an empty `sources` invalid post-regen;
  cross-namespace source qualifies `$refText`; render round-trips of each of the
  three synonym kinds (picked source [+ value]) re-parse; the full VE suite stays
  green with the render-core guards removed.

## Rollout

1. **Piece B** in langium-zod: implement min-1 analysis + unit matrix; release
   `0.9.1`.
2. **rune integration:** bump the pin, regenerate core + VE schemas (verify the
   `.min(1)` diff is confined to comma-list `+=` properties).
3. **Piece A:** `SourceRefField` (A1) → source-options gather + plumb (A2) →
   host-aware MetadataSection control (A3, class + enum-level) → `EnumForm`
   per-enum-value control (A4) → remove render-core guards (A5), each with tests.

Piece A's A1–A2 have no dependency on Piece B and can land first; A3/A4's
empty-source rejection and A5's guard removal assume the regenerated `.min(1)`
schema, so they sequence after step 2.
