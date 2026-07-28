# Renderer Hardening (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three small robustness fixes for the expression renderer stack: a RawDsl-as-child parenthesization guard, observability for unexpected `exprText` throws, and `literalGuard` conversion consistency.

**Architecture (user-approved design, brainstormed in-session):** All three are point changes to existing files; no new modules, no API changes. P3 of the post-B1 roadmap (ledger `.superpowers/sdd/b1-progress.md`).

**Tech Stack:** TypeScript 5.9 strict ESM, Vitest. Branch `feat/renderer-hardening-p3` off master `b083b87a` (has B1+P1+P2).

## Global Constraints

- `transpiler.ts` untouched; display path untouched; `RawDsl` store contract unchanged.
- Never-corrupt invariant: `exprText` continues to catch ALL throws and fall back to CST — item 2 adds a warning, never a rethrow.
- The 2870-snippet corpus sweep + hand corpus (fixed-point + tree-equivalence) are the regression gate for any render-expression change.
- After codegen changes: rebuild dist before VE suites.
- Commits: `SKIP_SIMPLE_GIT_HOOKS=1`; stage only named files (NEVER `git add -A`); footers `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01QBKeg1hukfnXfvCCkQnxb2`.

---

### Task 1: RawDsl-as-child guard (render-expression.ts)

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/render-expression.ts` (the `RAW_DSL_TYPE` case in `dispatch`)
- Test: `packages/codegen/test/emit/rosetta/render-expression.test.ts` (extend the RawDsl group)

**Design (approved):** The `RawDsl` case itself decides, using the existing `atRoot` flag (thread it into the case):
- `atRoot` → verbatim (unchanged — store bodies, preview roots).
- child position → verbatim ONLY if the text is a single lexical atom; otherwise wrap in parens.
- Atom test (module-const regex): identifier-ish (incl. `^`-escaped and dotted qualified names and the `___` placeholder — all match `/^[A-Za-z_^][\w.^]*$/`), OR a number (`/^\d[\w.]*$/`), OR a double-quoted string with no embedded unescaped quote. Keep it ONE small `isAtomicRawDsl(text: string)` helper with a doc comment stating intent: "conservative — when unsure, wrap; parens are grammar-legal wherever a bare expression is (P1 review argument)."
- `prec()` for RawDsl stays 8 (the `r()` machinery must not double-wrap; the case owns the decision).

- [ ] **Step 1: Failing tests**

```ts
describe('RawDsl-as-child guard', () => {
  const raw = (text: string) => ({ $type: 'RawDsl', text }) as never;
  it('root RawDsl stays verbatim', () => {
    expect(renderExpression(raw('a or b'))).toBe('a or b');
  });
  it('atomic RawDsl child stays bare (placeholder, identifier, qualified, number, string)', () => {
    expect(renderExpression(bin('LogicalOperation', 'and', raw('___'), bool(true)))).toBe('___ and True');
    expect(renderExpression(bin('LogicalOperation', 'and', raw('foo.bar'), bool(true)))).toBe('foo.bar and True');
    expect(renderExpression(bin('ArithmeticOperation', '+', raw('42'), int(1)))).toBe('42 + 1');
  });
  it('non-atomic RawDsl child gets wrapped', () => {
    expect(renderExpression(bin('LogicalOperation', 'and', raw('a or b'), bool(true)))).toBe('(a or b) and True');
    expect(renderExpression(bin('ArithmeticOperation', '+', sym('x'), raw('y count')))).toBe('x + (y count)');
  });
});
```

- [ ] **Step 2: Verify failure → Step 3: Implement** (thread `atRoot` into the RawDsl case; add `isAtomicRawDsl`). **Step 4:** render-expression tests + hand corpus + FULL corpus sweep green (RawDsl never appears in parsed corpus, so the sweep is a pure no-regression gate here); VE serialize suite (RawDsl producers live there) green after dist rebuild. **Step 5: Commit** (`fix(codegen): parenthesize non-atomic RawDsl in child position`).

---

### Task 2: exprText unexpected-throw observability (rosetta-render-core.ts)

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/rosetta-render-core.ts` (`exprText` catch block)
- Test: `packages/codegen/test/emit/rosetta/render-expr-hook.test.ts` (extend)

**Design (approved):** Keep catching everything (never-corrupt). In the catch: if the error is NOT `UnsupportedExpressionError` (import it from `./render-expression.js`), emit `console.warn('[render-core] unexpected renderExpression failure on $type "…" — falling back to CST text', err)` before falling back. `UnsupportedExpressionError` stays silent (it's the designed CST-fallback signal). Browser-safe (`console` is universal).

- [ ] **Step 1: Failing tests** — (a) a node whose case throws a TypeError (e.g. `{ $type: 'RosettaConditionalExpression', if: null, ... }` with a `$cstText`) → output falls back to the CST text AND `console.warn` was called (spy); (b) an unknown `$type` with `$cstText` → CST fallback, `console.warn` NOT called. **Step 2-4:** implement, codegen suite + type-check green, dist rebuild. **Step 5: Commit** (`feat(codegen): warn on unexpected renderExpression failures (CST fallback retained)`).

---

### Task 3: literalGuard conversion consistency (ast-to-expression-node.ts)

**Files:**
- Modify: `packages/visual-editor/src/adapters/ast-to-expression-node.ts` (`convertSwitchCase`)
- Test: `packages/visual-editor/test/expression-builder/ast-to-expression-node.test.ts` (extend or add case)

**Design (approved):** Route `literalGuard` through `convertChild` (or `convertNode`) like every other nested field, so it gains the synthetic `id` and uniform handling. Verify the DOWNSTREAM pair: `expression-node-to-dehydrated.ts` recurses generically (converted literal round-trips), and `renderSwitchCase` in render-expression dispatches the literal node — confirm the e2e switch-with-literal-guard round-trip (`color switch "x" then 1, default 0` or an int guard) still renders identically via the existing corpus/roundtrip suites. Also confirm the old raw-passthrough consumers (if any UI reads `guard.literalGuard` expecting a RAW value) — grep VE src for `literalGuard`; if a reader assumes no `id`, adapt it or report.

- [ ] **Step 1: Failing test** — converted switch case's `literalGuard` carries an `id` + preserved `$type`/`value`. **Step 2-4:** implement, full VE suite + type-check green (the e2e conformance/roundtrip tests confirm no behavior change). **Step 5: Commit** (`refactor(ve): convert SwitchCaseGuard.literalGuard uniformly (synthetic id)`).

---

## Final verification

```bash
pnpm --filter @rune-langium/codegen run build && pnpm run type-check && pnpm test
```
Then review gate → PR.
