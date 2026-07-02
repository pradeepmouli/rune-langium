# Expression Fidelity (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve comments and authored layout of unedited expression bodies when their containing node re-renders, by slicing the original source via the already-stamped `$cstRange` — plus multi-line pretty-printing for body-root `switch`.

**Architecture:** `renderNode` gains an optional `renderExpr` hook (same IoC shape as `renderChild`; default behavior byte-identical to today). The VE cst-reuse layer — which owns `originalSource` — supplies the hook: `RawDsl → verbatim · clean $cstRange → slice · else → structural renderExpression`. Spec: `docs/superpowers/specs/2026-07-02-expression-fidelity-p2-design.md`.

**Tech Stack:** TypeScript 5.9 strict ESM, Vitest. Branch `feat/expression-fidelity-p2` off master AFTER PR #359 merges (depends on P1's prec-0 + tree-equivalence harness).

## Global Constraints

- Branch from master containing #359. First commit = the spec + this plan (both currently uncommitted in the working tree).
- render-core WITHOUT opts must behave byte-identically to today (full existing suites are the regression gate).
- "Range present ⇒ body unedited" is the structural invariant (all expression edits are wholesale `RawDsl` replacement); do NOT add a parallel dirty-tracking mechanism for bodies.
- Display path untouched: `preserveCstText`, `getExpressionDisplayText`, FunctionForm — zero changes.
- `transpiler.ts` untouched. `RawDsl` contract unchanged.
- Switch pretty-print is body-ROOT only (≥2 cases); nested switch stays single-line (parenthesized by P1's prec-0). Acceptance gate: tree-equivalence + fixed-point stay green in the hand corpus AND the 2870-snippet sweep; if `insertImplicitBrackets` breaks multi-line switch on reparse, fall back to single-line and RECORD the finding — do not force it.
- After codegen changes: rebuild dist (`pnpm --filter @rune-langium/codegen run build`) before VE suites.
- Commits: `SKIP_SIMPLE_GIT_HOOKS=1`; stage only named files (NEVER `git add -A`); footers `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01QBKeg1hukfnXfvCCkQnxb2`.
- Line numbers below are anchors from the P1-era tree — verify by content at execution time.

---

### Task 1: `renderExpr` hook in render-core

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/rosetta-render-core.ts` (exprText ~L61; renderOperation ~L207; renderShortcut ~L225; renderCondition ~L303; renderNode ~L392; renderModel ~L432)
- Modify: `packages/codegen/src/rosetta.ts` (export the opts type)
- Test: `packages/codegen/test/emit/rosetta/render-expr-hook.test.ts` (create)

**Interfaces:**
- Produces: `interface RenderOpts { renderExpr?: (expr: unknown) => string }`; `renderNode(node, renderChild, opts?)`; `renderModel(model, opts?)`. Hook contract: called only with a non-null expression body; its return is used verbatim as the body text. Exported from `@rune-langium/codegen/rosetta`. Task 3 consumes.

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
const regen: RenderChild = (c) => renderNode(c, regen) ?? '';
const expr = { $type: 'RosettaBooleanLiteral', value: true } as never;

describe('renderNode renderExpr hook', () => {
  it('routes all 3 body sites through the hook', () => {
    const renderExpr = vi.fn(() => 'HOOKED');
    const cond = { $type: 'Condition', name: 'C', expression: expr, annotations: [], references: [] } as never;
    const op = { $type: 'Operation', add: false, assignRoot: { $refText: 'r' }, expression: expr } as never;
    const sc = { $type: 'ShortcutDeclaration', name: 'a', expression: expr } as never;
    expect(renderNode(cond, regen, { renderExpr })).toContain('HOOKED');
    expect(renderNode(op, regen, { renderExpr })).toContain('HOOKED');
    expect(renderNode(sc, regen, { renderExpr })).toContain('HOOKED');
    expect(renderExpr).toHaveBeenCalledTimes(3);
    expect(renderExpr).toHaveBeenCalledWith(expr);
  });

  it('without opts, structural default is unchanged', () => {
    const sc = { $type: 'ShortcutDeclaration', name: 'a', expression: expr } as never;
    expect(renderNode(sc, regen)).toBe('alias a:\n    True');
  });

  it('hook is NOT called for an absent body', () => {
    const renderExpr = vi.fn(() => 'HOOKED');
    const cond = { $type: 'Condition', name: 'C', expression: undefined, annotations: [], references: [] } as never;
    renderNode(cond, regen, { renderExpr });
    expect(renderExpr).not.toHaveBeenCalled();
  });
});
```

(Adjust the exact `alias a:` expectation string to the current renderer output — read `renderShortcut` first; the assertion intent is byte-identity with today's no-opts output.)

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @rune-langium/codegen test -- render-expr-hook` → FAIL (renderNode takes 2 args / hook ignored).

- [ ] **Step 3: Implement**

In `rosetta-render-core.ts`:

```ts
/** Options threaded through renderNode/renderModel to the expression-body sites. */
export interface RenderOpts {
  /**
   * Override expression-body rendering (called only with a non-null body;
   * return value used verbatim). The VE cst-reuse layer uses this to slice
   * unedited bodies from the original source (P2 fidelity design). Default:
   * structural renderExpression with CST-text fallback.
   */
  renderExpr?: (expr: unknown) => string;
}

function exprText(expr: unknown, opts?: RenderOpts): string {
  if (expr == null) return '';
  if (opts?.renderExpr) return opts.renderExpr(expr);
  try {
    return renderExpression(expr as never);
  } catch {
    const e = expr as { $cstText?: string; $cstNode?: { text?: string } };
    return (e.$cstText ?? e.$cstNode?.text ?? '').trim();
  }
}
```

Thread `opts` (optional last param) through: `renderOperation(o, opts?)`, `renderShortcut(s, opts?)`, `renderCondition(c, renderChild, opts?)` — their `exprText(x)` calls become `exprText(x, opts)`. `renderNode(node, renderChild, opts?)` passes `opts` to those three cases only. `renderModel(model, opts?)` passes `opts` to both its `renderNode` calls (including inside its internal `renderChild` closure).

In `rosetta.ts` add: `export type { RenderOpts } from './emit/rosetta/rosetta-render-core.js';`

- [ ] **Step 4: Run tests** — hook test PASS; full `pnpm --filter @rune-langium/codegen test` green (regression: no-opts byte-identity); type-check clean.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/rosetta/rosetta-render-core.ts packages/codegen/src/rosetta.ts packages/codegen/test/emit/rosetta/render-expr-hook.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen): renderExpr hook — IoC seam for expression-body rendering"
```

---

### Task 2: body-root multi-line switch

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/render-expression.ts` (renderExpression entry ~L169, dispatch ~L173, SwitchOperation case ~L305)
- Test: `packages/codegen/test/emit/rosetta/render-expression.test.ts` (extend), `expression-roundtrip.test.ts` (corpus entry)

**Interfaces:**
- Consumes: Task 1 unaffected (this is inside the structural renderer). Produces: root-level `SwitchOperation` with ≥2 cases renders `\n`-separated cases; nested/single-case unchanged. No public API change.

- [ ] **Step 1: Failing tests**

```ts
it('renders a body-root switch with >=2 cases multi-line', () => {
  const cases = [
    { $type: 'SwitchCaseOrDefault', guard: { $type: 'SwitchCaseGuard', referenceGuard: { $refText: 'Red' } }, expression: int(1) },
    { $type: 'SwitchCaseOrDefault', guard: undefined, expression: int(0) }
  ];
  expect(renderExpression({ $type: 'SwitchOperation', operator: 'switch', argument: sym('color'), cases } as never))
    .toBe('color switch\n    Red then 1,\n    default 0');
});

it('keeps a NESTED switch single-line (parenthesized)', () => {
  const cases = [
    { $type: 'SwitchCaseOrDefault', guard: { $type: 'SwitchCaseGuard', referenceGuard: { $refText: 'Red' } }, expression: int(1) },
    { $type: 'SwitchCaseOrDefault', guard: undefined, expression: int(0) }
  ];
  const sw = { $type: 'SwitchOperation', operator: 'switch', argument: sym('color'), cases } as never;
  expect(renderExpression(bin('ArithmeticOperation', '+', sym('x'), sw)))
    .toBe('x + (color switch Red then 1, default 0)');
});

it('keeps a single-case root switch single-line', () => {
  const cases = [{ $type: 'SwitchCaseOrDefault', guard: undefined, expression: int(0) }];
  expect(renderExpression({ $type: 'SwitchOperation', operator: 'switch', argument: sym('color'), cases } as never))
    .toBe('color switch default 0');
});
```

Corpus (`expression-roundtrip.test.ts`): add a ≥2-case switch entry whose EXPECTED fixed-point form is the multi-line rendering — the harness's `r2 === r1` + tree-equivalence assertions are the acceptance gate; whitespace-normalize the CORPUS INPUT comparison only if the harness compares inputs (it doesn't — it compares r1/r2, so multi-line output self-stabilizes or fails loudly).

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** — root-only flag, not a public option:

```ts
export function renderExpression(expr: DehydratedExpression): string {
  return dispatch(expr as unknown as AnyNode, true);
}
function dispatch(node: AnyNode, atRoot = false): string { ... }
// r() keeps calling dispatch(child) — children are never atRoot.
// SwitchOperation case:
const rendered = cases.map(renderSwitchCase);
const joined = atRoot && rendered.length >= 2
  ? `\n    ${rendered.join(',\n    ')}`
  : ` ${rendered.join(', ')}`;
return `${argPrefix(node)}switch${joined}`;
```

(Match the single-line form's exact current spacing for the non-root branch — read the existing case first. RawDsl/all other cases ignore `atRoot`.)

- [ ] **Step 4: Acceptance gate** — render-expression tests PASS; hand corpus (incl. the new multi-line entry) PASS under fixed-point + tree-equivalence; FULL sweep rerun (`pnpm --filter @rune-langium/codegen test -- expression-corpus-sweep`) — the real corpus contains multi-case switches; 0 findings required. **If reparse fails on multi-line switch (implicit-bracket interaction): revert to single-line, delete the multi-line tests, record the finding in the task report — this is the spec's explicit fallback.** Full codegen suite + type-check.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/rosetta/render-expression.ts packages/codegen/test/emit/rosetta/render-expression.test.ts packages/codegen/test/emit/rosetta/expression-roundtrip.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen): multi-line body-root switch rendering"
```

---

### Task 3: cst-reuse `renderExpr` supplier + end-to-end fidelity

**Files:**
- Modify: `packages/visual-editor/src/serialize/cst-reuse-renderer.ts` (renderChild closure ~L86, renderNode call ~L90)
- Test: `packages/visual-editor/test/serialize/cst-reuse-expression-fidelity.test.ts` (create), `packages/visual-editor/test/serialize/editable-roundtrip.test.ts` (extend)

**Interfaces:**
- Consumes: `RenderOpts`/`renderNode(…, opts)` from `@rune-langium/codegen/rosetta` (Task 1 — REBUILD codegen dist first); `renderExpression`, `RAW_DSL_TYPE` (existing exports); `$cstRange` on dehydrated expression nodes (stamped recursively by the hydrator); `originalSource` already in `RenderArgs`.

- [ ] **Step 1: Rebuild codegen dist** (`pnpm --filter @rune-langium/codegen run build`) so VE sees Task 1's signature.

- [ ] **Step 2: Failing tests**

`cst-reuse-expression-fidelity.test.ts` — build a minimal doc where a Data type has a condition whose body spans multiple lines and contains a `// comment`; parse it; dehydrate (use the same helpers `editable-roundtrip.test.ts` uses to load into the store); mark the NODE dirty via a sibling-field edit (e.g. rename an attribute through the store); serialize via `buildSourceForNamespaces`; assert:
1. the output contains the body BYTE-IDENTICAL (comment + line breaks survive);
2. replacing the body via the store's `updateCondition` (→ RawDsl) then serializing yields the new text verbatim;
3. a synthetic rangeless structured body (hand-injected) falls back to structural rendering (no throw, normalized text present).

`editable-roundtrip.test.ts` — one e2e fixture: doc with commented multi-line condition body → sibling-field edit → render → body unchanged byte-for-byte → reparse clean.

- [ ] **Step 3: Run to verify failure** — today the body re-renders structurally: comment gone, single-line.

- [ ] **Step 4: Implement the supplier**

In `cst-reuse-renderer.ts`, inside the per-node render closure (where `originalSource` is in scope):

```ts
import { renderNode, renderExpression, RAW_DSL_TYPE, type RenderChild, type RenderOpts, type DehydratedNode } from '@rune-langium/codegen/rosetta';

// P2 fidelity: unedited bodies slice the original source (comments/layout
// preserved). "Range present ⇒ unedited" is structural — every expression
// edit replaces the body wholesale with a rangeless RawDsl leaf.
const renderExpr: RenderOpts['renderExpr'] = (expr) => {
  const e = expr as { $type?: string; text?: string };
  if (e.$type === RAW_DSL_TYPE) return String(e.text ?? '');
  const range = cstRange(expr);
  if (range) return originalSource.slice(range.offset, range.end);
  return renderExpression(expr as never);
};
// ... renderNode(child, renderChild, { renderExpr })
```

Both `renderNode` call sites in the file pass `{ renderExpr }` (verify whether the closure structure shares one — thread consistently).

- [ ] **Step 5: Verify** — new tests PASS; FULL `pnpm --filter @rune-langium/visual-editor test`; VE + studio type-checks; full codegen suite (unchanged but confirm).

- [ ] **Step 6: Commit**

```bash
git add packages/visual-editor/src/serialize/cst-reuse-renderer.ts packages/visual-editor/test/serialize/cst-reuse-expression-fidelity.test.ts packages/visual-editor/test/serialize/editable-roundtrip.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): slice unedited expression bodies from original source (P2 fidelity)"
```

---

## Final verification

```bash
pnpm --filter @rune-langium/codegen run build && pnpm run type-check && pnpm test
```
Whole monorepo green → final whole-branch review → finishing-a-development-branch.
