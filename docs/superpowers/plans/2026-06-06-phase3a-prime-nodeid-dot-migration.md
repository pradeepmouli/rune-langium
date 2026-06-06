# Phase 3A′ — Node-ID `::`→`.` Migration (retire the `::` separator) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visual-editor node-id separator `${namespace}::${name}` with the core qualified name `${namespace}.${name}` (built via `qualifiedExportPath`), retiring `::` from the **node-id** population everywhere — editor `src`, studio `src`, and test fixtures — while leaving the **structure-graph instance-path** and **expansion-key** `::` separators (a different id namespace) and the `builtin::*` TypeOption convention untouched.

**Architecture:** A hard cutover (studio isn't live → no back-compat shim, per the standing decision). It builds on 3A: `node-projection.ts` is already the single owner of `makeNodeId`/`nameFromNodeId`/`splitNodeId`, so the format change is one-line at the source-of-truth, plus a handful of inline node-id sites 3A did not centralize, plus a large-but-mechanical fixture rewrite split into *bulk-safe* and *surgical-mixed* buckets. The existing ~1131 VE + ~878 studio suites are the safety net; this plan rewrites the fixtures that hard-code `::`, so "green" means the suites pass against the **new** dot form.

**Tech Stack:** TypeScript 5.9 (strict, ESM/NodeNext), React 19, zustand 5, vitest, Playwright (studio e2e). `@rune-langium/core` resolves from source via project references. Packages = MIT; `apps/studio` = FSL-1.1-ALv2 (this plan edits studio `src` — the one place the node-id *value* crosses the visual-editor boundary, per spec §9.8 / Implementation notes).

**Depends on:** 3A merged (`node-projection.ts` exists and owns the id builders). **Out of scope:** Maps/`mutateGraph` (3B); the 34-action recipe migration (3C); the generated domain surface (3D).

---

## Critical constraints

1. **Two `::` populations stay separate.** Only **node-id** `::` flips to `.`. The **structure-graph instance-path** `::` (`structure-graph-adapter.ts`, `structure-view.ts` `expansionKey`, studio `structure-view-store.ts`) and the **`builtin::*`** TypeOption values DO NOT change. Embedded node ids *inside* instance-paths/expansion-keys do change form (because the node-id value changes), but the `::` segment separators remain.
2. **Build via core.** Node-id construction goes through `qualifiedExportPath(namespace, name)` (`packages/core/src/naming/qualified-export-path.ts`, also re-exported as `n` from core's index). Never re-inline `` `${ns}.${name}` ``.
3. **Reverse via last-dot split.** `nameFromNodeId(id)` = `id.slice(id.lastIndexOf('.') + 1)`; namespace = `id.slice(0, id.lastIndexOf('.'))`. Type names are dotless (grammar `ValidID`), so the last dot always separates namespace from name (spec §9.8 Precondition 1). The `STRING`-named-namespace edge case is a pre-existing, identical caveat under `::` — document, don't block.
4. **Hard cutover, no shim.** No persisted node ids exist (R14 holds raw source; ids recomputed on load — §9.7), so no data migration. Do NOT add a `::`↔`.` compatibility layer.
5. **Validation:** `pnpm --filter @rune-langium/visual-editor test`, `pnpm --filter @rune-langium/visual-editor run type-check`, `pnpm --filter @rune-langium/studio test`, `pnpm run lint`. Studio Playwright e2e where node test-ids changed. Use `rg`. Commits: `SKIP_SIMPLE_GIT_HOOKS=1`, end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Branch: `feat/phase3a-prime-nodeid-dot` off `feat/phase3a-node-projection` (or off the merge commit once 3A lands).

## Current-state map (ground-truth audit 2026-06-06)

**Node-id sites to FLIP (Class A):**
- `node-projection.ts` — `makeNodeId` (`NODE_ID_SEPARATOR='::'`), `nameFromNodeId` (split on `::`), `splitNodeId` (lastIndexOf `::`). *(Single owner after 3A — the primary edit.)*
- `adapters/ast-to-model.ts` — after 3A, imports `makeNodeId` (no local copy). The edge-id `--` builder is unaffected (spec §9.8 Precondition 3: names/namespaces contain no `--`).
- `store/editor-store.ts` — after 3A, imports `makeNodeId`; `createType:997`, `renameType:1072` call it (auto-fixed). `disambiguateTypeRef:79-96` already returns dot ref-text and has **no `::` in its body** — it just starts receiving dot-form ids; verify no change needed.
- `hooks/useInheritedMembers.ts:101` — inline `` `${pd.namespace}::${pd.name}` === currentParentName `` (NOT centralized by 3A).
- `components/editors/TypeLink.tsx:34` — `` allNodeIds.find(id => id.endsWith(`::${typeName}`)) `` (suffix match — see Task 2 ambiguity).
- `components/nodes/NavigationContext.tsx:59` — `` const suffix = `::${typeName}` `` (same suffix match).

**Studio sites to FLIP (Class A, FSL):**
- `shell/ExplorePerspective.tsx`: build `${ns}::${name}` at `:1135,1142,1162`; namespace-extract `selectedNodeId.split('::')` at `:1024`; last-segment `split('::').pop()` at `:1247,1820`. The deferred `model.name→namespace` sites (memory: ~`843/1114/1131`) move here too if present. `nodeIdToFilePath` is keyed by these ids.
- `test/visual/fixtures.ts:100`, and e2e test-ids `rf__node-${nodeId}` across `test/e2e/*.spec.ts`.

**Sites to LEAVE (Class B / Class C):**
- `structure-graph-adapter.ts:414,422,448,631,688` — instance-path `::` separators.
- `types/structure-view.ts:126,128` — `expansionKey` `namespaceUri::typeId::attrName`.
- studio `store/structure-view-store.ts:156` — `collapseAll` prefix `${namespaceUri}::` (still valid; key format shifts around it).
- `ExplorePerspective.tsx:1451` — `builtin::${t}` TypeOption value (Class C).
- CSS `::` pseudo-selectors in `test/layout/structure-css-ssot.test.ts` (Class C).

**Core helper (E):** `qualifiedExportPath(namespace, name): string` → `namespace ? \`${namespace}.${name}\` : name` at `packages/core/src/naming/qualified-export-path.ts`; re-exported as `n` from `packages/core/src/index.ts`.

---

## Task 1: Flip the separator at the source of truth (`node-projection.ts`)

**Files:**
- Modify: `packages/visual-editor/src/store/node-projection.ts`
- Modify: `packages/visual-editor/test/store/node-projection.test.ts`

- [ ] **Step 1: Rewrite the id-builder tests to the dot form**

Replace the V1 describe block's expectations (`::`→`.`):
```ts
import { makeNodeId, nameFromNodeId, splitNodeId } from '../../src/store/node-projection.js';

describe('node-projection id builders (V1, dot form)', () => {
  it('makeNodeId joins namespace and name with a dot (via qualifiedExportPath)', () => {
    expect(makeNodeId('cdm.base', 'Foo')).toBe('cdm.base.Foo');
    expect(makeNodeId('', 'Foo')).toBe('Foo'); // empty namespace → no leading dot
  });
  it('nameFromNodeId returns the trailing name via last-dot split', () => {
    expect(nameFromNodeId('cdm.base.Foo')).toBe('Foo');
    expect(nameFromNodeId('Foo')).toBe('Foo'); // no dot → whole string
  });
  it('splitNodeId returns namespace + name via last-dot split', () => {
    expect(splitNodeId('cdm.base.Foo')).toEqual({ namespace: 'cdm.base', name: 'Foo' });
    expect(splitNodeId('Foo')).toEqual({ namespace: '', name: 'Foo' });
  });
});
```

- [ ] **Step 2: Run, confirm FAIL**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`
Expected: FAIL (still `::`).

- [ ] **Step 3: Flip the implementation**

In `node-projection.ts` replace the V1 block:
```ts
import { qualifiedExportPath } from '@rune-langium/core';

/** Build the canonical top-level node id `${namespace}.${name}` (core qualified name). */
export function makeNodeId(namespace: string, name: string): string {
  return qualifiedExportPath(namespace, name);
}

/** The trailing simple name of a node id (everything after the last dot). */
export function nameFromNodeId(nodeId: string): string {
  const idx = nodeId.lastIndexOf('.');
  return idx < 0 ? nodeId : nodeId.slice(idx + 1);
}

/** Split a node id into `{ namespace, name }` by the last dot; namespace is '' when absent. */
export function splitNodeId(nodeId: string): { namespace: string; name: string } {
  const idx = nodeId.lastIndexOf('.');
  if (idx < 0) return { namespace: '', name: nodeId };
  return { namespace: nodeId.slice(0, idx), name: nodeId.slice(idx + 1) };
}
```
Delete the `NODE_ID_SEPARATOR = '::'` const. Confirm the core import path resolves (VE imports core from source); if `qualifiedExportPath` isn't on the public surface, import it directly from `@rune-langium/core` (it is re-exported — confirm via `rg "qualifiedExportPath" packages/core/src/index.ts`).

- [ ] **Step 4: Run, confirm PASS**

Run: `pnpm --filter @rune-langium/visual-editor test -- node-projection`

- [ ] **Step 5: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/store/node-projection.ts packages/visual-editor/test/store/node-projection.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(ve): flip node-id separator ::→. via qualifiedExportPath

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> The edge-id builders (`makeEdgeId`/`parseEdgeId`) need NO change: node ids never contain `--`, so split-on-`--` stays unambiguous with dots inside ids (spec §9.8 Precondition 3). Leave them.

---

## Task 2: Route the 3 inline node-id sites through `node-projection`, fix suffix-match ambiguity

**Files:**
- Modify: `packages/visual-editor/src/hooks/useInheritedMembers.ts:101`
- Modify: `packages/visual-editor/src/components/editors/TypeLink.tsx:34`
- Modify: `packages/visual-editor/src/components/nodes/NavigationContext.tsx:59`
- Test: the existing `test/hooks/useInheritedMembers.test.ts`, `test/editors/TypeLink.test.tsx`, `test/nodes/NavigationContext.test.tsx`

> These three build/parse node ids inline and were NOT centralized by 3A (they aren't `makeNodeId` call sites). The suffix-match in TypeLink/NavigationContext is the subtle one: matching `` id.endsWith(`.${typeName}`) `` can collide with a namespace segment named like the type (e.g. node `foo.Bar.Bar` vs namespace `foo.Bar`). Fix it to an **exact last-segment** comparison using `nameFromNodeId`.

- [ ] **Step 1: Update the failing tests first**

In `useInheritedMembers.test.ts`, change any `ns::Name` fixtures used for the parent-name comparison to dot form. In `TypeLink.test.tsx`/`NavigationContext.test.tsx`, add a case proving the exact-last-segment match does NOT collide with a namespace segment of the same name:
```ts
// e.g. node ids ['a.b.Foo', 'a.Foo.Bar']; resolving typeName 'Foo' must pick 'a.b.Foo', not 'a.Foo.Bar'
```

- [ ] **Step 2: Run, confirm FAIL** — `pnpm --filter @rune-langium/visual-editor test -- useInheritedMembers TypeLink NavigationContext`

- [ ] **Step 3: Re-point `useInheritedMembers.ts:101`**

```ts
import { makeNodeId } from '../store/node-projection.js';
// …
if (makeNodeId(pd.namespace, pd.name) === currentParentName) { … }
```

- [ ] **Step 4: Fix the suffix match in `TypeLink.tsx` and `NavigationContext.tsx`**

Replace the `endsWith('::'+typeName)` / `suffix='::'+typeName` heuristic with exact last-segment match:
```ts
import { nameFromNodeId } from '../../store/node-projection.js'; // adjust relative depth per file
// TypeLink.tsx:34
return allNodeIds.find((id) => nameFromNodeId(id) === typeName);
// NavigationContext.tsx:59 — wherever `suffix` was used to match, switch to:
//   nodeIds.filter((id) => nameFromNodeId(id) === typeName)
```
Read each site's surrounding logic to confirm the exact-match semantics preserve behavior (a single unambiguous type name resolves identically; the only difference is the namespace-collision case the old `::` form also mishandled less often).

- [ ] **Step 5: Verify** — `pnpm --filter @rune-langium/visual-editor test` + `… run type-check`. Green.

- [ ] **Step 6: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/src/hooks/useInheritedMembers.ts packages/visual-editor/src/components/editors/TypeLink.tsx packages/visual-editor/src/components/nodes/NavigationContext.tsx packages/visual-editor/test
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(ve): route inline node-id sites through node-projection; exact last-segment type match

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Studio `ExplorePerspective.tsx` + studio fixtures flip

**Files:**
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx` (build `:1135,1142,1162`; parse `:1024,1247,1820`; deferred namespace sites if present)
- Modify: `apps/studio/test/visual/fixtures.ts:100`
- Test: studio unit tests under `apps/studio/test` that assert node ids (`EditorPage.test.tsx`, `SourceEditor.test.tsx`, etc. — see Task 4 matrix)

> Studio is FSL — keep the SPDX header. Build via `qualifiedExportPath` (import from `@rune-langium/core`); the editor and studio now share the one builder.

- [ ] **Step 1: Flip the build sites** — replace `` `${ns}::${name}` ``-style templates (`:1135,1142,1162`) with `qualifiedExportPath(ns, name)` (import `{ qualifiedExportPath }` or `{ n }` from `@rune-langium/core`).

- [ ] **Step 2: Flip the namespace-extraction at `:1024`**

`const [namespace] = selectedNodeId.split('::')` is WRONG under dots (namespace contains dots). Use last-dot split:
```ts
const dot = selectedNodeId.lastIndexOf('.');
const namespace = dot < 0 ? '' : selectedNodeId.slice(0, dot);
```
(Or, if the visual-editor exports `splitNodeId` through the package's public API, import and use it for DRY — check `packages/visual-editor/src/index.ts`; if not exported, prefer adding the export over re-inlining.)

- [ ] **Step 3: Flip the last-segment parses at `:1247,1820`** — `split('::').pop()` → `split('.').pop()` (drop any `includes('::')` guard; all ids now contain dots). Confirm the surrounding logic.

- [ ] **Step 4: Move the deferred namespace-extraction sites** — if `ExplorePerspective.tsx` still has the `model.name→namespace` extraction the Phase 1 memo deferred (memory cites ~843/1114/1131), re-point them to the core `namespaceFromModelName`/`namespaceFromSource` helpers (Phase 1, V10) now — they live in this file and move in lockstep. `rg -n "model\.name|split\('::'\)|::" apps/studio/src/shell/ExplorePerspective.tsx` and reconcile each hit against the populations.

- [ ] **Step 5: Flip `apps/studio/test/visual/fixtures.ts:100`** — `` `demo.forms::${nodeName}` `` → `` `demo.forms.${nodeName}` `` (or `qualifiedExportPath('demo.forms', nodeName)`).

- [ ] **Step 6: Leave `:1451` (`builtin::${t}`) untouched** — verify it's the TypeOption value, not a store id.

- [ ] **Step 7: Verify** — `pnpm --filter @rune-langium/studio test` + `pnpm --filter @rune-langium/studio run type-check`. Green (Task 4 rewrites the unit fixtures these depend on — run Task 4 before final-green if a shared fixture is touched; the controller may sequence Task 3 + Task 4 together).

- [ ] **Step 8: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add apps/studio/src/shell/ExplorePerspective.tsx apps/studio/test/visual/fixtures.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(studio): flip ExplorePerspective node-id ::→. (build+parse+namespace extract)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Bulk-safe fixture rewrites (Class-A-only files)

**Files:** the test files containing **only** Class-A node-id `::` (no instance-path / expansion-key / `builtin::`). From the audit:
- VE: `test/store/editor-store.test.ts`, `test/store/editor-store-actions.test.ts`, `test/store/edit-reconcile.test.ts`, `test/store/degraded-reparse-guard.test.ts`, `test/store/visibility-store.test.ts`, `test/utils/namespace-tree.test.ts`, `test/utils/namespace-tree-segmented.test.ts`, `test/editors/TypeLink.test.tsx`, `test/editors/EnumForm.test.tsx`, `test/EnumForm.test.tsx`, `test/non-migrated-forms.test.tsx`, and the inferred `test/editors/*.test.tsx`, `test/components/nodes/*.test.tsx`, `test/nodes/NavigationContext.test.tsx`, `test/navigation-history.test.ts`, `test/adapters/resolve-node-kind.test.ts`, `test/hooks/useInheritedMembers.test.ts`, `test/public-api/ref-api.test.tsx`, `test/validation/validation-parity.test.ts`, `test/components/NamespaceExplorerPanel.test.tsx`, `test/components/editors/*.test.tsx`.
- Studio: `test/prod-smoke/production-checkout.spec.ts`, `test/e2e/*.spec.ts` (test-ids `rf__node-…`), `test/components/SourceEditor.test.tsx`, `test/pages/EditorPage.test.tsx`.

> **NOT in this task** (mixed/surgical — Task 5): `test/layout/structure-layout.test.ts`, `test/adapters/structure-graph-adapter.test.ts`, `test/components/StructureView*.test.tsx`, studio `test/workspace/structure-view-persistence.test.ts`, studio `test/store/structure-view-store.test.ts`. And **exempt the `builtin::*` literals** inside otherwise-Class-A files (TypeSelector/EnumForm/non-migrated-forms).

- [ ] **Step 1: Per-file, replace Class-A `ns::Name` → `ns.Name`**

For each file, do a *reviewed* replace, not a blind global one — because some Class-A files also contain `builtin::string`. Process:
```
rg -n "::" <file>            # enumerate every hit
```
Replace each node-id `::` with `.`; SKIP every `builtin::…` and any CSS `::` pseudo-selector. Also flip any `` `${namespace}::${name}` `` template literals in fixture helpers (e.g. `visibility-store.test.ts:16`, `namespace-tree.test.ts:25`) to `qualifiedExportPath`/`.`.

- [ ] **Step 2: Run the VE suite** — `pnpm --filter @rune-langium/visual-editor test`. Fix any file where an assertion still references `::` or where a helper rebuilds ids. Report the count.

- [ ] **Step 3: Run the studio unit suite** — `pnpm --filter @rune-langium/studio test`. The e2e `rf__node-…` test-ids must match the new ids (the test-id is derived from the node id). If Playwright e2e is gated behind a flag, run the available unit subset and note the e2e dependency.

- [ ] **Step 4: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/test apps/studio/test
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "test: rewrite Class-A node-id fixtures ::→. (bulk-safe files)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Surgical rewrites for MIXED files (instance-paths + expansion keys)

**Files (each holds BOTH populations):**
- `packages/visual-editor/test/layout/structure-layout.test.ts`
- `packages/visual-editor/test/adapters/structure-graph-adapter.test.ts`
- `packages/visual-editor/test/components/StructureView.test.tsx` + `StructureView.rerender-perf.test.tsx`
- `apps/studio/test/workspace/structure-view-persistence.test.ts`
- `apps/studio/test/store/structure-view-store.test.ts`

> The rule for these files: a node-id `::` → `.`, but an instance-path/expansion-key `::` separator STAYS. After the flip, a composite like `cdm.trade::Trade::__base::cdm.trade::TradeBase` becomes `cdm.trade.Trade::__base::cdm.trade.TradeBase` — the embedded type ids go dot-form, the `::__base::` / segment separators remain. Expansion keys `cdm.trade::Trade::economics` become `cdm.trade::cdm.trade.Trade::economics` (the leading `namespaceUri` segment is unchanged; the `typeId` segment becomes the full dot node id). **The production code in `structure-graph-adapter.ts` / `structure-view.ts` already produces the new form once node ids are dot-form (Task 1) — so this task only updates the test ASSERTIONS to match what the code now emits.**

- [ ] **Step 1: Run the mixed suite to see the new emitted forms**

Run `pnpm --filter @rune-langium/visual-editor test -- structure-layout structure-graph-adapter StructureView` and `pnpm --filter @rune-langium/studio test -- structure-view`. The failures show `expected '<old ::form>' got '<new form>'` — the "got" side is the correct new form.

- [ ] **Step 2: Rewrite each assertion by hand**

For each failing assertion, transform the literal per the rule above:
- Replace **only** the node-id sub-segments with dot form.
- Keep `::__base::`, `::__derived::`, and `namespaceUri::` / `::attrName` separators as `::`.
- For instance-path inputs (the `id` fields fed into the adapter), flip the canonical node-id `id` fields to dot form; the adapter then composes the new instance-path automatically.

Example transforms:
```
'cdm.trade::Trade'                                   → 'cdm.trade.Trade'                 (Class A id field)
'cdm.trade::Trade::__base::cdm.trade::TradeBase'     → 'cdm.trade.Trade::__base::cdm.trade.TradeBase'   (instance path)
'cdm.trade::Trade::economics'  (expansion key)       → 'cdm.trade::cdm.trade.Trade::economics'
'Root::a::A::b::B'  (instance path, dotless ns)      → 'Root::a::A::b::B'   (UNCHANGED — names dotless, no ns)
```
> Watch the dotless-namespace instance-path cases in `structure-layout.test.ts` (e.g. `Trade::party::Party`, `Root::a::A::b::B`): when the embedded ids have no namespace, there is nothing to flip — leave them. Only ids that carried a `ns::Name` form change.

- [ ] **Step 3: Verify** — re-run the mixed suite until green. Then run the WHOLE VE + studio suites to confirm no cross-file regression.

- [ ] **Step 4: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add packages/visual-editor/test/layout/structure-layout.test.ts packages/visual-editor/test/adapters/structure-graph-adapter.test.ts packages/visual-editor/test/components/StructureView.test.tsx packages/visual-editor/test/components/StructureView.rerender-perf.test.tsx apps/studio/test/workspace/structure-view-persistence.test.ts apps/studio/test/store/structure-view-store.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "test: surgical ::→. for mixed instance-path/expansion-key fixtures (separators preserved)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `rune/no-raw-node-id` lint rule + full verification

**Files:**
- Create/modify: `oxlint-plugins/rune.mjs` (add the rule, one file per `meta.name` — see memory `reference_oxlint_rune_plugin`)
- Modify: the nearest `.oxlintrc.json` wiring for `packages/visual-editor` + `apps/studio`
- Test: the plugin's test fixture pattern (mirror the existing `rune/no-raw-node-kind-lookup`)

> Spec §6 #7: make "node-shape knowledge in one place" CI-enforced. Now that the format is `.`, flag raw `` `${x}.${y}` ``-as-node-id and any residual `` `${x}::${y}` `` node-id construction OUTSIDE `node-projection.ts`. Be precise: the rule must NOT flag instance-path `::` composites, `builtin::`, or generic dotted strings — target the specific `makeNodeId`-shaped construction. Given the false-positive risk of matching "any dotted template," scope the rule conservatively: flag literal `'::'`-bearing node-id templates (now always wrong) and direct `` `${ns}::${name}` ``/`` `${namespace}.${name}` `` patterns assigned to a variable named `*[nN]odeId` or pushed as a node `id`. If a precise rule proves infeasible without heavy AST work, ship the narrower "no `::` in node-id position" rule + a TODO, and note it.

- [ ] **Step 1: Add the rule** mirroring `rune/no-raw-node-kind-lookup` structure; one `meta.name` per file per the collision gotcha.

- [ ] **Step 2: Wire it** in the dotted `.oxlintrc.json` for visual-editor (and studio if the studio sites are in scope). Allow `node-projection.ts` (and the core `qualifiedExportPath`) as the sanctioned construction site.

- [ ] **Step 3: Run lint** — `pnpm run lint`. It must pass (all raw construction already retired by Tasks 1–3). If it flags a site, that's a real residual — fix it.

- [ ] **Step 4: Full verification sweep** — run and report exact counts:
```
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/studio test
pnpm --filter @rune-langium/studio run type-check
pnpm run lint
```
Then confirm the flip is complete and the separation held:
```
rg -n "::" packages/visual-editor/src apps/studio/src | rg -v "builtin::|__base|__derived|expansionKey|namespaceUri|structure-graph-adapter|structure-view"   # should be empty or only known Class-B/C
rg -n "'::'|\"::\"|\\\$\\{.*\\}::\\\$" packages/visual-editor/src/store/node-projection.ts   # NODE_ID_SEPARATOR gone
```
Report any residual node-id `::`. The remaining `::` must be ONLY: instance-path separators, expansion keys, `builtin::`, CSS pseudo-selectors.

- [ ] **Step 5: Commit**

```bash
SKIP_SIMPLE_GIT_HOOKS=1 git add oxlint-plugins/rune.mjs <the .oxlintrc.json> packages/visual-editor apps/studio
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(lint): rune/no-raw-node-id; complete ::→. node-id migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review checklist (performed during plan authoring)

**Spec coverage (§9.8 V11 deep-dive):** separator flip via `qualifiedExportPath` (Task 1) ✓; last-dot reverse split ✓; the ≤6 VE `src` edit points (Task 1+2) ✓; the ~6 studio `src` edit points (Task 3) ✓; ~34 fixture files split bulk-safe (Task 4) vs surgical-mixed (Task 5) ✓; no persistence migration (constraint 4) ✓; the new lint rule (§6 #7, Task 6) ✓; `disambiguateTypeRef` straddle — audit confirms no `::` in its body, so the unification is automatic once ids are dot-form (verified, not edited).

**Population discipline (the core risk):** every task names which of the three `::` populations it touches. Class B (instance-path/expansion-key separators) and Class C (`builtin::`, CSS) are explicitly LEFT; mixed files get surgical, assertion-only rewrites (Task 5) because the production code already emits the new form once Task 1 lands. The biggest trap — bulk `sed` corrupting `__base`/expansion-key separators — is structurally prevented by isolating mixed files into Task 5.

**Ambiguity guard:** the TypeLink/NavigationContext suffix-match (a latent collision under dots) is upgraded to exact last-segment match (Task 2) rather than a literal delimiter swap — the one place behavior genuinely improves rather than merely preserves.

**Placeholder scan:** concrete code/sites throughout. The lint rule (Task 6) is the one spot with a documented fallback (narrower rule + TODO) because a precise "raw node-id template" oxlint matcher may need real AST work; flagged, not hand-waved.

**Dependency:** assumes 3A merged (node-projection is the single id owner). If executed before 3A, the two inline `makeNodeId` definitions (`ast-to-model.ts:61`, `editor-store.ts:496`) must be flipped directly and `node-projection.ts` created first — but the intended order is 3A → 3A′.
