# Transpiler & Emitter Parity — Design (W1 expressions + W2 constructs)

**Follows:** the P1–P5 renderer roadmap (complete). New effort: close the gap between the renderer's full 48-type `RosettaExpression` coverage and the expression **transpiler** (`packages/codegen/src/expr/transpiler.ts`), which feeds BOTH `ts-emitter` and `zod-emitter`.

## Problem

16 of 48 expression `$type`s are unhandled by the transpiler — **verified empirically**: a minimal node of each `$type` fed through the built `transpileExpression` produces the diagnostic fallback (grep of guard names alone was insufficient evidence; the only raw `$type ===` checks in the transpiler are ListLiteral internals). The verified list:
`AsKeyOperation, WithMetaOperation, DefaultOperation, JoinOperation, RosettaOnlyElement, ReduceOperation, ToStringOperation, ToNumberOperation, ToIntOperation, ToEnumOperation, ToDateOperation, ToTimeOperation, ToDateTimeOperation, ToZonedDateTimeOperation, SwitchOperation, RosettaSuperCall`. Each falls through to the unknown-type diagnostic and emits `true /* DIAGNOSTIC: ... */` — the emitted TypeScript/Zod validation **silently passes** where the source demanded a real check (under-validation). Scope decision (user): implement **all 16** up front (option B), not frequency-driven.

## Ground truth (verified)

- Emitted temporal types are **strings** (`ts-emitter.ts:861-863`: `date`/`dateTime`/`zonedDateTime` → `'string'`; verify `time` at implementation).
- Transpiler conventions: `ctx.selfName` data root; list-safety via `(x ?? [])`; lambda plumbing exists for filter/map/sort/min/max; three emit modes (`zod-refine` boolean / `zod-superRefine` addIssue / `ts-method` errors array) — new cases must be mode-agnostic **expression** emitters like the existing ones (they return JS expression strings; mode handling stays in the condition wrapper).
- Rune semantics reference: the structural renderer + grammar; empty/absent is the transpiler's existing `undefined`-propagation convention — match sibling cases, don't invent.

## Per-type semantics (the design)

**Tier 1 — passthrough (metadata no-ops in validation):**
- `AsKeyOperation`, `WithMetaOperation` → transpile `argument` and return it unchanged (the key/meta annotations have no runtime meaning in a validation predicate). Comment each case with WHY.

**Tier 2 — simple mappings:**
- `DefaultOperation` → `(L ?? R)` with the transpiler's list/empty conventions: emit `((l) => (l === undefined || (Array.isArray(l) && l.length === 0)) ? R : l)(L)`-style ONLY if sibling cases treat empty-list-as-absent; otherwise plain `(L ?? R)`. Match whatever `exists`/`absent` already treat as "empty" — consistency over cleverness.
- `JoinOperation` → `(L ?? []).join(R ?? '')` (grammar: right optional; Rune joins string lists).
- `RosettaOnlyElement` → single-element extraction consistent with how `first`/`last` are already emitted (read those; mirror the guard style): value when exactly one element, else undefined.
- `ReduceOperation` → `.reduce` using the existing two-parameter lambda plumbing (grammar: `parameters` carries 2 closure params; filter/map handle 0/1 — extend the helper if needed).

**Tier 3 — conversions (temporal = string representation):**
- `ToStringOperation` → `String(arg)` guarded for undefined (`arg === undefined ? undefined : String(arg)` per sibling conventions).
- `ToNumberOperation` → `Number(...)` with NaN→undefined.
- `ToIntOperation` → integer parse with fraction/NaN→undefined (Rune: to-int fails on non-integers — verify against rune-dsl docs/tests if present; otherwise `Number.isInteger` gate).
- `ToEnumOperation` → membership coercion against the emitted enum: the ts-emitter emits enum types/values — emit a lookup that returns the enum value when the string matches a member (display name or value name per how enums are emitted; VERIFY against the actual emitted enum shape), undefined otherwise.
- `ToDateOperation` / `ToTimeOperation` / `ToDateTimeOperation` / `ToZonedDateTimeOperation` → since the runtime representation is `string`: validate-shape-and-passthrough — return the input string when it matches the expected ISO shape (date `YYYY-MM-DD`, time `HH:MM:SS`, datetime ISO-8601 local, zoned ISO-8601 with zone), undefined otherwise. One shared helper emitted inline or in the transpiler's preamble (check if a preamble/helpers mechanism exists; if not, self-contained IIFE per site is acceptable — implementer's call, DRY-preferring).

**Tier 4 — switch:**
- `SwitchOperation` → chained ternaries over an IIFE binding: `((__sw) => g1 === __sw ? e1 : g2 === __sw ? e2 : defaultExpr)(ARG)`. Guards: `referenceGuard` compares against the emitted enum member (same resolution as `ToEnumOperation`) or symbol value; `literalGuard` compares against the transpiled literal. `default` case = the trailing else; NO default case → undefined as the final else. Argument-less switch (standalone form) uses `ctx.selfName`/implicit item per the sibling argument-less conventions.

**The one exception — `RosettaSuperCall`:**
- `super(...)` has no referent in a validation-predicate context (it's a func-body construct; conditions have no enclosing function dispatch). Implement it as a **deliberate, loud diagnostic**: keep emitting the safe `true` fallback BUT through an explicit `case` with its own diagnostic text ("super() is not supported in transpiled conditions") + a unit test pinning that exact behavior — deliberate handling, not silent fall-through. If the corpus gate (below) shows real conditions using `super`, escalate to the controller instead of guessing semantics.

## Verification — the corpus diagnostic gate

New corpus-driven harness (sweep-style, `.resources/`-guarded): walk every parsed corpus document's `Condition.expression`, transpile each through `transpileExpression` (a neutral ctx), and count emitted `/* DIAGNOSTIC` markers. **Gate: zero diagnostics across the corpus** except the deliberate `super` case (assert its count too — expected 0 occurrences in corpus; if >0, the gate fails loudly and we escalate). Record the pre-work baseline count in the report for the record. Plus: unit tests per new case (all three emit modes where behavior differs), and P4's noted gap — chained same-tier operator regression tests — folded in opportunistically.

## Non-goals

- No transpiler precedence-table unification with the renderer (P4 verdict: current table is semantically sound; still out of scope).
- No new runtime library for temporal types (strings stay strings).
- No changes to renderer/render-core/VE.

## Files

- Modify `packages/codegen/src/expr/transpiler.ts` (16 new cases + helpers).
- Test `packages/codegen/test/` — extend the transpiler unit tests; new `condition-transpile-corpus.test.ts` (diagnostic gate).


## W2 — Construct-level gaps (user decision: fold in; Choice = discriminated union)

**Choice (17 corpus declarations, currently 100% unemitted):** the namespace walker never collects `Choice` elements, so neither emitter produces anything for them, and attributes *typed by* a Choice fall to `unknown` in the typeRef mapping. Design (user-directed):
- Walker: add `choiceByName: ReadonlyMap<string, Choice>` to `NamespaceWalkResult`; include choices in `emitOrder`/reference-graph like Data.
- ts-emitter: emit a **discriminated union by key presence** — one single-option object shape per `ChoiceOption`, field naming per the existing Data-attribute emission conventions (CDM JSON encodes a choice instance as an object with exactly one option field): `export type Asset = { cash: Cash } | { commodity: Commodity } | …` (exact field-name casing MUST mirror how the same option would be emitted as a Data attribute — verify against emitInterface, don't invent). Plus a type-guard/validator asserting exactly-one-of, following the file's existing guard/validate conventions.
- zod-emitter: `z.union([...])` of the per-option `z.object` shapes (key-presence discrimination; `z.discriminatedUnion` doesn't apply), mirroring whatever option-schema conventions the Data path uses.
- typeRef mapping: `isChoice(typeRef) → typeRef.name` in both emitters' type-mapping paths (ends the `unknown` fallback).

**RecordType (6 decls) / MetaType (6 decls) — audit item:** determine whether the `builtinTypeMap`-by-refText fallback already maps every corpus record/meta type; if yes, document it; if any falls to `unknown`, map it explicitly. Small, evidence-first.

**Explicit N/A (decision, not oversight):** `RosettaBody`/`RosettaCorpus`/`RosettaSegment`/`RosettaSynonymSource`/`RosettaExternalRuleSource` are regulatory/mapping metadata with no runtime meaning in emitted TS — deliberately unemitted.

**Leverage note:** func bodies (1,328 corpus funcs) flow through the same expression transpiler — W1 directly improves emitted func bodies, not just condition predicates.