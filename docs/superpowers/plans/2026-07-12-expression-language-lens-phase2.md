# Expression Language Lens — Phase 2 (Function-Body Lens) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove — and close any real gaps in — the TypeScript lens's support for Rune `func` operation bodies (User Story 3 of the spec), given that Phase 1 (merged, PR #386, `master@7ff8ed07`) already provides this incidentally.

**Architecture:** This is a verification-and-audit plan, not a from-scratch build. Research done before writing this plan found that Phase 1's `LanguageLensEditor`, `renderTs`/`parseTs`, and subset `S` already work for function operation bodies with **zero changes**, because of three pre-existing facts:

1. `FunctionForm.tsx` (`packages/visual-editor/src/components/editors/FunctionForm.tsx:456-489`) already threads each operation's **bare RHS expression** (`op.expression`, via `getCstText`) through the exact same `renderExpressionEditor` slot conditions use — never the whole `set output: <expr>` statement, just the expression text.
2. Subset `S` was never boolean-only — it already covers `ArithmeticOperation` (`+ - * /`), literals, feature-calls, comparisons. `principal * rate` is just an `ArithmeticOperation`, already fully supported.
3. `editor-store.ts`'s `updateExpression` action (`packages/visual-editor/src/store/editor-store.ts:1950-1982`) already has a dedicated `RosettaFunction` branch that creates `operations[0]` with `assignRoot: { $refText: fd.output?.name }` and `add: false` when none exists, or overwrites only `operations[0].expression` when one does — exactly the "single output only" constraint the spec asks for, via the same `RawDsl`-wrapped commit contract conditions already use.

So the lens never needs to recognize an `output = expr` assignment shape — that wrapping happens entirely outside the lens. What's missing is **verification**: no test proves this chain works end-to-end for functions (Phase 1's tests only ever exercised conditions), and no one has audited whether real func-body expressions hit gaps in subset `S` that conditions never would.

**Tech Stack:** Same as Phase 1 — `@rune-langium/codegen/lens` (tree-sitter TS parsing, MIT), `@rune-langium/visual-editor` editor-store (Mutative + zundo, MIT), `apps/studio` (FSL). No new dependencies.

## Global Constraints

- Canonical form is always Rune text; TS is a lossless projection with no persistence (spec: "Canonical Form Is Always Pure Rune").
- Refuse, never degrade: any construct outside subset `S` must produce `null` (render) or a `RefusalReason` (parse) — never an approximate result (spec: Central Contract, points 1 and 3).
- Widening subset `S` is a deliberate, test-backed act — never widen speculatively (spec line 251: "a narrow subset that never lies beats a wide one that sometimes degrades").
- Single `output` only for function bodies — no multi-operation editing, no `add`-accumulation lens support, no shortcut/alias editing via the lens (spec User Story 3, `updateExpression`'s existing `RosettaFunction` branch already enforces this at the store layer; do not build anything that tries to handle more than `operations[0]` targeting `output`).
- `packages/` is MIT-licensed, `apps/studio/` is FSL-1.1-ALv2 — SPDX headers must match the directory (see root `CLAUDE.md`).
- Tests depending on `.resources/` must use `describe.skipIf(!RESOURCES_EXIST)` so CI environments without the corpus skip cleanly (established convention, see `expression-corpus-sweep.test.ts`).

---

### Task 1: TS-lens corpus sweep for `Operation`/`ShortcutDeclaration` bodies

**Files:**
- Create: `packages/codegen/test/lens/typescript/function-body-corpus-sweep.test.ts`

**Interfaces:**
- Consumes: `renderTs` from `../render-ts.js` (`(node: RosettaExpression) => string | null`); `parseTs` from `../parse-ts.js` (`(text: string, wasmSource?: WasmSource) => Promise<LensResult>`); `parseExpression`/`renderExpression` from `@rune-langium/core`/`@rune-langium/codegen/rosetta` (same as Phase 1's `roundtrip.test.ts`); `parse` from `@rune-langium/core`.
- Produces: a real, numeric answer to "does subset `S` already cover real func-body expressions, or is there a gap?" — this answer gates Task 2.

This mirrors `packages/codegen/test/emit/rosetta/expression-corpus-sweep.test.ts`'s exact extraction pattern (walk `.resources/`, collect `Condition`/`Operation`/`ShortcutDeclaration` expression bodies), but instead of checking the Rune↔Rune fixed point (already proven, corpus-validated, untouched by this plan), it classifies every real `Operation`/`ShortcutDeclaration` expression body by whether it round-trips through the TS lens — reusing the exact `renderTs`/`parseTs` Phase 1 shipped, unmodified.

- [ ] **Step 1: Write the sweep test**

```typescript
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Phase 2 (function-body lens) — real-corpus classification sweep.
 *
 * Phase 1's subset `S` (render-ts.ts / parse-ts.ts) was designed and tested
 * against `Condition` bodies only. This sweep answers a factual question
 * before Phase 2 writes a single line of new lens code: does the SAME,
 * UNCHANGED subset S already cover real `Operation`/`ShortcutDeclaration`
 * (func-body) expressions found in `.resources/`, or is there a real gap?
 *
 * Every corpus expression is classified into exactly one bucket:
 *   - IN_S_ROUNDTRIPS: renderTs succeeds AND parseTs on that TS text
 *     succeeds AND reparses to a structurally-equivalent Rune expression
 *     (this is the "already works" bucket — the expected common case).
 *   - READ_ONLY: renderTs returns null (outside S) — expected, not a bug.
 *   - UNEXPECTED_REFUSAL: renderTs succeeds (claims in-S) but parseTs
 *     refuses the resulting TS text, OR the round-tripped Rune expression
 *     is not structurally equivalent to the original — this IS a bug
 *     class (an in-S claim that doesn't actually round-trip) and fails
 *     the test regardless of holder type.
 *
 * The test asserts zero UNEXPECTED_REFUSAL findings (a real correctness
 * bar) and logs the IN_S_ROUNDTRIPS / READ_ONLY split BY HOLDER TYPE
 * (Condition vs Operation vs ShortcutDeclaration) so Phase 2's Task 2 has
 * real numbers to decide whether subset S needs widening for functions.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import type { AstNode } from 'langium';
import { parse, parseExpression } from '@rune-langium/core';
import { treesEquivalent } from '../../../../codegen/test/emit/rosetta/expression-tree-equivalence.js';
import { renderTs } from '../../src/lens/typescript/render-ts.js';
import { parseTs } from '../../src/lens/typescript/parse-ts.js';

const RESOURCES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../.resources');
const RESOURCES_EXIST = existsSync(RESOURCES_DIR);

function collectRosettaFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectRosettaFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.rosetta')) {
      out.push(full);
    }
  }
  return out;
}

type HolderKind = 'Condition' | 'Operation' | 'ShortcutDeclaration';

interface ExpressionHolder extends AstNode {
  expression?: unknown;
}

function hasExpressionField(node: AstNode): node is ExpressionHolder {
  return node.$type === 'Condition' || node.$type === 'Operation' || node.$type === 'ShortcutDeclaration';
}

async function extractCorpusSnippets(): Promise<{
  snippets: Map<string, HolderKind>;
  fileCount: number;
}> {
  const { AstUtils } = await import('langium');
  const files = collectRosettaFiles(RESOURCES_DIR);
  const snippets = new Map<string, HolderKind>();

  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const result = await parse(content, pathToFileURL(file).toString());
    if (result.hasErrors) continue;

    for (const node of AstUtils.streamAllContents(result.value as unknown as { $type: string } & object)) {
      if (!hasExpressionField(node)) continue;
      const expr = node.expression as { $cstNode?: { text?: string } } | undefined;
      const text = expr?.$cstNode?.text;
      if (text && text.trim() && !snippets.has(text.trim())) {
        snippets.set(text.trim(), node.$type as HolderKind);
      }
    }
  }

  return { snippets, fileCount: files.length };
}

describe.skipIf(!RESOURCES_EXIST)('function-body TS-lens corpus sweep (Phase 2, Task 1)', () => {
  it('classifies every real Condition/Operation/ShortcutDeclaration body against the unchanged subset S', async () => {
    const { snippets, fileCount } = await extractCorpusSnippets();
    expect(fileCount).toBeGreaterThan(100);
    expect(snippets.size).toBeGreaterThan(0);

    const counts: Record<HolderKind, { inS: number; readOnly: number }> = {
      Condition: { inS: 0, readOnly: 0 },
      Operation: { inS: 0, readOnly: 0 },
      ShortcutDeclaration: { inS: 0, readOnly: 0 }
    };
    const unexpectedRefusals: Array<{ snippet: string; holder: HolderKind; reason: string }> = [];

    for (const [snippet, holder] of snippets) {
      const p1 = parseExpression(snippet);
      if (p1.hasErrors) continue; // not this sweep's concern — same as expression-corpus-sweep.test.ts

      const ts = renderTs(p1.value);
      if (ts === null) {
        counts[holder].readOnly++;
        continue;
      }

      const back = await parseTs(ts);
      if (!back.ok) {
        unexpectedRefusals.push({ snippet, holder, reason: `renderTs succeeded but parseTs refused: ${back.reason.message}` });
        continue;
      }

      if (!treesEquivalent(p1.value, back.node)) {
        unexpectedRefusals.push({ snippet, holder, reason: 'round-tripped tree not structurally equivalent' });
        continue;
      }

      counts[holder].inS++;
    }

    // eslint-disable-next-line no-console
    console.log(
      '[function-body-corpus-sweep] by holder type (in-S round-trips / read-only):\n' +
        `  Condition:            ${counts.Condition.inS} / ${counts.Condition.readOnly}\n` +
        `  Operation:            ${counts.Operation.inS} / ${counts.Operation.readOnly}\n` +
        `  ShortcutDeclaration:  ${counts.ShortcutDeclaration.inS} / ${counts.ShortcutDeclaration.readOnly}`
    );

    if (unexpectedRefusals.length > 0) {
      const lines = [`${unexpectedRefusals.length} unexpected refusal(s) — an in-S claim that didn't actually round-trip:`];
      for (const f of unexpectedRefusals.slice(0, 20)) {
        lines.push(`  [${f.holder}] ${JSON.stringify(f.snippet)}\n  reason: ${f.reason}`);
      }
      expect.fail(lines.join('\n'));
    }
  }, 120_000);
});
```

- [ ] **Step 2: Run it and record the real numbers**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/typescript/function-body-corpus-sweep.test.ts`
Expected: PASS (zero unexpected refusals). Read the console output for the `Operation:` and `ShortcutDeclaration:` in-S/read-only counts — **write these numbers into Task 2's decision below before starting Task 2.**

- [ ] **Step 3: Commit**

```bash
git add packages/codegen/test/lens/typescript/function-body-corpus-sweep.test.ts
git commit -m "test(codegen): TS-lens corpus sweep for function operation/shortcut bodies"
```

---

### Task 2: Close any subset gaps found by Task 1 (contingent — read this task fully before starting)

**Files:**
- Modify (only if Task 1 found a gap): `packages/codegen/src/lens/subset.ts`, `packages/codegen/src/lens/typescript/render-ts.ts`, `packages/codegen/src/lens/typescript/parse-ts.ts`
- Test (only if Task 1 found a gap): `packages/codegen/test/lens/typescript/render-ts.test.ts`, `packages/codegen/test/lens/typescript/parse-ts.test.ts`, `packages/codegen/test/lens/subset.test.ts`

**Interfaces:**
- Consumes: Task 1's `Operation`/`ShortcutDeclaration` in-S/read-only counts.

This task has two possible outcomes. Determine which one applies from Task 1's actual output — do not guess ahead of running it.

**Outcome A — zero unexpected refusals AND the `Operation`/`ShortcutDeclaration` read-only counts are 0, or every read-only case is a construct Phase 1 already deliberately excluded for conditions too** (e.g. `SwitchOperation`, `ThenOperation` — the irreversible-lowering exclusions the Phase 1 plan already documented). In this case, subset `S` needs no changes.

- [ ] **Step A1: Record the decision**

Add a short comment to `packages/codegen/src/lens/subset.ts`, immediately after the `SUBSET_S_TYPES` definition:

```typescript
// Phase 2 audit (2026-07-12, function-body-corpus-sweep.test.ts): swept every
// real Operation/ShortcutDeclaration body in .resources/ against this
// unchanged subset — zero unexpected refusals, and every read-only
// expression was already an excluded construct from the Phase 1 audit
// (see the exclusions list above). No widening needed for function bodies.
```

- [ ] **Step A2: Commit**

```bash
git add packages/codegen/src/lens/subset.ts
git commit -m "docs(codegen/lens): record Phase 2 subset audit — no widening needed"
```

**Outcome B — Task 1 found real, common func-body constructs outside `S` that aren't already-excluded irreversible-lowering cases** (e.g. a constructor expression like `Money { amount: x, currency: y }`, used heavily in real pure functions but never in boolean conditions). Widen `S` for that specific construct, following the exact pattern established for every existing subset member — worked below using `RosettaConstructorExpression` as the illustrative template; substitute whatever `$type`(s) Task 1's real output actually names.

- [ ] **Step B1: Write the failing test** (in `packages/codegen/test/lens/typescript/render-ts.test.ts`, following that file's existing per-`$type` `describe` block convention)

```typescript
describe('RosettaConstructorExpression', () => {
  it('renders a constructor with named fields as a TS object literal', () => {
    const node = parseExpression('Money { amount: 10, currency: "USD" }').value;
    expect(renderTs(node)).toBe('{ amount: 10, currency: "USD" }');
  });
});
```

Adjust the exact expected TS shape to whatever the real construct's documented, semantically-equivalent projection should be — do not invent a shape without checking whether `expr/transpiler.ts` already has a reversible emission for it (Phase 1's Task 2 established the "wrap/reuse `expr/transpiler.ts` where its output is reversible" rule; check there first per the spec's Phase 1 step 2).

- [ ] **Step B2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/typescript/render-ts.test.ts -t "RosettaConstructorExpression"`
Expected: FAIL (renderTs returns `null` — the $type isn't in `SUBSET_S_TYPES` yet)

- [ ] **Step B3: Add the type to subset.ts, then implement the render-ts.ts case**

Add the real `$type` string to `SUBSET_S_TYPES` in `packages/codegen/src/lens/subset.ts`, then add a `case` in `render-ts.ts`'s `dispatch` function following the file's existing pattern (throw `UnsupportedInChild()` for anything within the construct that itself falls outside `S` — do not partially render).

- [ ] **Step B4: Run to verify it passes, then write and pass the matching parse-ts.ts test + implementation**

Follow the identical failing-test → tree-sitter-node-shape-confirmed-against-a-real-parse (per `parse-ts.ts`'s own established discipline — do not assume tree-sitter node/field names, verify with a real parse first, exactly as Phase 1's Task 3 did for `parenthesized_expression`) → implementation → passing-test cycle for `parse-ts.ts`.

- [ ] **Step B5: Re-run Task 1's sweep to confirm the gap closed**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/typescript/function-body-corpus-sweep.test.ts`
Expected: PASS, with the `Operation`/`ShortcutDeclaration` in-S counts increased and read-only counts decreased versus Task 1's original numbers.

- [ ] **Step B6: Commit**

```bash
git add packages/codegen/src/lens/subset.ts packages/codegen/src/lens/typescript/render-ts.ts packages/codegen/src/lens/typescript/parse-ts.ts packages/codegen/test/lens/typescript/render-ts.test.ts packages/codegen/test/lens/typescript/parse-ts.test.ts
git commit -m "feat(codegen/lens): widen subset S for <the real $type> — closes a real func-body gap"
```

---

### Task 3: `editor-store.ts` — cover the untested branches of `updateExpression`'s `RosettaFunction` path

**Files:**
- Modify (tests only — no production code changes expected): `packages/visual-editor/test/store/editor-store-actions.test.ts`

**Interfaces:**
- Consumes: `updateExpression(nodeId: string, expressionText: string): void` (`packages/visual-editor/src/store/editor-store.ts:1950`, unchanged); `store.temporal.getState().pastStates` (zundo undo history, same accessor already used by `mutate-graph.test.ts`'s undo-history-entry test).

`updateExpression`'s `RosettaFunction` branch has two real, currently-untested code paths (confirmed by reading the existing `describe('updateExpression', ...)` block at `editor-store-actions.test.ts:1254` and the `describe('updateExpression — id-rooted patch (Wave D)', ...)` block at line 1949 — **both existing test blocks only ever exercise a function that ALREADY has an `operations[0]` entry**):

1. The `fd.operations.length === 0` branch (creates a brand-new `Operation` targeting `output`) — never exercised.
2. Undo/redo for a lens-driven `updateExpression` commit — the spec's own self-review (Open Question 8) flagged this as assumed-not-verified, and it remains unverified for functions specifically.

- [ ] **Step 1: Write the failing "creates operations[0] when empty" test**

Add to the existing `describe('updateExpression', ...)` block in `packages/visual-editor/test/store/editor-store-actions.test.ts` (right after the existing `'updates the function body expression via operations'` test):

```typescript
it('creates operations[0] targeting output when the function has no operations yet', async () => {
  const funcStore = createEditorStore();
  const funcResult = await parse(`
    namespace test.func
    version "test"

    func MyFunc:
      inputs:
        x int (1..1)
      output:
        result int (1..1)
  `);
  funcStore.getState().loadModels(funcResult.value);

  const funcNode = funcStore.getState().nodes.find((n) => n.data.name === 'MyFunc');
  expect(funcNode).toBeDefined();
  expect(((funcNode!.data as any).operations ?? []).length).toBe(0);

  funcStore.getState().updateExpression(funcNode!.id, 'x + 1');

  const updated = funcStore.getState().nodes.find((n) => n.id === funcNode!.id);
  const ops = (updated!.data as any).operations ?? [];
  expect(ops.length).toBe(1);
  expect(ops[0].add).toBe(false);
  expect(ops[0].assignRoot.$refText).toBe('result');
  expect(ops[0].expression.$type).toBe(RAW_DSL_TYPE);
  expect(ops[0].expression.text).toBe('x + 1');
});
```

- [ ] **Step 2: Run it to verify it currently passes or fails**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/store/editor-store-actions.test.ts -t "creates operations\\[0\\]"`
Expected: this exercises EXISTING production code (`editor-store.ts`'s `RosettaFunction` branch already handles the empty case per the code read during planning) — so this should PASS immediately, proving by test rather than by reading that the empty-operations path already works correctly. If it fails, that is a **real bug** in existing code and must be fixed in `editor-store.ts` before continuing (do not weaken the test to match broken behavior).

- [ ] **Step 3: Write the undo/redo test**

Add a new test to the same `describe('updateExpression', ...)` block:

```typescript
it('undo reverts a lens-driven commit and redo re-applies it', async () => {
  const funcStore = createEditorStore();
  const funcResult = await parse(`
    namespace test.func
    version "test"

    func MyFunc:
      inputs:
        x int (1..1)
      output:
        result int (1..1)
      set result:
        x + 1
  `);
  funcStore.getState().loadModels(funcResult.value);
  const funcNode = funcStore.getState().nodes.find((n) => n.data.name === 'MyFunc');
  const nodeId = funcNode!.id;

  funcStore.getState().updateExpression(nodeId, 'x * 2');
  const afterEdit = funcStore.getState().nodes.find((n) => n.id === nodeId);
  expect((afterEdit!.data as any).operations[0].expression.text).toBe('x * 2');

  funcStore.temporal.getState().undo();
  const afterUndo = funcStore.getState().nodes.find((n) => n.id === nodeId);
  expect((afterUndo!.data as any).operations[0].expression.text).toBe('x + 1');

  funcStore.temporal.getState().redo();
  const afterRedo = funcStore.getState().nodes.find((n) => n.id === nodeId);
  expect((afterRedo!.data as any).operations[0].expression.text).toBe('x * 2');
});
```

- [ ] **Step 4: Run both new tests**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/store/editor-store-actions.test.ts -t "updateExpression"`
Expected: PASS. If the undo/redo test fails, this is a **real bug** — `funcStore.temporal` may need a different accessor than `store.temporal` depending on how `createEditorStore()`'s zundo wiring is exposed; check `mutate-graph.test.ts`'s existing undo test (`packages/visual-editor/test/store/mutate-graph.test.ts:68`) for the confirmed-working accessor pattern before assuming the test itself is wrong.

- [ ] **Step 5: Run the full visual-editor suite (shared-component convention)**

Run: `pnpm --filter @rune-langium/visual-editor run test`
Expected: PASS, no regressions.

- [ ] **Step 6: Commit**

```bash
git add packages/visual-editor/test/store/editor-store-actions.test.ts
git commit -m "test(visual-editor): cover updateExpression's empty-operations create path + undo/redo for functions"
```

---

### Task 4: `FunctionForm.tsx` — prove the `renderExpressionEditor` slot contract, and confirm the toggle reaches functions

**Files:**
- Modify (tests only): `packages/visual-editor/test/editors/FunctionForm.test.tsx`
- Read only (verification, no expected change): `apps/studio/src/shell/ExplorePerspective.tsx`, and whatever component `EditorFormPanel` (imported there) dispatches `RosettaFunction` nodes to

**Interfaces:**
- Consumes: `ExpressionEditorSlotProps` (`{ value, onChange, onBlur, error?, placeholder?, expressionAst? }`, from `@rune-langium/visual-editor`), unchanged.

`FunctionForm.test.tsx` currently never passes or asserts against `renderExpressionEditor` at all (confirmed: zero occurrences of the string in the file during planning) — every existing test exercises the plain-`<Textarea>` fallback. The whole premise of this plan (that Phase 1's `LanguageLensEditor` already works for function bodies) rests on `renderExpressionEditor` receiving the **bare RHS expression text**, not the full `set output: <expr>` statement, for both an existing operation and the empty-operations case. This task proves that contract by test, and confirms (read-only) that the toggle wired in `ExplorePerspective.tsx` actually reaches `FunctionForm`.

- [ ] **Step 1: Confirm the ExplorePerspective → FunctionForm wiring (read-only — no code change expected)**

Read `apps/studio/src/shell/ExplorePerspective.tsx` around its `<EditorFormPanel renderExpressionEditor={renderExpressionEditor} ... />` usage (confirmed present at the time of planning — `renderExpressionEditor` is passed once, generically, not conditioned on node `$type`). Read `EditorFormPanel`'s own source (`apps/studio/src/... ` or wherever it's defined — locate via its import path in `ExplorePerspective.tsx`) to confirm it forwards `renderExpressionEditor` to `FunctionForm` when dispatching a `RosettaFunction` node, the same way it forwards it to whichever component renders `Condition`s. If this forwarding is missing, add it (mirroring exactly how it's already wired for the condition-bearing dispatch case) as an additional step here before continuing — but based on the pattern found during planning (a single generic prop pass-through, not per-`$type` branching), no gap is expected.

- [ ] **Step 2: Write the failing "operation slot receives bare RHS text" test**

Add to `packages/visual-editor/test/editors/FunctionForm.test.tsx`, following its existing render/setup conventions (`makeFuncData`, `makeActions`, `render(<FunctionForm ... />)`):

```typescript
it('passes the bare RHS expression text (not the full set/add statement) to renderExpressionEditor for an existing operation', () => {
  const data = makeFuncData({
    operations: [
      {
        $type: 'Operation',
        add: false,
        assignRoot: { $refText: 'result' },
        expression: { $type: 'RawDsl', text: 'principal * rate', $cstNode: { text: 'principal * rate' } }
      }
    ]
  } as any);

  const renderExpressionEditor = vi.fn((props: any) => <div data-testid="slot-value">{props.value}</div>);

  render(
    <FunctionForm
      data={data as any}
      actions={makeActions()}
      availableTypes={AVAILABLE_TYPES}
      nodeMeta={testMeta()}
      renderExpressionEditor={renderExpressionEditor}
    />
  );

  expect(renderExpressionEditor).toHaveBeenCalled();
  const call = renderExpressionEditor.mock.calls.find((c: any) => c[0].value === 'principal * rate');
  expect(call, 'renderExpressionEditor must receive the bare RHS text, not "set result: principal * rate"').toBeDefined();
});

it('offers an empty-state expression slot when the function has no operations yet, and its onChange reaches updateExpression via the form field', () => {
  const data = makeFuncData({ operations: [], shortcuts: [] } as any);
  const renderExpressionEditor = vi.fn((props: any) => (
    <button data-testid="commit" onClick={() => props.onChange('x + 1')}>
      commit
    </button>
  ));
  const actions = makeActions();

  render(
    <FunctionForm
      data={data as any}
      actions={actions}
      availableTypes={AVAILABLE_TYPES}
      nodeMeta={testMeta()}
      renderExpressionEditor={renderExpressionEditor}
    />
  );

  expect(renderExpressionEditor).toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('commit'));
  // The empty-state slot commits through the form field, not directly through
  // actions.updateExpression — confirm the value reached the form (matching
  // the existing "Expression textarea validation on blur" test's pattern for
  // how this file already asserts committed form state, e.g. via getValues
  // or a subsequent blur+assert on actions.updateExpression).
});
```

Read the existing `'Expression textarea validation on blur'` test (already in this file, per its own header comment) before finalizing the second test's assertion — match its exact mechanism for confirming a value reached `actions.updateExpression` (it may require an explicit blur simulation after the value change, since `handleExpressionBlur` — not `onChange` directly — is what calls `actions.updateExpression`).

- [ ] **Step 3: Run to verify both pass**

Run: `pnpm --filter @rune-langium/visual-editor exec vitest run test/editors/FunctionForm.test.tsx -t "renderExpressionEditor"`
Expected: PASS. If the first test fails (slot receives the FULL statement, not bare RHS), this is a **real, load-bearing finding** that invalidates this plan's core premise — stop and re-scope Task 2 to include building the assignment-shape recognition this plan currently says is unnecessary, rather than patching the test to match.

- [ ] **Step 4: Update `subset.ts`'s own documentation to state function-body support explicitly**

`packages/codegen/src/lens/subset.ts` currently only documents its role for `Condition` bodies. Add a short doc comment near the top of the file (adjust exact wording to match the file's existing comment style):

```typescript
// Also covers Operation.expression and ShortcutDeclaration.expression bodies
// (Rune func operations/aliases) — subset S is expression-shaped, not
// holder-shaped, so it applies uniformly wherever a bare RosettaExpression
// is rendered/parsed. See docs/superpowers/plans/2026-07-12-expression-language-lens-phase2.md
// for the audit that confirmed this (function-body-corpus-sweep.test.ts).
```

- [ ] **Step 5: Close the spec's open questions this plan resolves**

In `docs/superpowers/specs/2026-07-11-expression-language-lens-design.md`, move Open Question 8 ("Undo/redo is assumed, not verified") from "Still open" into a new "Resolved by Phase 2" note, referencing Task 3's undo/redo test. Add a note next to User Story 3's acceptance scenarios that the function-body lens shipped as a byproduct of Phase 1's generic `renderExpressionEditor` wiring, verified (not built) in Phase 2 — reference this plan file.

- [ ] **Step 6: Run the full visual-editor and codegen suites**

Run: `pnpm --filter @rune-langium/visual-editor run test && pnpm --filter @rune-langium/codegen exec vitest run`
Expected: PASS, no regressions.

- [ ] **Step 7: Commit**

```bash
git add packages/visual-editor/test/editors/FunctionForm.test.tsx packages/codegen/src/lens/subset.ts docs/superpowers/specs/2026-07-11-expression-language-lens-design.md
git commit -m "test(visual-editor): prove renderExpressionEditor's bare-RHS contract for function operations; docs: close Phase 2 open questions"
```

---

## Self-Review

**Spec coverage:** User Story 3's four acceptance scenarios — (1) `output:` renders as `output =` — covered by Task 1's sweep (Condition-side rendering already proven in Phase 1; Task 1 proves the same for Operation). (2) TS `output = expr` commits to canonical Rune — covered by Task 3 (existing + new tests on `updateExpression`'s function branch) and Task 4 (proves the slot contract that makes this possible at the UI layer). (3) imperative TS refused — already covered by Phase 1's `parseTs`, which refuses assignments/statements outside a bare expression at the syntax level; Task 1's sweep would surface any func-specific gap in this refusal. (4) no-TS-equivalent operation reads Rune-only with a notice — covered by Task 1/Task 2 (subset classification) and Phase 1's existing read-only UI path (`LanguageLensEditor.tsx`'s `outOfSubset` branch, unmodified, generic over holder type). Open Questions 8 (undo/redo) closed by Task 3; Open Question 4 (`count`/`one-of`) is condition-specific and out of this plan's scope (unchanged from Phase 1).

**Placeholder scan:** Task 2's Outcome B is necessarily contingent on Task 1's real output — this is not a placeholder in the prohibited sense (vague "add support") but a fully-worked template with real code, explicitly flagged as needing `$type` substitution from real findings, following the same pattern Phase 1's own plan used for its tree-sitter viability spike.

**Type consistency:** `LensResult`, `RosettaExpression`, `WasmSource`, `RAW_DSL_TYPE`, `renderTs`/`parseTs`/`renderExpression`/`parseExpression` signatures are used identically to their Phase 1 (merged, unmodified) definitions throughout every task — no new types introduced.
