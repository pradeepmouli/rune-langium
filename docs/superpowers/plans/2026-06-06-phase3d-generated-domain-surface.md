# Phase 3D — Generated Domain Surface + Domain Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate `packages/visual-editor/src/generated/domain.ts` from the langium-zod `domain` target (read interfaces that **retain `$type` as a literal discriminant** + `toDomain` + type-qualified write accessors + a `createRepository`), have the visual-editor consume it — `mutateGraph` recipes call the generated setters, read-only surfaces (inspector / `computeContentFingerprint`) call `toDomain`, `node-projection.ts` re-exports the generated accessors, and a generated **domain repository** provides qualified-name→domain lookup with `byType`/`byNamespace` — replacing the hand-written node-shape knowledge from 3A/3C with the generated artifact.

**Architecture:** The generated artifact is the single owner of per-kind node-shape (spec §0.4). 3A/3C built hand-written V4 member access + inline recipe writes behind the green suite as a bridge; 3D swaps them for the generated surface, gated by a conformance round-trip test + the existing ~1131 VE / ~878 studio suites. Three langium-zod emitter changes are foundational and land FIRST (so rune generates once against the improved emitter, workspace-linked during dev): (1) **retain `$type`** so `AnyDomain` is a discriminated union (`repository.get` is narrowable, `toDomain` round-trips); (2) **target-typed cross-refs** — emit `Ref<'TargetType'>` (a branded `$refText` string) instead of a bare `string`, so a reference's TYPE is preserved (no type-collapse); (3) **`emitRepository`**. The domain *read* interface projects cross-refs to branded target-typed refs (runtime = `$refText` string, type = the target), so `toDomain` feeds **read-only** consumers; the **write accessors** mutate the AST-shaped `node.data` in recipes (data stays AST-shaped for `modelsToAst` round-trip).

**Tech Stack:** TypeScript 5.9, langium-zod (`domain` target + `$type` retention + `emitRepository`), zustand 5, Mutative, vitest. Generated file = MIT, `// @ts-nocheck — generated file` header (no SPDX, like `zod-schemas.ts`). langium-zod = MIT.

**Depends on:** 3A (node-projection exists), 3A′ (`makeNodeId`=`qualifiedExportPath`), 3B (`mutateGraph`/Maps), 3C (the 34 recipes — 3D re-points their writes to generated setters). #68 merged (domain target shipped in langium-zod 0.5.4; `$type`-retention + `emitRepository` are NEW here).

---

## Critical constraints

1. **`$type` is retained as a literal discriminant** on every domain read interface (`$type: 'Data'`) + in `toDomain` output, so `AnyDomain` is a DISCRIMINATED union (consumers `switch (d.$type)`; the repository indexes by kind). This is the user-directed correction (2026-06-06): id-related metadata is keyed on `$type`. (The 0.5.4 emitter filters `$type` at `domain.ts:135` — un-filter it.)
2. **Generated, never hand-edited.** `domain.ts` is regenerated like `zod-schemas.ts`; a `check-generated` CI guard fails on drift. Rune semantics live in `domain-surfaces.json`, not the generator.
3. **Read vs write split.** `toDomain` (cross-refs→branded `Ref<T>`, `$type` retained) feeds read-only surfaces only (inspector; NOT `computeContentFingerprint`/P4 — that is a content DIGEST, intentionally lossy, and stays on its own subset projection). Node `data` stays AST-shaped; write accessors (`setDataName`, `addRosettaFunctionInputs`, …) mutate `node.data` in place inside recipes.
4. **`superFunction` gap.** `form-surfaces.json` omits `RosettaFunction.superFunction`, but `ast-to-model.ts:278` builds `func-inherits` edges from it. `domain-surfaces.json` MUST include it (full surface — no per-type `fields` whitelist).
4b. **LOSSLESS, TYPE-FAITHFUL projection — no merges, no type-collapse.** The Rune domain surface faithfully mirrors the AST's SEMANTIC content AND its type structure. Strip ONLY derived/internal data (`$container`, `$cstNode`, resolved-`ref` objects, `references`/`labels` indexes) — all reconstructable from reparse + scope. **Cross-refs project to branded `Ref<'TargetType'>`, NOT bare `string`** — a bare string merges every reference to one type, erasing which kind is referenced (the type-collapse the user flagged); the branded ref keeps the target type at the type level while the runtime stays the `$refText` string (lossless both ways). **Do NOT use `merges`** — collapsing distinct collections (e.g. `conditions`+`postConditions`) is irreversible on read and the write side must keep them separate anyway. `renames` are lossless relabels, used sparingly. The langium-zod `merges` capability stays in the generator; Rune opts out.
5. **Repository indexes SOURCE nodes.** The read interface has no namespace, so the qualified-name key comes from a runtime `keyOf` (rune passes `qualifiedExportPath(n.namespace, n.name)`); the repository projects via `toDomain` lazily and groups by the retained `$type`.
6. **Cross-repo version discipline.** The emitter changes need a langium-zod release; pin via `pnpm-workspace.yaml` `overrides` (memory `project_pnpm_overrides_location`) so core + visual-editor resolve one version. During dev, rune builds against a workspace-linked/`@dev` langium-zod.
7. **Validation:** langium-zod — `pnpm --filter langium-zod run type-check`/`test`. rune — `pnpm --filter @rune-langium/visual-editor test`/`run type-check`, `pnpm --filter @rune-langium/studio test`, `pnpm run lint`, `pnpm run generate:domain` clean. Commits `SKIP_SIMPLE_GIT_HOOKS=1`, end `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branches: langium-zod `feat/domain-discriminant-repository`; rune `feat/phase3d-domain-surface` off the 3C merge.

## Current-state map (ground-truth audit 2026-06-06)

- **langium-zod domain API (v0.5.4, merged):** `generateDomainSchemas(config)` (`api.ts:257`); CLI `--domain`/`--domain-out` (`cli.ts:421,486`); emitter `generateDomainCode(descriptors, options)` (`domain.ts:312`) with `planObject` (`:126`, filters `$type` at `:135`), `emitAccessors`, `emitMasterDispatch` (`:251`), `emitUnion`, `emitInterface`, `emitReadFn`, `emitWriteAccessors`. Overlay types (`domain.ts:21-38`). Emitted: `FooDomain`, `toDomainFoo(node)`, type-qualified `set/add/removeFooField`, master `toDomain`/`AnyDomain`. No `$type` in interfaces, no namespace/registry. `emitRepository` slot = after `emitMasterDispatch` (~line 365).
- **rune generate pipeline:** `generate:schemas` (`visual-editor/package.json:29`) = `langium-zod generate --config ../core/langium-config.json --out src/generated/zod-schemas.ts --strip-internals --projection form-surfaces.json …`. Output `packages/visual-editor/src/generated/`. Grammar `packages/core/src/grammar/rune-dsl.langium`; config `packages/core/langium-config.json`; AST `packages/core/src/generated/ast.ts`.
- **Consumption seams:** `ast-to-model.ts:79` `buildGraphNode`; `model-to-ast.ts:42` `GRAPH_META_KEYS`/`stripMetadata`; `strip-additional-ast-fields.ts:12`; `useModelSourceSync.ts` `computeContentFingerprint`. After 3A these live in `node-projection.ts`; after 3C the writes live in recipes.
- **Kinds + member fields:** `Data`→`attributes`(+`superType`,`conditions`,`annotations`,`synonyms`); `Choice`→`attributes`(ChoiceOption[]); `RosettaEnumeration`→`enumValues`(+`parent`); `RosettaFunction`→`inputs`(+`output`,`superFunction`,`conditions`,`postConditions`,`operations`); `RosettaRecordType`→`features`; `RosettaTypeAlias`→`typeCall`(+`definition`); `Annotation`→`attributes`.
- **Linkage:** `langium-zod ^0.5.4` in BOTH `core` + `visual-editor` devDeps; no override yet.

---

## Phase 3D-1 — langium-zod emitter changes (foundational; workspace-linked into rune)

### Task 1: Make the domain surface type-faithful (`$type` discriminant + target-typed cross-refs)

**Repo:** `/Users/pmouli/GitHub.nosync/active/ts/langium-zod` — branch `feat/domain-discriminant-repository`.
**Files:** Modify `packages/langium-zod/src/emitters/domain.ts` (`planObject:135`, `domainTsType:41`, `domainWriteType:90`, `emitInterface`, `emitReadFn`, header emit); extend `test/unit/domain-emitter.test.ts`.

> Two type-faithfulness fixes the 0.5.4 emitter is missing: (a) it DROPS `$type` (`planObject` filters it) → undiscriminated `AnyDomain`; (b) it projects every cross-ref to a bare `string` → collapses all references to one type (the user-flagged type-merge). Fix both: retain `$type` as a literal (value = descriptor `name`), and emit cross-refs as `Ref<'TargetType'>` (a branded `$refText` string). Both are type-level changes; runtime is unchanged.

- [ ] **Step 1: Update the failing test** — assert the read interface + `toDomain` carry the literal:
```ts
it('retains $type as a literal discriminant on the domain interface', () => {
  const out = generateDomainCode(descriptors, {});
  expect(out).toContain("$type: 'Data';");          // interface
  expect(out).toContain("$type: node.$type,");        // toDomain read
});
it('AnyDomain is a discriminated union (narrowable)', () => {
  // type-level: a switch on d.$type narrows — assert the emitted toDomain master keeps the case map
  expect(out).toContain('switch (node.$type)');
});
```
- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Un-filter `$type` in `planObject`** (`domain.ts:135`): instead of dropping `$type`, add it to the plan as a literal field `{ name: '$type', tsType: \`'${descriptor.name}'\`, readExpr: 'node.$type', isLiteral: true }` (no write accessor — `$type` is immutable identity). `emitInterface` emits `$type: '<Name>';`; `emitReadFn` emits `$type: node.$type,`. Ensure `emitWriteAccessors` SKIPS the `$type` field (no `set$type`). Keep the rename/merge overlays unaffected.
- [ ] **Step 4: Run, confirm PASS** — `pnpm --filter langium-zod test`. The master `toDomain` already switches on `$type`; now its members are tagged.
- [ ] **Step 5: Add the failing cross-ref test**
```ts
it('projects cross-refs to a branded Ref<TargetType>, not bare string', () => {
  const out = generateDomainCode(descriptors, {}); // descriptors include a cross-ref to e.g. Data
  expect(out).toContain('type Ref<T extends string> = string & { readonly __target?: T };');
  expect(out).toContain("superType?: Ref<'DataOrChoice'>;"); // or the actual target type name
});
```
- [ ] **Step 6: Run, confirm FAIL.**
- [ ] **Step 7: Emit target-typed cross-refs** — in `domainTsType` (`:41`, the read-interface type) and `domainWriteType` (`:90`, the setter param type), when the expression is a cross-ref (`zodType.kind === 'crossReference'` + `targetType`, per spec §0.5 / `type-mapper.ts:179`), emit `Ref<'${targetType}'>` instead of `string`. Emit the `Ref` helper once in the module header: `type Ref<T extends string> = string & { readonly __target?: T };`. The read expr (`prop.$refText`) and the write body (`node.x = value` / `{ $refText: value }`) are UNCHANGED — runtime stays the string; only the TS type carries the brand. Confirm the descriptor exposes the target type name (`targetType`); if a ref has multiple/union targets, emit `Ref<'A' | 'B'>`.
- [ ] **Step 8: Run, confirm PASS** — `pnpm --filter langium-zod test` + `run type-check`.
- [ ] **Step 9: Commit** — `feat(domain): type-faithful surface — $type discriminant + branded target-typed cross-refs`.

---

### Task 2: Add `emitRepository` (+ optional `MEMBER_FIELD_BY_KIND`)

**Files:** Modify `packages/langium-zod/src/emitters/domain.ts` (`emitRepository`, call site ~line 365); `DomainGenerationOptions`; extend `test/unit/domain-emitter.test.ts` + an integration test.

- [ ] **Step 1: Write the failing test**
```ts
it('emits createRepository with get/all/byNamespace/byType, projecting via toDomain', () => {
  const out = generateDomainCode(descriptors, {});
  expect(out).toContain('export function createRepository(');
  expect(out).toContain('get(qualifiedName: string)');
  expect(out).toContain('byType(');
  expect(out).toContain('byNamespace(');
});
```
- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Implement `emitRepository`** (namespace-agnostic; key via injectable `keyOf`; `byType` uses the now-retained `$type`):
```ts
function emitRepository(): string[] {
  return [
    '',
    '/** Index source AST nodes by a caller-supplied key (e.g. qualified name); projects via toDomain lazily. */',
    'export function createRepository(',
    '  nodes: any[],',
    '  keyOf: (node: any) => string = (n) => n.name',
    '): {',
    '  get(qualifiedName: string): AnyDomain | undefined;',
    '  all(): AnyDomain[];',
    '  byType<K extends AnyDomain["$type"]>(type: K): Extract<AnyDomain, { $type: K }>[];',
    '  byNamespace(ns: string): AnyDomain[];',
    '} {',
    '  const byKey = new Map<string, any>(nodes.map((n) => [keyOf(n), n]));',
    '  return {',
    '    get: (qn) => { const n = byKey.get(qn); return n ? toDomain(n) : undefined; },',
    '    all: () => [...byKey.values()].map(toDomain),',
    '    byType: (type) => [...byKey.values()].filter((n) => n.$type === type).map(toDomain) as never,',
    '    byNamespace: (ns) => [...byKey.entries()]',
    '      .filter(([k]) => k === ns || k.startsWith(ns + "."))',
    '      .map(([, n]) => toDomain(n))',
    '  };',
    '}'
  ];
}
```
Call after `emitMasterDispatch(objects)`. The `byType` return narrows because Task 1 made `AnyDomain` discriminated. (Optional) emit `export const MEMBER_FIELD_BY_KIND = { Data: 'attributes', … } as const;` from the array-typed descriptor fields so rune's V4 can source it.
- [ ] **Step 4: Integration test** — import the emitted module; `createRepository([{ $type:'Data', name:'B', namespace:'a' }], n => `${n.namespace}.${n.name}`)`; assert `get('a.B')?.$type === 'Data'` and `byType('Data').length === 1`.
- [ ] **Step 5: Type-check + commit** — `feat(domain): emitRepository (get/all/byType/byNamespace) + optional member-field map`.

---

## Phase 3D-2 — rune: generate + consume (workspace-linked langium-zod)

### Task 3: Workspace-link the langium-zod branch + author `domain-surfaces.json`

**Files:** rune `pnpm-workspace.yaml` (a `@dev`/`link:` override to the local langium-zod), `packages/visual-editor/domain-surfaces.json` (create). Branch `feat/phase3d-domain-surface`.

- [ ] **Step 1: Link the local langium-zod** — add a `pnpm-workspace.yaml` override pointing `langium-zod` at the local `feat/domain-discriminant-repository` build (`link:../../langium-zod/packages/langium-zod` or a `@dev` tarball). `pnpm install`; confirm `node_modules/langium-zod` resolves to the branch build (with `$type` retention + `emitRepository`).
- [ ] **Step 2: Write `domain-surfaces.json`** (full, FAITHFUL projection — no `fields` whitelist, no merges):
```jsonc
{
  "defaults": {
    "strip": [
      "$container", "$containerProperty", "$containerIndex",
      "$cstNode", "$document", "$refNode", "$nodeDescription",
      "references", "labels", "ruleReferences", "typeCallArgs", "enumSynonyms"
    ]
  },
  "types": {}
}
```
> The surface is a faithful AST mirror (constraint 4b). `strip` removes ONLY derived/internal `$`-fields and the resolved-ref/index helpers — never semantic content. `$type` is NOT stripped (the emitter retains it per Task 1). NO `merges` — `RosettaFunction` keeps `conditions` AND `postConditions` as separate fields (lossless); `Choice` keeps `attributes` (faithful name). `types: {}` is intentional — overlays are added later ONLY if a lossless rename is genuinely wanted. Full surface keeps `superFunction` (constraint 4). This deliberately departs from the spec §0.5 merge example, which is lossy.
- [ ] **Step 3: Commit** — `feat(ve): workspace-link langium-zod @dev + domain-surfaces.json`.

---

### Task 4: `generate:domain` script + generate `domain.ts` + freshness guard

**Files:** `packages/visual-editor/package.json` (script); generated `src/generated/domain.ts`; the `check-generated` CI step.

- [ ] **Step 1: Add the script**
```json
"generate:domain": "langium-zod generate --config ../core/langium-config.json --domain --domain-out src/generated/domain.ts --strip-internals --projection domain-surfaces.json --ast-types ../core/src/generated/ast.ts"
```
> Confirm `--projection` applies to the domain path; if it's Zod-only, move the overlays to a `langium-zod.config.js` `domainOverlays` block and keep `--projection` for `strip`.
- [ ] **Step 2: Generate** — `pnpm --filter @rune-langium/visual-editor run generate:domain`. Verify: `$type: 'Data'` literals in each interface; `superFunction` on `RosettaFunctionDomain`; **separate `conditions` AND `postConditions`** (no merge — lossless, constraint 4b); `addChoiceAttributes` (faithful name, no rename); `createRepository` present; `toDomain` master switch.
- [ ] **Step 3: Extend `check-generated`** to regenerate + `git diff --exit-code src/generated/domain.ts` (find via `rg -n "check-generated|generate:schemas" .github`).
- [ ] **Step 4: Commit** the script + generated `domain.ts` — `feat(ve): generate:domain + committed domain.ts (discriminated + repository)`.

---

### Task 5: Consume `toDomain` at read-only surfaces (now `$type`-discriminated)

**Files:** `useModelSourceSync.ts` (`computeContentFingerprint`); the inspector read path; extend the source-sync test.

- [ ] **Step 1: Conformance test** — model → `toDomain(node)` → assert the FAITHFUL shape: `$type` retained, `conditions` and `postConditions` BOTH present and distinct (no merge), cross-refs as `$refText` strings; the inspector can `switch (d.$type)`.
- [ ] **Step 2: Run, confirm FAIL** where inline reads aren't using `toDomain`.
- [ ] **Step 3: Re-point the inspector read** to `toDomain` (it now narrows on `$type`). For `computeContentFingerprint`: adopt `toDomain` ONLY if its content key-set equals the current `astRelevantProjection` set — **the fingerprint MUST NOT change** (a drift re-serializes every model once). If shapes differ, keep `astRelevantProjection` for the fingerprint and use `toDomain` only for the inspector. REPORT which.
- [ ] **Step 4: Verify** — VE + studio suites; watch source-sync/serialization-churn. Green.
- [ ] **Step 5: Commit** — `refactor(ve): adopt generated toDomain (discriminated) at read-only surfaces`.

---

### Task 6: Re-point `mutateGraph` recipes + `node-projection` to generated accessors

**Files:** `node-projection.ts` (re-export generated surface; V4 source); `editor-store.ts` (recipes); extend the actions tests.

> Spec §0.4: `node-projection.ts` becomes a thin re-export of the generated accessors + the editor-policy bits codegen does not own (V3 edge-id, V5/V6 derivation, V2 `GRAPH_METADATA_KEYS`, `makeNodeId`=`qualifiedExportPath`). The member-container map (V4) + type-ref/cardinality write accessors come from the generated artifact.

- [ ] **Step 1: Re-export** — `export * from '../generated/domain.js';` from `node-projection.ts`. Keep V2/V3/V5/V6 + `makeNodeId`. For V4: use the generated `MEMBER_FIELD_BY_KIND` if Task 2 emitted it; else keep V4 hand-written (small editor policy) and note it. REPORT.
- [ ] **Step 2: Convert Wave A recipes to generated setters** — `addDataAttributes`/`setDataName`/cross-ref `setAttribute…Ref` replace inline `d.attributes.push`/`a.name=`/`typeCall.$refText=`. Keep edge mutations (V3 `makeEdgeId`) inline (editor policy). Run the actions suite.
- [ ] **Step 3: Roll across remaining waves** — generated setter where a 1:1 accessor exists; leave inline (with `// no generated accessor: <reason>`) for rich-ref/inline-union scalars (the MVP gap). Whole VE + studio suite after each wave.
- [ ] **Step 4: Conformance round-trip test** (spec §0.5) — model → edit via generated setter → `modelsToAst`/`serializeModel` equals the pre-3D inline-write source. Proves behavior-identical to 3C.
- [ ] **Step 5: Verify** — VE + studio + type-check + lint + `generate:domain` clean. Confirm net-LOC win.
- [ ] **Step 6: Commit** — `refactor(ve): recipes + node-projection consume generated domain accessors`.

---

### Task 7: Wire `createRepository` for qualified-name→domain lookup

**Files:** the editor read-lookup seams (inspector resolve, cross-ref target resolution, studio qualified-name reads); extend tests.

- [ ] **Step 1: Test** — build a repository from the graph's source nodes; assert `get(qn).$type` and `byType('Data')`/`byNamespace(ns)`.
- [ ] **Step 2: Run, confirm FAIL.**
- [ ] **Step 3: Wire** — `createRepository([...nodesById.values()].map(n => n.data), n => qualifiedExportPath(n.namespace, n.name))`; use `get`/`byType`/`byNamespace` instead of ad-hoc `find`/filter at the read seams. READ-only; edits stay on `nodesById`/recipes.
- [ ] **Step 4: Verify** — VE + studio + type-check + lint. Green.
- [ ] **Step 5: Commit** — `feat(ve): wire generated createRepository (get/byType/byNamespace)`.

---

## Phase 3D-3 — release langium-zod + pin in rune

### Task 8: Release + pin + regenerate + final verification

**Repos:** langium-zod (release) + rune (pin).

- [ ] **Step 1: Release langium-zod** — changeset (minor: `$type` retention + `emitRepository`), merge `feat/domain-discriminant-repository` → `develop`, publish (e.g. 0.6.0). CI green (the #68 `@types/node` fix holds).
- [ ] **Step 2: Pin in rune** — remove the workspace `link:` override; bump `langium-zod` in BOTH `packages/core/package.json` + `packages/visual-editor/package.json` to the release; add the version override in `pnpm-workspace.yaml` (NOT package.json `pnpm` field — memory `project_pnpm_overrides_location`). `pnpm install`.
- [ ] **Step 3: Regenerate against the release** — `pnpm --filter @rune-langium/visual-editor run generate:domain`; `git diff` should be empty (the linked build == the release). Commit if any churn.
- [ ] **Step 4: Final sweep** — `pnpm --filter @rune-langium/visual-editor test`, `… run type-check`, `pnpm --filter @rune-langium/studio test`, `pnpm run lint`, `pnpm run generate:domain` (clean), `check-generated`. All green. Confirm the net-LOC: deleting inline recipe writes + hand-written V4 + ad-hoc qualified-name lookups, minus the re-export.
- [ ] **Step 5: Commit** — `chore: pin langium-zod <ver>; regenerate; close Phase 3D`.

---

## Self-review checklist (performed during plan authoring)

**Spec coverage (§0.2–§0.5) + user corrections:** `$type` retained as a discriminant + cross-refs emitted as branded `Ref<TargetType>` not bare `string` (Task 1 — the two 2026-06-06 type-faithfulness directives: keep id metadata `$type`, and don't merge ref objects to one `string` type) ✓; generated artifact committed (Task 4) ✓; `node-projection.ts` re-exports generated accessors keeping V2/V3/V5/V6 + `makeNodeId` (Task 6, §0.4) ✓; recipes call generated setters (Task 6, §0.4) ✓; `toDomain` for read-only surfaces (Task 5, §0.4) ✓; **lossless faithful surface — no merges** (Task 3, constraint 4b; deliberately departs from the spec §0.5 merge example) ✓; conformance round-trip (Tasks 5,6, §0.5) ✓; regeneration + check-generated (Task 4) ✓; generated repository with `byType` (Tasks 2,7 — the approved option, now keyed by the retained `$type`) ✓.

**Why `$type` retention reorders the plan:** it's an emitter change affecting the WHOLE surface (not just the repository), so it's front-loaded (Phase 3D-1) and rune workspace-links the branch (Task 3) to generate once against the improved emitter — avoiding a generate-twice churn. The release+pin (Phase 3D-3) is the clean cutover.

**The shape tension (resolved):** read interface flattens cross-refs but now retains `$type`, so `toDomain` is both narrowable AND read-only-confined (Task 5); write accessors mutate AST-shaped `node.data` (Task 6). The fingerprint key-set is protected (Task 5 Step 3 — do NOT swap if shapes differ).

**`superFunction` gap:** full surface (no `fields` whitelist) keeps it (constraint 4, Task 3) — otherwise `func-inherits` edges vanish.

**Placeholder scan:** the `$type`-retention emit (Task 1), `emitRepository` with the narrowing `byType` (Task 2), the config (Task 3), the script (Task 4), and the re-export/wiring (Tasks 6,7) are concrete. Edit-time confirmations are flagged precisely: `--projection` on the domain CLI path (Task 4 — config fallback) and `MEMBER_FIELD_BY_KIND` emit for V4 (Task 2/Task 6 — keep V4 hand-written if absent).

**Type consistency:** `createRepository(nodes, keyOf)` + `byType<K>` signature is identical in the emitter (Task 2) and the wiring (Task 7); `keyOf = (n) => qualifiedExportPath(n.namespace, n.name)` everywhere; generated accessor names follow the audited type-qualified convention; `$type` is a literal (`'Data'`) discriminant across interfaces, `toDomain`, and `byType`.
