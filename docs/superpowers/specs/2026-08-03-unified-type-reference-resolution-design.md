<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Unified Type-Reference Resolution Across Codegen Emitters — Design

**Status:** Approved.
**Scope:** `packages/codegen` (MIT) — `zod-emitter.ts`, `ts-emitter.ts`, `json-schema-emitter.ts`,
`xsd-emitter.ts`, `sql-emitter.ts`, `preview-schema.ts`. No changes to `apps/studio` or any other
package's public shape; every consumer of these emitters (Form Preview, the Prototype workspace's
instance-editing schema fetch, and Export Code / the Code tab) benefits without being touched
directly, because they already call these shared functions.

**Originating bug report:** live production reproduction, 2026-08-03 — navigating to FpML's
`fpml.consolidated.SignatureType` in Form Preview reported `Type reference HMACOutputLengthType
could not be resolved for form preview`, plus five more type names under "recursive references
skipped" and "could not be resolved" — even though every referenced type is declared in the exact
same, already-fully-hydrated document as `SignatureType` itself.

## Goal

Every codegen emit target and Form Preview must resolve a field's type reference the same way,
including when that reference resolves to a `RosettaTypeAlias` (whether the alias points directly
at a primitive/Data/Choice, or chains through one or more further aliases). Close this gap ONCE, in
one shared place, instead of patching each emitter's own hand-rolled resolution logic separately.

## Background / Root Cause

Confirmed by live reproduction against production plus direct reading of every emit target's
attribute-type-resolution function:

Every one of `zod-emitter.ts::resolveTypeExpr`, `ts-emitter.ts::resolveTypeExprAsTs`,
`json-schema-emitter.ts::resolveItemSchema`, `xsd-emitter.ts::resolveAttributeType`, and
`preview-schema.ts::buildBaseField`/`buildChoiceOptionField` independently hand-rolls the same
shape of logic: check `isRosettaBasicType(typeRef)`, then `isRosettaEnumeration(typeRef)`, then
`isData(typeRef)`, then `isChoice(typeRef)` (each with a parallel `refText`-against-namespace-index
fallback for the "single file parsed without full workspace" case) — and if none of those match,
fall through to an "unresolved reference" diagnostic and a degraded output (`z.unknown()`,
`'unknown'`, `{}`, `xs:string`, or Form Preview's `kind: 'unknown'` field). **None of the five
checks a resolved `RosettaTypeAlias` target.** `sql-emitter.ts`'s inline resolution block has a
partial, primitive-only variant of the same gap (`resolveAliasBuiltin` chases an alias to a
primitive but not to a Data type or a further alias).

This is not a new category of bug in this codebase. Multiple of these same files carry comments
documenting that `isChoice` was *previously* missing from this exact hand-rolled chain in multiple
emitters independently ("W2" fixes, PR references in `json-schema-emitter.ts`/`ts-emitter.ts`),
each discovered and patched separately rather than fixed once at the root. Type Alias is the same
failure mode recurring, and per this repo's `CLAUDE.md` rule #1 (DRY — see the `preview-validator.ts`
vs. `zod-emitter.ts` incident it documents), the fix is to collapse the duplication, not add a sixth
independent patch.

`packages/codegen/src/emit/namespace-walker.ts` already centralizes the per-namespace *indexes*
(`dataByName`/`enumByName`/`choiceByName`/`typeAliasByName`) every emitter receives via
`NamespaceWalkResult`. What's duplicated is the *resolution logic* built on top of those indexes —
that's the actual gap this design closes.

## Constraints

- No change to any emitter's existing output shape or diagnostic message text for the
  already-working cases (primitive/Enum/Data/Choice) — this is a resolution-logic fix, not a
  behavior change for anything that already works.
- `sql-emitter.ts`'s FK/join-table modeling and `resolveAliasBuiltin`'s existing
  unresolved-vs-resolved distinction (an unresolved alias target must still warn, not silently
  map to `TEXT`) must be preserved.
- Every migrated emitter's unresolved-reference diagnostic keeps its own existing message wording —
  the resolver signals "unresolved" via `onUnresolved`, and the diagnostic-push mechanism itself is
  shared (`BaseNamespaceEmitter.reportUnresolvedReference`), but each emitter supplies its own
  `fallbackDescription` so the emitted message text is unchanged.
- Alias-to-alias chains must be bounded (defensive cycle/depth guard) — a malformed circular alias
  chain must not hang generation.

## Architecture

A new file `packages/codegen/src/emit/type-ref-resolver.ts` (MIT), a sibling of
`namespace-walker.ts`. It exports one function using a visitor/callback shape rather than a
discriminated union the caller switches on — this makes "forgetting a terminal kind" a compile
error (a required visitor field) rather than a silently-unhandled `switch` branch, which is exactly
today's failure mode:

```ts
export interface TypeResolutionVisitor<T> {
  onPrimitive(basicTypeName: string): T;
  onEnum(node: RosettaEnumeration, sourceUri: string): T;
  onData(node: Data, sourceUri: string): T;
  onChoice(node: Choice, sourceUri: string): T;
  onUnresolved(refText: string | undefined): T;
}

export function resolveTypeCallTarget<T>(
  typeCall: RosettaTypeCall | undefined,
  namespace: TypeIndexLookup,   // the subset of NamespaceWalkResult every emitter already threads through: dataByName/enumByName/choiceByName/typeAliasByName
  visitor: TypeResolutionVisitor<T>
): T
```

`resolveTypeCallTarget` walks the same precedence every emitter already uses today: direct
`typeCall.type.ref` first, `typeCall.type.$refText`-against-`namespace` fallback second (preserving
the existing "single file parsed without full workspace" behavior every emitter's docstring already
documents). The new behavior: **if the resolved target is a `RosettaTypeAlias`, the resolver
recurses into that alias's own `typeCall` instead of giving up**, bounded by a visited-`Set` of
alias qualified-ids (not a depth counter — a `Set` catches a real cycle exactly, a depth cap alone
would just delay the same failure) so a malformed circular alias chain can't hang generation;
hitting that guard calls `onUnresolved` with the original `refText`. Callers never see a
`'typeAlias'` case — referencing an alias behaves exactly like referencing whatever it ultimately
resolves to, matching what `buildTypeAliasSchema` already does correctly today for the "alias is
the top-level target" case (which this design also migrates to call the resolver internally,
collapsing that duplication too).

## Data Flow

Traced through the reproduced case (`SignatureType.signatureMethod: SignatureMethodType`,
`SignatureMethodType.hmacOutputLength: HMACOutputLengthType`, where `HMACOutputLengthType` is a
`typeAlias` in the same document):

```
buildField(hmacOutputLength attribute) in preview-schema.ts
  └─ resolveTypeCallTarget(attr.typeCall, namespace, visitor)
       typeCall.type.ref → RosettaTypeAlias(HMACOutputLengthType)
       NOT a terminal kind → recurse into HMACOutputLengthType.typeCall
         resolves to e.g. a primitive (or a further alias — same recursion, visited-Set guarded)
       └─ visitor.onPrimitive('int') called
  └─ Form Preview's onPrimitive returns a scalar PreviewField — 'ready', not 'unresolved'
```

The same trace applies unchanged to `zod-emitter.ts` (→ the correct Zod validator instead of
`z.unknown()`), `ts-emitter.ts` (→ the correct TS type instead of `'unknown'`), and so on for every
migrated emitter.

## Components & Changes

1. **New** `packages/codegen/src/emit/type-ref-resolver.ts` (MIT) — `resolveTypeCallTarget` +
   `TypeResolutionVisitor`, framework-agnostic, unit-testable in isolation against a synthetic
   `NamespaceIndex`-shaped fixture.
2. `packages/codegen/src/emit/base-namespace-emitter.ts` — gains
   `protected readonly diagnostics: GeneratorDiagnostic[]` (initialized in the constructor) and a
   `protected reportUnresolvedReference(attrName: string, refText: string | undefined,
   fallbackDescription: string): void` helper that pushes the standard `{severity: 'warning', code:
   'unresolved-ref', message: ...}` diagnostic shape every emitter already pushes today —
   `fallbackDescription` is the one piece that legitimately differs per emitter (what it falls back
   to emitting: `'z.unknown()'`, `'unknown'`, `'{}'`, `'xs:string'`), so each emitter's message text
   is unchanged, only the object-construction and push boilerplate is shared. Every real emitter's
   `onUnresolved` visitor callback becomes a one-line call to it, instead of each hand-rolling the
   diagnostic object — closing the smaller, parallel duplication this design's own migration would
   otherwise just relocate rather than fix.
3. `packages/codegen/src/emit/zod-emitter.ts` — `resolveTypeExpr` becomes a thin visitor
   implementation calling `resolveTypeCallTarget`; same for its `resolveTypeExprAsTs` z.infer-type
   sibling if it duplicates the same chain. Its `ctx.diagnostics` (from `EmissionContext`) becomes a
   reference to `this.diagnostics` from the base class (constructed by passing `this.diagnostics`
   into `buildEmissionContext`) rather than its own separate array — this is the one pre-existing
   inconsistency the base-class move surfaces: `zod-emitter.ts`/`ts-emitter.ts`/
   `json-schema-emitter.ts` currently push via `this.ctx.diagnostics`, while `xsd-emitter.ts`/
   `sql-emitter.ts` push via `this.diagnostics` directly. Unifying onto the base class's array means
   every emitter's diagnostics end up in the same place regardless of which internal path pushed to
   it.
4. `packages/codegen/src/emit/ts-emitter.ts` — `resolveTypeExprAsTs` migrated the same way; same
   `ctx.diagnostics` → `this.diagnostics` reference change as zod-emitter.ts.
5. `packages/codegen/src/emit/json-schema-emitter.ts` — `resolveItemSchema` migrated the same way;
   same `ctx.diagnostics` → `this.diagnostics` reference change.
6. `packages/codegen/src/emit/xsd-emitter.ts` — `resolveAttributeType` migrated the same way;
   already uses `this.diagnostics` directly, so no storage change needed here, only the resolver
   migration and the `reportUnresolvedReference` call.
7. `packages/codegen/src/emit/sql-emitter.ts` — the inline per-attribute resolution block in
   `emitData` migrated to call the resolver; `resolveAliasBuiltin`'s existing
   resolved-vs-unresolved primitive distinction is preserved inside the new `onPrimitive`/
   `onUnresolved` handlers, not deleted. Already uses `this.diagnostics` directly, same as
   xsd-emitter.ts.
8. `packages/codegen/src/preview-schema.ts` — `buildBaseField` and `buildChoiceOptionField`
   (both currently missing the Type Alias case, confirmed by direct reading) migrated to call the
   resolver; `buildTypeAliasSchema`'s own "alias resolves to Data" branch also delegates to it.
   Unaffected by the `BaseNamespaceEmitter`/`reportUnresolvedReference` change — this file is
   function-based, not a `BaseNamespaceEmitter` subclass, and keeps its own, materially different
   diagnostic model (`unsupportedFeatures: Set<string>` tags on a `FormPreviewSchema`, not a
   `GeneratorDiagnostic[]`).

## Error Handling

- Each of the five real emitters' `onUnresolved` implementation calls
  `reportUnresolvedReference(attrName, refText, fallbackDescription)` with its own existing
  `fallbackDescription` text (`'z.unknown()'`, `'unknown'`, etc.) — the diagnostic's severity, code,
  and overall message shape are now shared, but the emitter-specific "what this falls back to"
  detail, and therefore the full message text, is unchanged for callers depending on specific
  wording (e.g. any snapshot tests). `preview-schema.ts`'s `onUnresolved` is untouched by this —
  see its own diagnostic model, above.
- The alias-chain cycle guard's `onUnresolved` call carries the *original* `refText` (the field's
  own reference, not the alias mid-chain that closed the cycle) so the emitted diagnostic still
  reads naturally as "this field's type didn't resolve," not an internal implementation detail.
- `sql-emitter.ts`'s existing "an unresolved alias target must still warn, not silently map to
  TEXT" behavior is preserved via its `onUnresolved` handler calling `reportUnresolvedReference`.

## Testing

- `type-ref-resolver.test.ts` (new): all five terminal kinds, both the direct-`typeRef` and
  `refText`-fallback paths for each, a 2+-hop alias-to-alias chain resolving to each terminal kind,
  and the cycle-guard cap (a malformed circular alias chain resolves to `onUnresolved`, does not
  hang).
- Each migrated emitter's existing test suite gains two cases: a field whose type is a
  type-alias-to-Data and a field whose type is a type-alias-to-primitive, asserting the correct
  non-degraded output (real Zod validator / real TS type / real XSD type / real JSON Schema `$ref`
  / real SQL column or FK, not the old fallback).
- `base-namespace-emitter.test.ts` (new or extended): `reportUnresolvedReference` pushes a
  diagnostic with the expected shape and the passed-in `fallbackDescription`. One existing test per
  `EmissionContext`-based emitter (zod/ts/json-schema) confirms `ctx.diagnostics` and
  `this.diagnostics` are the same array post-migration (a diagnostic pushed via either path is
  visible via both), proving the storage unification didn't silently split diagnostics into two
  untracked places.
- **Live verification** once implemented: re-run the `fpml.consolidated.SignatureType` repro
  against production, confirming `HMACOutputLengthType`/`DigestValueType` resolve. Additionally
  verify the Prototype workspace's instance-editing schema fetch (`instance:generateSchema`) and
  Export Code's generated TypeScript/Zod output for the same type also now resolve correctly,
  confirming the shared-function propagation claim (both already call the same
  `generatePreviewSchemas`/`generate` functions this design fixes, so no separate code path should
  need touching for those surfaces to benefit).

## Non-Goals

- No change to `sql-emitter.ts`'s table-modeling decisions (FK vs. join table vs. inline column)
  for Data/Choice/Enum references — only the primitive/alias-chain resolution gap.
- No change to any emitter's cross-namespace import-tracking logic (a separate, already-correct
  concern in each emitter, e.g. `zod-emitter.ts`'s `typeAliasByName` import-tracking loop near its
  `resolveTypeExpr` — that loop already recognizes Type Alias correctly for import purposes; only
  the *field-resolution* logic has the gap).
- No change to `namespace-walker.ts`'s index-building — the indexes it already builds
  (`typeAliasByName` included) are sufficient inputs for the new resolver.

## Licensing

All new/changed files are under `packages/codegen/` (MIT), unchanged licensing.
