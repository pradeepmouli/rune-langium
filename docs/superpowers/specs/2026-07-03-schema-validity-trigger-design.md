# Schema-as-Validity-Trigger — Design (three-repo)

**Closes the follow-up queued in the schema-driven-synonym-validity effort (#349/#350/#357):** make the generated zod schema the single validity oracle — `safeParse` drives BOTH the z2f form feedback (already wired since #357) and render-core's structural-render-vs-CST-fallback decision. One definition of "valid," two presentations.

**Repos:** `zod-to-form` (sibling, we own; changesets) · `langium-zod` (sibling, we own; 0.10.1 pinned) · `rune-langium`.

## Ground-truth findings (audited 2026-07-03)

- **min-1 is partially shipped** (langium-zod 0.10.1): `resolveArrayMinItems` (extractor.ts:76–96) detects `+=` WITH a `'+'` cardinality marker. The **comma-list idiom** (`xs+=X (',' xs+=X)*` — first assignment mandatory, no `'+'` marker) is NOT detected → `Choice.attributes`, `RosettaEnumeration.enumValues`, `Data.attributes` all emit `.optional()` today.
- **Oracle gaps (schema passes, render invalid):** empty `Choice`/`Enum` (render `choice C:`/`enum E:` with no body — invalid DSL); `RosettaSynonymBody` with no non-empty alternative among {values, hints, merge, mappingLogic, metaValues} (the render-synonym-body.ts:252 throw case); `RosettaMappingInstance` with none of {default, set, when}. Each of these is ALSO a z2f blind spot — forms report them valid today.
- **Arrays are never `undefined` in parse output** (Langium `assignMandatoryProperties`, probe-verified) — `.optional()` on array props admits a never-produced shape. Convention decided earlier: []-canonical; arrays are always present, possibly empty.
- **VE forms are LIVE-APPLY mirrors** — no submit event exists; actions fire regardless of validation state (`onUpdate()` never checks `isValid`). z2f runs `mode` per RHF ('onSubmit'|'onChange'|'onBlur', static), displays errors unconditionally once they exist; RHF's touched/dirty state is tracked but never consulted.
- **Browser boundary:** render-core's `@rune-langium/codegen/rosetta` subpath is zod-free by design. The VE already imports `generated/zod-schemas.ts` (z2f forms), so the gate lives VE-side.
- **Version anomaly to resolve before releasing z2f:** rune pins `@zod-to-form/react: 0.10.2` but the sibling repo's `packages/react/package.json` says `0.10.1` — the working tree may be behind the published head. Sync/verify FIRST.

## Decisions (user-selected)

1. **Touched-gated error display** (not submit-boundary retrofit): validation always RUNS; error DISPLAY per field is suppressed until the field is touched/dirty. Quiet fresh objects, honest the moment the user engages. Works uniformly for new and existing objects.
2. **[]-canonical arrays**: tighten generated array props — no `.optional()` on array-typed properties (parser always materializes `[]`); min-1 where the grammar demands ≥1.
3. **Gate at the VE serializer seam** (cst-reuse-renderer), keeping render-core's rosetta subpath zod-free.

## Stream 1 — zod-to-form: `errorDisplay` option

- `UseZodFormOptions` gains `errorDisplay?: 'always' | 'afterTouched'` (default `'always'` — fully back-compat).
- Under `'afterTouched'`, `FieldRenderer` consults RHF `formState` (touched OR dirty at the field path) before surfacing `error` to the field template. Validation itself is untouched — `isValid`, `onValueChange` metadata, and form-level `errors` keep reporting everything (node badges must see the truth even when a field stays quiet).
- Array-row fields (useFieldArray consumers) must resolve touched state at the ROW path correctly — test with a nested array field.
- Release the trio in LOCKSTEP via changesets (core/react/vite — react declares an EXACT core dep; never bump one alone), after resolving the version anomaly above. Then bump rune's exact pins (pnpm-workspace.yaml overrides) together and run the full VE suite (the recorded 130-test-breakage rule).

## Stream 2 — langium-zod: make the schema an honest oracle

1. **Comma-list min-1**: extend `resolveArrayMinItems` — a property gets `min(1)` when ANY assignment to it sits in a non-optional position of its rule (the mandatory first `xs+=X` of the comma-list idiom), not only when a `'+'` cardinality marker is present. Verify against rune's grammar that `Choice.attributes` and `RosettaEnumeration.enumValues` become `min(1)` and that `Data.attributes` does NOT (a bare `type X:` parses — empty Data bodies are grammatically legal; CONFIRM by parsing, don't assume).
2. **At-least-one alternative constraints** (the "non-empty-body" work): for rule shapes where the parser structurally cannot produce all-alternatives-empty (grammar alternation collapsed into one object type — `RosettaSynonymBody`, `RosettaMappingInstance`), emit a `.refine`/`superRefine` at-least-one-of constraint. Mechanism choice (grammar-derived analysis vs a config-driven refinement list in the generator's config surface) is the implementer's, grounded in which is reliable — but hand-config must live in the generator config (like domain-surface.config.json's style), not in edited generated output.
3. **Array `.optional()` cleanup**: array-typed properties emit plain `z.array(...)` (never `.optional()`), preserving `min(1)` where derived. Optionally behind a generator flag if other langium-zod consumers need the old shape; rune uses the tightened form.
4. **THE HARD INVARIANT — schemas must never reject parser output**: rune-side corpus gate (Stream 3) is the acceptance test; langium-zod's own tests cover the analysis units.
5. Release, then EXACT pin bump in rune: pnpm-workspace.yaml overrides + catalog + packages/{core,visual-editor} devDependencies together; regenerate via `generate:zod` / `generate:domain` / `generate:schemas`.

## Stream 3 — rune: the gate + adoption

1. **Corpus invariant test (FIRST, before the gate)**: parse the `.resources` corpus; every dehydrated node must PASS its generated schema (`safeParse.success`) — the schemas-never-reject-parser-output gate, skipIf-guarded on corpus presence like the other sweeps. This lands with the pin bump; any failure is a langium-zod bug to fix before proceeding.
2. **The render gate**: in `cst-reuse-renderer` (VE serializer), before structural rendering of a node, `safeParse(node.data)` against a `$type`-keyed schema map (small hand-rolled map over the generated per-type schemas, or generated if langium-zod already emits a registry). Failure → the EXISTING CST/skip fallback path (behavior identical to today's throw-based fallbacks), plus a dev-only log naming the zod issue path (observability parity with `exprText`'s warn). Render-core itself is untouched — no zod import in the rosetta subpath.
3. **Forms adopt `errorDisplay: 'afterTouched'`** (DataTypeForm, EnumForm, ChoiceForm + any other useZodForm call sites) — with the tightened schemas, a fresh empty Choice validates as incomplete but displays quietly until engaged; node-level badges (existing meta.errors surface) may separately consult the schema verdict (OPTIONAL, only if a natural seam exists — do not build new badge UI in this effort).
4. **Behavior tests**: fresh `createType('choice')` node → schema fails → serializer keeps fallback (no `choice C:` corruption in emitted source); populated node → schema passes → structural render; synonym with only-hints body → schema fails → CST fallback preserved byte-identically (the #363 behavior, now schema-driven); form shows no errors untouched, errors after touch.
5. **Round-trip guard**: serialize outputs for the corpus remain byte-identical pre/post gate (the gate must only CHANGE behavior for nodes that previously rendered INVALID text — corpus nodes all pass, so zero corpus diffs).

## Order

Stream 1 and Stream 2 are independent (parallel, separate repos/PRs). Stream 3 lands last in rune, after both releases + pin bumps (can be one rune PR: pins + regen + corpus gate + render gate + form adoption).

## Out of scope

- Submit/draft-commit form UX (rejected — live-apply architecture stays).
- Gating graph MUTATIONS on validity (actions still fire on invalid intermediate states — the mirror architecture depends on it).
- New badge/indicator UI.
- render-core internal changes beyond none (the rosetta subpath stays zod-free).

## Licensing

zod-to-form and langium-zod: their own conventions. rune: packages/ = MIT SPDX on new files.
