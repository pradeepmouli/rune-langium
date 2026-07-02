# Native Structural Expression Rendering (B1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace render-core's `$cstText` expression passthrough with a structural `renderExpression(Dehydrated<RosettaExpression>)`, add a synchronous `parseExpression` core API (bare-rule parse), and rebuild the expression-builder's DSL serializer on top of the shared renderer.

**Architecture:** A new `render-expression.ts` dispatcher in codegen's rosetta emit dir mirrors `transpiler.ts`'s per-`$type` dispatch but emits Rune DSL text with grammar-faithful, side-aware precedence parenthesization. Core gains `parseExpression` via Langium 4.3's `LangiumParser.parse(text, { rule })`. The VE expression-builder's `expression-node-to-dsl.ts` becomes a thin wrapper: an adapter converts its `ExpressionNode` IR to `Dehydrated<RosettaExpression>` (+ a `RawDsl` escape leaf), then calls `renderExpression`.

**Tech Stack:** TypeScript 5.9 strict ESM, Langium 4.3, Vitest. Spec: `docs/superpowers/specs/2026-06-30-native-expression-rendering-b1-design.md`.

## Global Constraints

- Branch: `feat/native-expression-rendering-b1` (already created off master; spec committed `a12e3c5b`).
- `transpiler.ts` is untouched — no dispatch changes, no shared precedence constant (spec Non-Goals).
- The 4 mapping-qualifier types (`RosettaMapTest*`, `RosettaAttributeReference`) are NOT in the `RosettaExpression` union — out of scope; synonym mapping bodies stay on CST fallback.
- render-core call sites keep `exprText()` as a try/catch CST fallback arm — `renderExpression` throws on unknown `$type`, callers degrade to CST, never corrupt (Task-7/PR#357 lesson).
- Precedence table (grammar-verified, ONE tier for `=`/`<>`/`>=`/`<=`/`>`/`<`): then=1, or=2, and=3, eq/cmp=4, `+`/`-`=5, `*`/`/`=6, contains/disjoint/default/join=7, postfix/atoms=8, RosettaConditionalExpression=0 (always parenthesized as a child).
- Side-aware wrapping: a child is parenthesized when `prec(child) < minPrec`; binary left operand `minPrec = myPrec`, binary right operand `minPrec = myPrec + 1`, postfix argument `minPrec = 8`.
- SPDX headers: all touched files are under `packages/` = MIT (`// SPDX-License-Identifier: MIT` + `// Copyright (c) 2026 Pradeep Mouli`).
- Commits: `SKIP_SIMPLE_GIT_HOOKS=1 git commit`; stage ONLY named files (NEVER `git add -A`); footers `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` + `Claude-Session: https://claude.ai/code/session_01QBKeg1hukfnXfvCCkQnxb2`.
- After any codegen change: `pnpm --filter @rune-langium/codegen run build` (VE/studio consume dist).
- Commands: codegen tests `pnpm --filter @rune-langium/codegen test`; core tests `pnpm --filter @rune-langium/core test`; VE tests `pnpm --filter @rune-langium/visual-editor test`; single file `... test -- <path>`.
- Never hand-edit `packages/*/src/generated/**`.

## File Structure

- Create `packages/core/src/api/shared-services.ts` — lazy services singleton (extracted from `parse.ts`, shared by `parse.ts` + `parse-expression.ts`).
- Create `packages/core/src/api/parse-expression.ts` — `parseExpression` + `ExpressionParseResult`.
- Create `packages/codegen/src/emit/rosetta/render-expression.ts` — the expression dispatcher.
- Create `packages/visual-editor/src/adapters/expression-node-to-dehydrated.ts` — `ExpressionNode → DehydratedExpression | RawDsl` adapter.
- Modify `packages/core/src/api/parse.ts` (use shared singleton), `packages/core/src/index.ts` (barrel), `packages/codegen/src/emit/rosetta/rosetta-render-core.ts` (3 call sites + export `escapeString`), `packages/codegen/src/rosetta.ts` (barrel), `packages/visual-editor/src/adapters/parse-expression.ts` (gut), `packages/visual-editor/src/adapters/expression-node-to-dsl.ts` (gut).

---

### Task 1: `parseExpression` core API

**Files:**
- Create: `packages/core/src/api/shared-services.ts`
- Create: `packages/core/src/api/parse-expression.ts`
- Modify: `packages/core/src/api/parse.ts` (lines 49-56: delete local `_services`/`getServices`, import shared)
- Modify: `packages/core/src/index.ts` (barrel export, next to line 25's `parse` exports)
- Test: `packages/core/test/api/parse-expression.test.ts` (create)

**Interfaces:**
- Consumes: `createRuneDslServices` (`../services/rune-dsl-module.js`); `RuneDslParser.parse(input, options?: ParserOptions)` — the project's `services.parser.LangiumParser` override, which applies `insertImplicitBrackets` and passes `options` through.
- Produces: `parseExpression(text: string): ExpressionParseResult` and `interface ExpressionParseResult { value: RosettaExpression; lexerErrors: Array<{message: string; offset: number; line?: number; column?: number}>; parserErrors: Array<{message: string; offset?: number; line?: number; column?: number}>; hasErrors: boolean }`, both exported from `@rune-langium/core`. Also `getSharedServices()` (internal, not barrel-exported).

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/api/parse-expression.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '../../src/api/parse-expression.js';

describe('parseExpression', () => {
  it('parses a binary expression into the correct tree', () => {
    const r = parseExpression('quantity > 0 and price exists');
    expect(r.hasErrors).toBe(false);
    expect(r.value.$type).toBe('LogicalOperation');
    const op = r.value as unknown as { operator: string; left: { $type: string }; right: { $type: string } };
    expect(op.operator).toBe('and');
    expect(op.left.$type).toBe('ComparisonOperation');
    expect(op.right.$type).toBe('RosettaExistsExpression');
  });

  it('parses the as-key suffix (ExpressionWithAsKey superset)', () => {
    const r = parseExpression('reference as-key');
    expect(r.hasErrors).toBe(false);
    expect(r.value.$type).toBe('AsKeyOperation');
  });

  it('reports errors with a best-effort value still present', () => {
    const r = parseExpression('quantity > and');
    expect(r.hasErrors).toBe(true);
    expect(r.parserErrors.length).toBeGreaterThan(0);
    expect(r.value).toBeDefined();
  });

  it('never resolves cross-references (no scope for a bare snippet)', () => {
    const r = parseExpression('someSymbol -> someFeature');
    expect(r.hasErrors).toBe(false);
    const fc = r.value as unknown as { feature?: { ref?: unknown; $refText: string } };
    expect(fc.feature?.$refText).toBe('someFeature');
    expect(fc.feature?.ref).toBeUndefined();
  });

  it('flags empty input as an error', () => {
    expect(parseExpression('').hasErrors).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @rune-langium/core test -- test/api/parse-expression.test.ts`
Expected: FAIL — cannot resolve `../../src/api/parse-expression.js`.

- [ ] **Step 3: Extract the shared services singleton**

Create `packages/core/src/api/shared-services.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { createRuneDslServices } from '../services/rune-dsl-module.js';

let _services: ReturnType<typeof createRuneDslServices> | undefined;

/**
 * Lazily-initialized module-level services singleton shared by the
 * document-based `parse()`/`parseWorkspace()` APIs and the bare-rule
 * `parseExpression()` API. Long-running servers should call
 * `createRuneDslServices()` directly instead.
 */
export function getSharedServices(): ReturnType<typeof createRuneDslServices> {
  if (!_services) {
    _services = createRuneDslServices();
  }
  return _services;
}
```

In `packages/core/src/api/parse.ts`, delete lines 49-56 (the local `_services` + `getServices`) and replace with:

```ts
import { getSharedServices } from './shared-services.js';
```

then change both `getServices()` call sites (in `parse` and `parseWorkspace`) to `getSharedServices()`. Also remove the now-unused `createRuneDslServices` import if nothing else in the file uses it.

- [ ] **Step 4: Implement `parseExpression`**

Create `packages/core/src/api/parse-expression.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { RosettaExpression } from '../generated/ast.js';
import { getSharedServices } from './shared-services.js';

/**
 * Result of parsing a bare Rune DSL expression snippet.
 *
 * @remarks
 * `value` is always present — the parser performs best-effort error
 * recovery — so callers MUST check `hasErrors` before trusting the tree
 * (mirrors {@link ParseResult}'s contract).
 *
 * @category Core
 */
export interface ExpressionParseResult {
  /** The root expression node (best-effort when `hasErrors` is true). */
  value: RosettaExpression;
  /** Lexer errors encountered during tokenization. */
  lexerErrors: Array<{ message: string; offset: number; line?: number | undefined; column?: number | undefined }>;
  /** Parser errors encountered during parsing. */
  parserErrors: Array<{
    message: string;
    offset?: number | undefined;
    line?: number | undefined;
    column?: number | undefined;
  }>;
  /** Whether the parse completed without errors. */
  hasErrors: boolean;
}

/**
 * Synchronously parse a bare Rune DSL expression snippet (e.g. a Condition,
 * Operation, or ShortcutDeclaration body) into a typed `RosettaExpression`.
 *
 * @remarks
 * Parses from the grammar's `ExpressionWithAsKey` rule via Langium's
 * `LangiumParser.parse(text, { rule })` — no document, no `DocumentBuilder`,
 * no linking pass. `ExpressionWithAsKey` is a strict superset of `Expression`
 * (its trailing `as-key` is optional), so it covers all three body forms.
 * The project's `RuneDslParser` applies implicit-bracket insertion to the
 * input, exactly as it does for full documents.
 *
 * @useWhen
 * - Parsing an expression body in isolation (editor previews, round-trip tests)
 * - Validating user-typed expression text without a synthetic wrapper document
 *
 * @avoidWhen
 * - You need resolved cross-references — use `parse()`/`parseWorkspace()` with
 *   a full document instead.
 *
 * @pitfalls
 * - Cross-references are NEVER resolved: a bare snippet has no scope at all,
 *   so `ref` is always `undefined` — only `$refText` carries the name. This is
 *   stronger than `parse()`'s cross-file caveat.
 * - Error offsets refer to the implicit-bracket-transformed text, which can
 *   differ slightly from the input (same behavior as `parse()`).
 *
 * @example
 * ```ts
 * import { parseExpression } from '@rune-langium/core';
 * const r = parseExpression('quantity > 0 and price exists');
 * if (!r.hasErrors) console.log(r.value.$type); // 'LogicalOperation'
 * ```
 *
 * @category Core
 */
export function parseExpression(text: string): ExpressionParseResult {
  const { RuneDsl } = getSharedServices();
  const result = RuneDsl.parser.LangiumParser.parse<RosettaExpression>(text, { rule: 'ExpressionWithAsKey' });
  const lexerErrors = result.lexerErrors.map((e) => ({
    message: e.message,
    offset: e.offset,
    line: e.line,
    column: e.column
  }));
  const parserErrors = result.parserErrors.map((e) => ({
    message: e.message,
    offset: e.token?.startOffset,
    line: e.token?.startLine,
    column: e.token?.startColumn
  }));
  return {
    value: result.value,
    lexerErrors,
    parserErrors,
    hasErrors: lexerErrors.length > 0 || parserErrors.length > 0
  };
}
```

Note: if `parse('')` yields zero errors from Chevrotain (empty token stream edge case), guard explicitly: add `if (!text.trim()) hasErrors` handling by appending `|| text.trim().length === 0` to the `hasErrors` expression. Verify against the Step 1 empty-input test and keep whichever form makes it pass without special-casing elsewhere.

In `packages/core/src/index.ts`, add next to the existing parse exports (line ~25):

```ts
export { parseExpression } from './api/parse-expression.js';
export type { ExpressionParseResult } from './api/parse-expression.js';
```

- [ ] **Step 5: Run the new test + full core suite**

Run: `pnpm --filter @rune-langium/core test -- test/api/parse-expression.test.ts`
Expected: PASS (5/5).
Run: `pnpm --filter @rune-langium/core test && pnpm --filter @rune-langium/core run type-check`
Expected: full suite green (parse.ts refactor is behavior-preserving), type-check clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/api/shared-services.ts packages/core/src/api/parse-expression.ts packages/core/src/api/parse.ts packages/core/src/index.ts packages/core/test/api/parse-expression.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(core): parseExpression — synchronous bare-rule expression parse"
```

---

### Task 2: `renderExpression` — precedence core (binary chains, literals, references, navigation)

**Files:**
- Create: `packages/codegen/src/emit/rosetta/render-expression.ts`
- Modify: `packages/codegen/src/emit/rosetta/rosetta-render-core.ts` (line 28: add `export` to `escapeString`)
- Test: `packages/codegen/test/emit/rosetta/render-expression.test.ts` (create)

**Interfaces:**
- Consumes: `escapeString` (newly exported from `./rosetta-render-core.js`); `Dehydrated` type from `@rune-langium/core`.
- Produces: `renderExpression(expr: DehydratedExpression): string`; `type DehydratedExpression = Dehydrated<RosettaExpression> | RosettaExpression` (the renderer reads only `$type`, data fields, and `$refText` — tolerant of live AND dehydrated nodes, like `transpiler.ts`); `class UnsupportedExpressionError extends Error`; `RAW_DSL_TYPE = 'RawDsl'` leaf `{ $type: 'RawDsl'; text: string }`. Task 3 extends the SAME dispatcher switch; Tasks 4-6 import from here.

- [ ] **Step 1: Write the failing tests**

Create `packages/codegen/test/emit/rosetta/render-expression.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderExpression, UnsupportedExpressionError } from '../../../src/emit/rosetta/render-expression.js';

// Terse AST-shaped literal builders (mirror parser output shapes).
const int = (v: number) => ({ $type: 'RosettaIntLiteral', value: BigInt(v) }) as never;
const num = (v: string) => ({ $type: 'RosettaNumberLiteral', value: v }) as never;
const str = (v: string) => ({ $type: 'RosettaStringLiteral', value: v }) as never;
const bool = (v: boolean) => ({ $type: 'RosettaBooleanLiteral', value: v }) as never;
const sym = (name: string) => ({ $type: 'RosettaSymbolReference', symbol: { $refText: name }, explicitArguments: false, rawArgs: [] }) as never;
const bin = ($type: string, operator: string, left: unknown, right: unknown) => ({ $type, operator, left, right }) as never;

describe('renderExpression — literals & references', () => {
  it('renders literals', () => {
    expect(renderExpression(bool(true))).toBe('True');
    expect(renderExpression(bool(false))).toBe('False');
    expect(renderExpression(int(42))).toBe('42');
    expect(renderExpression(num('3.14'))).toBe('3.14');
    expect(renderExpression(str('a "quoted" s'))).toBe('"a \\"quoted\\" s"');
  });

  it('renders symbol references, calls, super, item, empty, lists', () => {
    expect(renderExpression(sym('quantity'))).toBe('quantity');
    expect(renderExpression({ $type: 'RosettaSymbolReference', symbol: { $refText: 'Max' }, explicitArguments: true, rawArgs: [int(1), int(2)] } as never)).toBe('Max(1, 2)');
    expect(renderExpression({ $type: 'RosettaSuperCall', name: 'super', explicitArguments: false, rawArgs: [] } as never)).toBe('super');
    expect(renderExpression({ $type: 'RosettaImplicitVariable', name: 'item' } as never)).toBe('item');
    expect(renderExpression({ $type: 'ListLiteral', elements: [] } as never)).toBe('empty');
    expect(renderExpression({ $type: 'ListLiteral', elements: [int(1), int(2)] } as never)).toBe('[1, 2]');
  });
});

describe('renderExpression — binary precedence', () => {
  it('renders a flat left-assoc chain without parens', () => {
    const chain = bin('LogicalOperation', 'or', bin('LogicalOperation', 'or', sym('a'), sym('b')), sym('c'));
    expect(renderExpression(chain)).toBe('a or b or c');
  });

  it('REGRESSION: preserves explicit right-side grouping — a or (b or c)', () => {
    const grouped = bin('LogicalOperation', 'or', sym('a'), bin('LogicalOperation', 'or', sym('b'), sym('c')));
    expect(renderExpression(grouped)).toBe('a or (b or c)');
  });

  it('wraps a looser child on either side', () => {
    const orInAnd = bin('LogicalOperation', 'and', bin('LogicalOperation', 'or', sym('a'), sym('b')), sym('c'));
    expect(renderExpression(orInAnd)).toBe('(a or b) and c');
    const addInMul = bin('ArithmeticOperation', '*', bin('ArithmeticOperation', '+', sym('a'), sym('b')), sym('c'));
    expect(renderExpression(addInMul)).toBe('(a + b) * c');
  });

  it('equality and comparison share ONE tier (grammar EqualityOperationRule)', () => {
    // (a > b) = c — left child same tier ⇒ no parens (left-assoc chain);
    // a = (b > c) — right child same tier ⇒ parens required.
    const leftChain = bin('EqualityOperation', '=', bin('ComparisonOperation', '>', sym('a'), sym('b')), sym('c'));
    expect(renderExpression(leftChain)).toBe('a > b = c');
    const rightGroup = bin('EqualityOperation', '=', sym('a'), bin('ComparisonOperation', '>', sym('b'), sym('c')));
    expect(renderExpression(rightGroup)).toBe('a = (b > c)');
  });

  it('renders cardMod and left-less (standalone) equality forms', () => {
    expect(renderExpression({ $type: 'EqualityOperation', operator: '=', cardMod: 'all', left: sym('a'), right: bool(true) } as never)).toBe('a all = True');
    expect(renderExpression({ $type: 'EqualityOperation', operator: '=', left: undefined, right: bool(true) } as never)).toBe('= True');
  });

  it('renders tier-7 set ops and join', () => {
    expect(renderExpression(bin('RosettaContainsExpression', 'contains', sym('a'), sym('b')))).toBe('a contains b');
    expect(renderExpression(bin('DefaultOperation', 'default', sym('a'), int(0)))).toBe('a default 0');
    expect(renderExpression({ $type: 'JoinOperation', operator: 'join', left: sym('a'), right: str(',') } as never)).toBe('a join ","');
    expect(renderExpression({ $type: 'JoinOperation', operator: 'join', left: sym('a'), right: undefined } as never)).toBe('a join');
  });
});

describe('renderExpression — navigation', () => {
  it('renders feature calls and deep feature calls', () => {
    const fc = { $type: 'RosettaFeatureCall', receiver: sym('trade'), feature: { $refText: 'quantity' } } as never;
    expect(renderExpression(fc)).toBe('trade -> quantity');
    const deep = { $type: 'RosettaDeepFeatureCall', receiver: fc, feature: { $refText: 'amount' } } as never;
    expect(renderExpression(deep)).toBe('trade -> quantity ->> amount');
  });

  it('parenthesizes a binary receiver of a postfix chain', () => {
    const fc = { $type: 'RosettaFeatureCall', receiver: bin('LogicalOperation', 'or', sym('a'), sym('b')), feature: { $refText: 'x' } } as never;
    expect(renderExpression(fc)).toBe('(a or b) -> x');
  });
});

describe('renderExpression — RawDsl leaf and unknown types', () => {
  it('renders a RawDsl leaf verbatim', () => {
    expect(renderExpression({ $type: 'RawDsl', text: '___' } as never)).toBe('___');
  });
  it('throws UnsupportedExpressionError on unknown $type', () => {
    expect(() => renderExpression({ $type: 'SomethingNew' } as never)).toThrow(UnsupportedExpressionError);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rune-langium/codegen test -- render-expression`
Expected: FAIL — module not found.

- [ ] **Step 3: Export `escapeString` + implement the dispatcher core**

In `rosetta-render-core.ts` line 28, change `function escapeString` to `export function escapeString`.

Create `packages/codegen/src/emit/rosetta/render-expression.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * render-expression — structural Rune DSL renderer for `RosettaExpression`
 * trees (B1). Mirrors transpiler.ts's per-$type dispatch but emits DSL text.
 *
 * Input tolerance: reads only `$type`, data fields, and `$refText` on refs —
 * works identically on live parser output and `Dehydrated<T>` nodes.
 *
 * Precedence (grammar-verified; `=`/`<>` and comparisons share ONE tier):
 *   0 conditional (always parenthesized as a child)
 *   1 then · 2 or · 3 and · 4 = <> >= <= > < · 5 + - · 6 * /
 *   7 contains disjoint default join · 8 postfix/atoms
 *
 * Side-aware wrapping: child wraps when prec(child) < minPrec.
 *   binary left minPrec = myPrec; binary right minPrec = myPrec + 1;
 *   postfix argument minPrec = 8.
 * This preserves explicit right-side grouping (`a or (b or c)`), which a
 * single `<` comparison silently drops.
 */

import type { Dehydrated, RosettaExpression } from '@rune-langium/core';
import { escapeString } from './rosetta-render-core.js';

export type DehydratedExpression = Dehydrated<RosettaExpression> | RosettaExpression;

/** Generic verbatim escape-hatch leaf (pre-rendered DSL fragment). */
export const RAW_DSL_TYPE = 'RawDsl';
export interface RawDslLeaf { $type: 'RawDsl'; text: string }

/** Thrown on an unknown `$type` so callers can fall back to CST text. */
export class UnsupportedExpressionError extends Error {
  constructor(public readonly nodeType: string) {
    super(`renderExpression: unsupported expression $type '${nodeType}'`);
  }
}

type AnyNode = Record<string, unknown> & { $type: string };
const refText = (r: unknown): string => ((r as { $refText?: string } | undefined)?.$refText ?? '');

const PREC_CONDITIONAL = 0;
const PREC_POSTFIX = 8;

function prec(node: AnyNode): number {
  switch (node.$type) {
    case 'RosettaConditionalExpression': return PREC_CONDITIONAL;
    case 'ThenOperation': return 1;
    case 'LogicalOperation': return node['operator'] === 'or' ? 2 : 3;
    case 'EqualityOperation':
    case 'ComparisonOperation': return 4;
    case 'ArithmeticOperation': return node['operator'] === '*' || node['operator'] === '/' ? 6 : 5;
    case 'RosettaContainsExpression':
    case 'RosettaDisjointExpression':
    case 'DefaultOperation':
    case 'JoinOperation': return 7;
    default: return PREC_POSTFIX;
  }
}

/** Render `child`, parenthesizing when its precedence is below `minPrec`. */
function r(child: unknown, minPrec: number): string {
  const node = child as AnyNode;
  const text = dispatch(node);
  return prec(node) < minPrec ? `(${text})` : text;
}

/** Render an expression tree to Rune DSL text. */
export function renderExpression(expr: DehydratedExpression): string {
  return dispatch(expr as unknown as AnyNode);
}

function dispatch(node: AnyNode): string {
  const p = prec(node);
  switch (node.$type) {
    // --- escape hatch ---
    case RAW_DSL_TYPE:
      return String(node['text'] ?? '');

    // --- literals ---
    case 'RosettaBooleanLiteral': return node['value'] ? 'True' : 'False';
    case 'RosettaIntLiteral': return String(node['value']);
    case 'RosettaNumberLiteral': return String(node['value']);
    case 'RosettaStringLiteral': return `"${escapeString(String(node['value'] ?? ''))}"`;

    // --- references / atoms ---
    case 'RosettaSymbolReference':
    case 'RosettaSuperCall': {
      const head = node.$type === 'RosettaSuperCall' ? 'super' : refText(node['symbol']);
      const rawArgs = (node['rawArgs'] as unknown[] | undefined) ?? [];
      if (node['explicitArguments']) return `${head}(${rawArgs.map((a) => r(a, 1)).join(', ')})`;
      return head;
    }
    case 'RosettaImplicitVariable': return 'item';
    case 'ListLiteral': {
      const elements = (node['elements'] as unknown[] | undefined) ?? [];
      // Grammar: `empty` and `[...]` both infer ListLiteral; an empty list IS `empty`.
      if (elements.length === 0) return 'empty';
      return `[${elements.map((e) => r(e, 1)).join(', ')}]`;
    }

    // --- binary chains (left minPrec = p, right minPrec = p + 1) ---
    case 'ArithmeticOperation':
    case 'LogicalOperation':
      return `${r(node['left'], p)} ${node['operator']} ${r(node['right'], p + 1)}`;
    case 'EqualityOperation':
    case 'ComparisonOperation': {
      const cardMod = node['cardMod'] ? `${node['cardMod']} ` : '';
      const rhs = `${cardMod}${node['operator']} ${r(node['right'], p + 1)}`;
      return node['left'] ? `${r(node['left'], p)} ${rhs}` : rhs;
    }
    case 'RosettaContainsExpression':
    case 'RosettaDisjointExpression':
    case 'DefaultOperation': {
      const rhs = `${node['operator']} ${r(node['right'], p + 1)}`;
      return node['left'] ? `${r(node['left'], p)} ${rhs}` : rhs;
    }
    case 'JoinOperation': {
      const left = node['left'] ? `${r(node['left'], p)} ` : '';
      const right = node['right'] ? ` ${r(node['right'], p + 1)}` : '';
      return `${left}join${right}`;
    }

    // --- navigation (postfix tier) ---
    case 'RosettaFeatureCall':
      return `${r(node['receiver'], PREC_POSTFIX)} -> ${refText(node['feature'])}`;
    case 'RosettaDeepFeatureCall':
      return `${r(node['receiver'], PREC_POSTFIX)} ->> ${refText(node['feature'])}`;

    default:
      return dispatchExtended(node, p);
  }
}

// Task 3 fills this with postfix/functional/control-flow/constructor cases.
function dispatchExtended(node: AnyNode, _p: number): string {
  throw new UnsupportedExpressionError(node.$type);
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @rune-langium/codegen test -- render-expression`
Expected: PASS (all Task-2 groups). `pnpm --filter @rune-langium/codegen run type-check` — clean.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/rosetta/render-expression.ts packages/codegen/src/emit/rosetta/rosetta-render-core.ts packages/codegen/test/emit/rosetta/render-expression.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen): renderExpression precedence core (binary chains, literals, refs, navigation)"
```

---

### Task 3: `renderExpression` — postfix, functional, control-flow, constructor cases

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/render-expression.ts` (replace `dispatchExtended`)
- Test: `packages/codegen/test/emit/rosetta/render-expression.test.ts` (extend)

**Interfaces:**
- Consumes: Task 2's `dispatch`/`r`/`prec`/`refText`/`escapeString` internals (same file).
- Produces: complete coverage of the remaining `RosettaExpression` union members. Grammar-verified render rules (field names from `packages/core/src/generated/ast.ts`):
  - Simple postfix (`argument?`, `operator`): `RosettaOnlyElement` (`only-element`), `RosettaCountOperation`, `FlattenOperation`, `DistinctOperation`, `ReverseOperation`, `FirstOperation`, `LastOperation`, `SumOperation`, `OneOfOperation`, `ToStringOperation`, `ToNumberOperation`, `ToIntOperation`, `ToTimeOperation`, `ToDateOperation`, `ToDateTimeOperation`, `ToZonedDateTimeOperation` → `${arg }operator`.
  - `RosettaExistsExpression` (`modifier?`) → `${arg }${modifier }exists`; `RosettaAbsentExpression` → `${arg }is absent`; `RosettaOnlyExistsExpression` (`args[]` XOR `argument?`) → `(${args}) only exists` | `${arg} only exists`.
  - `ToEnumOperation` → `${arg }to-enum ${refText(enumeration)}`.
  - Functional (`function?: InlineFunction`): `FilterOperation` (`filter`), `MapOperation` (`extract`), `ReduceOperation`, `SortOperation`, `MinOperation`, `MaxOperation` → `${arg }op ${params }[body]` — **parameters go BEFORE the bracket** (grammar `(params)? '[' body ']'`; fixes existing serializer bug).
  - `ThenOperation` → `${arg} then ${body}` with the function body rendered BARE (grammar `ImplicitInlineFunction: body=OrOperation` — bracketing it would parse as a ListLiteral; fixes existing serializer bug).
  - `ChoiceOperation` (`necessity`, `attributes[]`) → `${arg }${necessity} choice ${attrs.join(', ')}`.
  - `SwitchOperation` (`cases[]`) → `${arg }switch ${cases.join(', ')}` with `SwitchCaseOrDefault` → `default ${expr}` | `${guard} then ${expr}` (guard = `referenceGuard.$refText` | rendered `literalGuard`).
  - `WithMetaOperation` (`entries[]`) → `${arg} with-meta { k: v, ... }` | `${arg} with-meta` (fixes existing dropped-entries bug).
  - `AsKeyOperation` → `${arg} as-key`.
  - `RosettaConditionalExpression` (`if?`, `ifthen?`, `full`, `elsethen?`) → `if C then T[ else E]`; branch children `minPrec = 2` (grammar branches are `OrOperation`).
  - `RosettaConstructorExpression` (`typeRef`, `constructorTypeArgs[]`, `values[]`, `implicitEmpty`) → `Type[(p: v, …)] { k: v[, ...] }`.

- [ ] **Step 1: Extend the test file (failing)**

Append to `render-expression.test.ts`:

```ts
describe('renderExpression — postfix & functional', () => {
  const sym2 = sym; // alias for readability below
  it('renders simple postfix chains', () => {
    expect(renderExpression({ $type: 'RosettaCountOperation', operator: 'count', argument: sym2('items') } as never)).toBe('items count');
    expect(renderExpression({ $type: 'RosettaOnlyElement', operator: 'only-element', argument: sym2('items') } as never)).toBe('items only-element');
    expect(renderExpression({ $type: 'SumOperation', operator: 'sum', argument: undefined } as never)).toBe('sum');
  });

  it('renders exists/absent/only-exists forms', () => {
    expect(renderExpression({ $type: 'RosettaExistsExpression', operator: 'exists', argument: sym2('a'), modifier: 'single' } as never)).toBe('a single exists');
    expect(renderExpression({ $type: 'RosettaAbsentExpression', operator: 'absent', argument: sym2('a') } as never)).toBe('a is absent');
    expect(renderExpression({ $type: 'RosettaOnlyExistsExpression', operator: 'exists', argument: sym2('a'), args: [] } as never)).toBe('a only exists');
    expect(renderExpression({ $type: 'RosettaOnlyExistsExpression', args: [sym2('a'), sym2('b')], argument: undefined } as never)).toBe('(a, b) only exists');
  });

  it('parenthesizes a binary argument of a postfix op', () => {
    expect(renderExpression({ $type: 'RosettaExistsExpression', operator: 'exists', argument: bin('LogicalOperation', 'or', sym2('a'), sym2('b')) } as never)).toBe('(a or b) exists');
  });

  it('renders to-enum with its enumeration ref', () => {
    expect(renderExpression({ $type: 'ToEnumOperation', operator: 'to-enum', argument: sym2('code'), enumeration: { $refText: 'ns.Color' } } as never)).toBe('code to-enum ns.Color');
  });

  it('renders functional ops with params BEFORE the bracket (grammar fix)', () => {
    const fn = { body: bin('ArithmeticOperation', '+', sym2('a'), sym2('b')), parameters: [{ name: 'a' }, { name: 'b' }] };
    expect(renderExpression({ $type: 'ReduceOperation', operator: 'reduce', argument: sym2('items'), function: fn } as never)).toBe('items reduce a, b [a + b]');
    const noParams = { body: bin('ComparisonOperation', '>', { $type: 'RosettaImplicitVariable', name: 'item' }, int(0)), parameters: [] };
    expect(renderExpression({ $type: 'FilterOperation', operator: 'filter', argument: sym2('items'), function: noParams } as never)).toBe('items filter [item > 0]');
  });

  it('renders then with a BARE body (no brackets — grammar fix)', () => {
    const fn = { body: { $type: 'FilterOperation', operator: 'filter', argument: undefined, function: { body: bool(true), parameters: [] } }, parameters: [] };
    expect(renderExpression({ $type: 'ThenOperation', operator: 'then', argument: sym2('items'), function: fn } as never)).toBe('items then filter [True]');
  });

  it('renders choice / switch / with-meta / as-key', () => {
    expect(renderExpression({ $type: 'ChoiceOperation', operator: 'choice', necessity: 'optional', argument: undefined, attributes: [{ $refText: 'a' }, { $refText: 'b' }] } as never)).toBe('optional choice a, b');
    const cases = [
      { $type: 'SwitchCaseOrDefault', guard: { $type: 'SwitchCaseGuard', referenceGuard: { $refText: 'Red' } }, expression: int(1) },
      { $type: 'SwitchCaseOrDefault', guard: undefined, expression: int(0) }
    ];
    expect(renderExpression({ $type: 'SwitchOperation', operator: 'switch', argument: sym2('color'), cases } as never)).toBe('color switch Red then 1, default 0');
    expect(renderExpression({ $type: 'WithMetaOperation', operator: 'with-meta', argument: sym2('a'), entries: [{ key: { $refText: 'scheme' }, value: str('x') }] } as never)).toBe('a with-meta { scheme: "x" }');
    expect(renderExpression({ $type: 'WithMetaOperation', operator: 'with-meta', argument: sym2('a'), entries: [] } as never)).toBe('a with-meta');
    expect(renderExpression({ $type: 'AsKeyOperation', operator: 'as-key', argument: sym2('ref') } as never)).toBe('ref as-key');
  });

  it('renders conditionals, always parenthesized as a child', () => {
    const cond = { $type: 'RosettaConditionalExpression', if: sym2('flag'), ifthen: int(1), full: true, elsethen: int(0) } as never;
    expect(renderExpression(cond)).toBe('if flag then 1 else 0');
    expect(renderExpression(bin('ArithmeticOperation', '+', sym2('x'), cond))).toBe('x + (if flag then 1 else 0)');
  });

  it('renders constructors', () => {
    const typeRef = sym2('Trade');
    expect(renderExpression({ $type: 'RosettaConstructorExpression', typeRef, constructorTypeArgs: [], implicitEmpty: false, values: [{ key: { $refText: 'quantity' }, value: int(1) }] } as never)).toBe('Trade { quantity: 1 }');
    expect(renderExpression({ $type: 'RosettaConstructorExpression', typeRef: sym2('Trade'), constructorTypeArgs: [], implicitEmpty: true, values: [{ key: { $refText: 'q' }, value: int(1) }] } as never)).toBe('Trade { q: 1, ... }');
    expect(renderExpression({ $type: 'RosettaConstructorExpression', typeRef: sym2('Trade'), constructorTypeArgs: [{ parameter: { $refText: 'T' }, value: int(5) }], implicitEmpty: false, values: [] } as never)).toBe('Trade(T: 5) { ... }');
  });
});
```

Note the last constructor case: grammar requires braces and `values`-or-`implicitEmpty`-or-nothing; an empty `values` with `implicitEmpty: false` renders `Trade(T: 5) {}` — adjust the final assertion to whichever of `{ ... }`/`{}` matches your implementation choice, but pick ONE and encode it: use `{}` only when BOTH `values` is empty AND `implicitEmpty` is false; render `{ ... }` when `implicitEmpty` is true regardless. Update the test literal accordingly before running.

- [ ] **Step 2: Run to verify the new group fails**

Run: `pnpm --filter @rune-langium/codegen test -- render-expression`
Expected: Task-2 groups PASS; new group FAILS with `UnsupportedExpressionError`.

- [ ] **Step 3: Replace `dispatchExtended`**

```ts
const SIMPLE_POSTFIX = new Set([
  'RosettaOnlyElement', 'RosettaCountOperation', 'FlattenOperation', 'DistinctOperation',
  'ReverseOperation', 'FirstOperation', 'LastOperation', 'SumOperation', 'OneOfOperation',
  'ToStringOperation', 'ToNumberOperation', 'ToIntOperation', 'ToTimeOperation',
  'ToDateOperation', 'ToDateTimeOperation', 'ToZonedDateTimeOperation'
]);

const FUNCTIONAL_OPS = new Set([
  'FilterOperation', 'MapOperation', 'ReduceOperation', 'SortOperation', 'MinOperation', 'MaxOperation'
]);

/** `arg ` prefix for postfix operators (empty when the op is argument-less). */
function argPrefix(node: AnyNode): string {
  return node['argument'] ? `${r(node['argument'], PREC_POSTFIX)} ` : '';
}

/** Grammar: `(params (',' params)*)? '[' body ']'` — params BEFORE the bracket. */
function renderInlineFunction(fn: { body: unknown; parameters?: Array<{ name: string }> }): string {
  const params = (fn.parameters ?? []).map((p) => p.name);
  const prefix = params.length > 0 ? `${params.join(', ')} ` : '';
  return `${prefix}[${r(fn.body, 1)}]`;
}

function renderSwitchCase(c: AnyNode): string {
  const expr = r(c['expression'], 1);
  const guard = c['guard'] as AnyNode | undefined;
  if (!guard) return `default ${expr}`;
  const guardText = guard['referenceGuard']
    ? refText(guard['referenceGuard'])
    : dispatch(guard['literalGuard'] as AnyNode);
  return `${guardText} then ${expr}`;
}

function dispatchExtended(node: AnyNode, _p: number): string {
  const $type = node.$type;

  if (SIMPLE_POSTFIX.has($type)) return `${argPrefix(node)}${node['operator']}`;

  if (FUNCTIONAL_OPS.has($type)) {
    const fn = node['function'] as { body: unknown; parameters?: Array<{ name: string }> } | undefined;
    return `${argPrefix(node)}${node['operator']}${fn ? ` ${renderInlineFunction(fn)}` : ''}`;
  }

  switch ($type) {
    case 'RosettaExistsExpression': {
      const modifier = node['modifier'] ? `${node['modifier']} ` : '';
      return `${argPrefix(node)}${modifier}exists`;
    }
    case 'RosettaAbsentExpression':
      return `${argPrefix(node)}is absent`;
    case 'RosettaOnlyExistsExpression': {
      const args = (node['args'] as unknown[] | undefined) ?? [];
      if (args.length > 0) return `(${args.map((a) => r(a, 1)).join(', ')}) only exists`;
      return `${argPrefix(node)}only exists`;
    }
    case 'ToEnumOperation':
      return `${argPrefix(node)}to-enum ${refText(node['enumeration'])}`;
    case 'ThenOperation': {
      // Grammar: function=ImplicitInlineFunction (body=OrOperation) — render BARE.
      const fn = node['function'] as { body: unknown } | undefined;
      const body = fn ? ` ${r(fn.body, 2)}` : '';
      return `${r(node['argument'], 1)} then${body}`;
    }
    case 'ChoiceOperation': {
      const attrs = ((node['attributes'] as unknown[] | undefined) ?? []).map(refText).join(', ');
      return `${argPrefix(node)}${node['necessity']} choice ${attrs}`;
    }
    case 'SwitchOperation': {
      const cases = ((node['cases'] as AnyNode[] | undefined) ?? []).map(renderSwitchCase).join(', ');
      return `${argPrefix(node)}switch ${cases}`;
    }
    case 'WithMetaOperation': {
      const entries = ((node['entries'] as AnyNode[] | undefined) ?? [])
        .map((e) => `${refText(e['key'])}: ${r(e['value'], 1)}`).join(', ');
      const suffix = entries ? ` { ${entries} }` : '';
      return `${r(node['argument'], PREC_POSTFIX)} with-meta${suffix}`;
    }
    case 'AsKeyOperation':
      return `${r(node['argument'], 1)} as-key`;
    case 'RosettaConditionalExpression': {
      // Grammar branches are OrOperation — a then/conditional child needs parens.
      const head = `if ${r(node['if'], 2)} then ${r(node['ifthen'], 2)}`;
      return node['full'] ? `${head} else ${r(node['elsethen'], 2)}` : head;
    }
    case 'RosettaConstructorExpression': {
      const typeName = dispatch(node['typeRef'] as AnyNode);
      const typeArgs = ((node['constructorTypeArgs'] as AnyNode[] | undefined) ?? [])
        .map((a) => `${refText(a['parameter'])}: ${r(a['value'], 1)}`).join(', ');
      const argsPart = typeArgs ? `(${typeArgs})` : '';
      const pairs = ((node['values'] as AnyNode[] | undefined) ?? [])
        .map((v) => `${refText(v['key'])}: ${r(v['value'], 1)}`);
      if (node['implicitEmpty']) pairs.push('...');
      const body = pairs.length > 0 ? `{ ${pairs.join(', ')} }` : '{}';
      return `${typeName}${argsPart} ${body}`;
    }
    default:
      throw new UnsupportedExpressionError($type);
  }
}
```

- [ ] **Step 4: Run all render-expression tests + type-check**

Run: `pnpm --filter @rune-langium/codegen test -- render-expression && pnpm --filter @rune-langium/codegen run type-check`
Expected: all PASS, type-check clean.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/rosetta/render-expression.ts packages/codegen/test/emit/rosetta/render-expression.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen): renderExpression full dispatch (postfix, functional, control flow, constructors)"
```

---

### Task 4: Wire into render-core + round-trip suite

**Files:**
- Modify: `packages/codegen/src/emit/rosetta/rosetta-render-core.ts` (the `exprText` helper block ~line 54-57 and its 3 call sites ~lines 209/219/306)
- Modify: `packages/codegen/src/rosetta.ts` (barrel)
- Test: `packages/codegen/test/emit/rosetta/expression-roundtrip.test.ts` (create)
- Test (regression): `packages/codegen/test/emit/rosetta/render-function.test.ts`, `render-annotations-synonyms.test.ts` and the VE serialize suite must stay green.

**Interfaces:**
- Consumes: `renderExpression`/`UnsupportedExpressionError` (Task 2/3), `parseExpression` from `@rune-langium/core` (Task 1).
- Produces: render-core's 3 body renders route structural-first with CST fallback; `renderExpression`, `DehydratedExpression`, `UnsupportedExpressionError`, `RawDslLeaf` exported from `@rune-langium/codegen/rosetta`.

- [ ] **Step 1: Write the failing round-trip test**

Create `packages/codegen/test/emit/rosetta/expression-roundtrip.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderExpression } from '../../../src/emit/rosetta/render-expression.js';

// parse → render → reparse (no errors) → re-render (byte-identical fixed point).
const CORPUS = [
  'quantity > 0',
  'quantity > 0 and price exists',
  'a or (b or c)',
  '(a + b) * c',
  'a all = True',
  'trade -> quantity ->> amount',
  '(a or b) exists',
  'items count',
  'observable single exists',
  'settlement is absent',
  '(a, b) only exists',
  'code to-enum Color',
  'items filter [item > 0]',
  'items reduce a, b [a + b]',
  'items then filter [item > 0] then only-element',
  'if flag then 1 else 0',
  'x + (if flag then 1 else 0)',
  'color switch Red then 1, default 0',
  'optional choice dateAdjustments, dateAdjustmentsReference',
  'Trade { quantity: 1, price: 2.5 }',
  'Trade { quantity: 1, ... }',
  '[1, 2, 3]',
  'empty',
  'a default 0',
  'a join ","',
  'reference as-key',
  'value with-meta { scheme: "urn:x" }',
  'Max(a, b)',
  'item to-string'
];

describe('expression round-trip (parse → render → reparse → fixed point)', () => {
  for (const src of CORPUS) {
    it(`round-trips: ${src}`, () => {
      const p1 = parseExpression(src);
      expect(p1.hasErrors, `original must parse: ${src}`).toBe(false);
      const r1 = renderExpression(p1.value);
      const p2 = parseExpression(r1);
      expect(p2.hasErrors, `rendered must reparse: ${r1}`).toBe(false);
      const r2 = renderExpression(p2.value);
      expect(r2, 'render must be a fixed point').toBe(r1);
    });
  }
});
```

- [ ] **Step 2: Run to see which corpus entries fail**

Run: `pnpm --filter @rune-langium/codegen test -- expression-roundtrip`
Expected: mostly PASS from Tasks 2-3; any failure here is a real dispatch/precedence bug — fix `render-expression.ts` until the whole corpus is green. Do NOT weaken the fixed-point assertion.

- [ ] **Step 3: Swap render-core's 3 call sites (structural-first, CST fallback)**

In `rosetta-render-core.ts`, replace the `exprText` helper block (~lines 54-57) with:

```ts
import { renderExpression } from './render-expression.js';
// (import goes at the top of the file with the other imports)

/**
 * Render an expression body: structural renderExpression first; on an
 * unknown node type (future grammar additions) fall back to the CST text.
 * Fallback-not-corrupt is the render-core invariant (see PR #357 lesson:
 * a removed CST fallback corrupted non-value synonym bodies).
 */
function exprText(expr: unknown): string {
  if (expr == null) return '';
  try {
    return renderExpression(expr as never);
  } catch {
    const e = expr as { $cstText?: string; $cstNode?: { text?: string } };
    return (e.$cstText ?? e.$cstNode?.text ?? '').trim();
  }
}
```

The 3 call sites (`renderOperation` ~209, `renderShortcut` ~219, `renderCondition` ~306) keep calling `exprText` — no change needed at the call sites themselves.

In `packages/codegen/src/rosetta.ts`, add:

```ts
export { renderExpression, UnsupportedExpressionError, RAW_DSL_TYPE } from './emit/rosetta/render-expression.js';
export type { DehydratedExpression, RawDslLeaf } from './emit/rosetta/render-expression.js';
```

- [ ] **Step 4: Rebuild dist + run codegen AND VE suites**

```bash
pnpm --filter @rune-langium/codegen run build
pnpm --filter @rune-langium/codegen test
pnpm --filter @rune-langium/visual-editor test -- test/serialize
```
Expected: all green. The VE serialize suite (`editable-roundtrip.test.ts` etc.) exercises the real Condition/Operation bodies through the new structural path — a failure here means a rendering divergence from CST text on real fixtures; fix render-expression, don't skip.

Watch specifically for whitespace divergence: dirty-node re-render previously emitted the verbatim CST text; now it emits normalized structural text. Tests asserting byte-identical round-trips on UNEDITED nodes are unaffected (CST reuse path), but tests asserting an EDITED node's body text may need their expectation updated from raw-CST spacing to structural spacing — verify each such change is a pure-whitespace/formatting delta before accepting it.

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/emit/rosetta/rosetta-render-core.ts packages/codegen/src/rosetta.ts packages/codegen/test/emit/rosetta/expression-roundtrip.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(codegen): route render-core expression bodies through renderExpression (CST fallback retained)"
```

---

### Task 5: Core-backed `parseExpression` in the visual editor

**Files:**
- Modify: `packages/visual-editor/src/adapters/parse-expression.ts` (gut)
- Test: `packages/visual-editor/test/expression-builder/parse-expression.test.ts` (locate the existing test file with `ls packages/visual-editor/test | rg -r parse` if the path differs; update it)

**Interfaces:**
- Consumes: `parseExpression as parseExpressionCore` from `@rune-langium/core` (Task 1); existing `astToExpressionNode` (`./ast-to-expression-node.js`, unchanged — its `resolveRef` already accepts live `Reference` objects via `$refText`).
- Produces: `parseExpression(value: string): ExpressionNode` — same name/signature as today, now returning real trees for raw DSL text instead of `Unsupported`. `parseExpressionAsync` DELETED (verified dead code — zero callers).

- [ ] **Step 1: Write/extend the failing test**

Add to the parse-expression test file:

```ts
it('parses raw DSL text into a real tree (no longer Unsupported)', () => {
  const node = parseExpression('quantity > 0 and price exists');
  expect(node.$type).toBe('LogicalOperation');
});

it('returns Unsupported for unparseable text', () => {
  const node = parseExpression('quantity > and');
  expect(node.$type).toBe('Unsupported');
});
```

Keep the existing empty-string→Placeholder and JSON-AST cases unchanged. Delete any tests exercising `parseExpressionAsync`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rune-langium/visual-editor test -- parse-expression`
Expected: the raw-DSL test FAILS (`Unsupported` today).

- [ ] **Step 3: Gut the adapter**

Replace `packages/visual-editor/src/adapters/parse-expression.ts` body (keep the SPDX header) with:

```ts
/**
 * parse-expression — Parse DSL text or serialized AST into ExpressionNode.
 *
 * Backed by core's synchronous `parseExpression` (bare `ExpressionWithAsKey`
 * rule parse — no wrapper document, no linking; refs carry `$refText` only,
 * which `astToExpressionNode` already consumes).
 */

import { parseExpression as parseExpressionCore } from '@rune-langium/core';
import type { ExpressionNode } from '../schemas/expression-node-schema.js';
import { astToExpressionNode } from './ast-to-expression-node.js';

export function parseExpression(value: string): ExpressionNode {
  if (!value) {
    return { $type: 'Placeholder', id: 'root-placeholder' } as unknown as ExpressionNode;
  }

  // JSON-serialized AST (from a previous round-trip) — convert directly.
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && '$type' in parsed) {
      return astToExpressionNode(parsed, value);
    }
  } catch {
    // Not JSON — fall through to DSL parsing.
  }

  const { value: ast, hasErrors } = parseExpressionCore(value);
  if (hasErrors) {
    return { $type: 'Unsupported', id: 'parse-error', rawText: value } as unknown as ExpressionNode;
  }
  return astToExpressionNode(ast, value);
}
```

`parseExpressionAsync` is deleted entirely.

- [ ] **Step 4: Run VE tests + type-check + bundle check**

```bash
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/studio run type-check
pnpm --filter @rune-langium/studio run build 2>&1 | tail -20
```
Expected: green. The studio build's chunk-size output is the check for parser-bundling regressions: the previous code dynamic-imported core specifically to keep the Langium parser out of the main chunk. If the main chunk balloons (≫ hundreds of KB growth), STOP and report — the fix would be lazy singleton init inside core (already the case — services init on first call, but module weight is the concern) or a dynamic-import wrapper; do not silently accept a large regression.

- [ ] **Step 5: Commit**

```bash
git add packages/visual-editor/src/adapters/parse-expression.ts packages/visual-editor/test
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): back parseExpression with core bare-rule parse; drop dead parseExpressionAsync"
```

(Adjust the `git add` test path to the actual test file(s) touched — stage only them, never `git add -A`.)

---

### Task 6: `expressionNodeToDehydrated` adapter + gut `expression-node-to-dsl.ts`

**Files:**
- Create: `packages/visual-editor/src/adapters/expression-node-to-dehydrated.ts`
- Modify: `packages/visual-editor/src/adapters/expression-node-to-dsl.ts` (gut to thin wrappers)
- Test: `packages/visual-editor/test/expression-builder/expression-node-to-dsl.test.ts` (fix wrong-behavior expectations), `packages/visual-editor/test/expression-builder/expression-node-to-dehydrated.test.ts` (create)

**Interfaces:**
- Consumes: `renderExpression`, `RAW_DSL_TYPE` from `@rune-langium/codegen/rosetta` (Task 4's barrel); `ExpressionNode` type.
- Produces: `expressionNodeToDehydrated(node: ExpressionNode, opts: { allowPlaceholders: boolean }): unknown` (returns a renderExpression-ready tree); `expressionNodeToDsl`/`expressionNodeToDslPreview` keep their exact existing signatures and error behavior (throw on `Placeholder` in the non-preview variant).

- [ ] **Step 1: Write the failing adapter tests**

Create `expression-node-to-dehydrated.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { expressionNodeToDehydrated } from '../../src/adapters/expression-node-to-dehydrated.js';
import { renderExpression } from '@rune-langium/codegen/rosetta';

const id = 'test-id';

describe('expressionNodeToDehydrated', () => {
  it('re-wraps string refs as {$refText} (inverse of astToExpressionNode)', () => {
    const node = { $type: 'RosettaSymbolReference', id, symbol: 'quantity' } as never;
    const out = expressionNodeToDehydrated(node, { allowPlaceholders: false }) as { symbol: { $refText: string } };
    expect(out.symbol.$refText).toBe('quantity');
    expect(renderExpression(out as never)).toBe('quantity');
  });

  it('converts Placeholder to a RawDsl marker leaf in preview mode', () => {
    const node = { $type: 'LogicalOperation', id, operator: 'and', left: { $type: 'Placeholder', id }, right: { $type: 'RosettaBooleanLiteral', id, value: true } } as never;
    const out = expressionNodeToDehydrated(node, { allowPlaceholders: true });
    expect(renderExpression(out as never)).toBe('___ and True');
  });

  it('throws on Placeholder when placeholders are not allowed', () => {
    const node = { $type: 'Placeholder', id } as never;
    expect(() => expressionNodeToDehydrated(node, { allowPlaceholders: false })).toThrow(/placeholder/i);
  });

  it('converts Unsupported to a verbatim RawDsl leaf', () => {
    const node = { $type: 'Unsupported', id, rawText: 'some -> legacy -> expr' } as never;
    const out = expressionNodeToDehydrated(node, { allowPlaceholders: false });
    expect(renderExpression(out as never)).toBe('some -> legacy -> expr');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @rune-langium/visual-editor test -- expression-node-to-dehydrated`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

Create `packages/visual-editor/src/adapters/expression-node-to-dehydrated.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * expression-node-to-dehydrated — Convert the expression builder's
 * ExpressionNode IR to a renderExpression-ready tree.
 *
 * Inverse of ast-to-expression-node: string refs become `{$refText}`; the
 * synthetic `id` is dropped (renderExpression ignores extra fields, so ids
 * are simply not copied); the two UI-only variants map to the RawDsl leaf:
 *   Placeholder  → { $type: 'RawDsl', text: '___' } (preview only — throws otherwise)
 *   Unsupported  → { $type: 'RawDsl', text: rawText }
 */

import { RAW_DSL_TYPE } from '@rune-langium/codegen/rosetta';
import type { ExpressionNode } from '../schemas/expression-node-schema.js';

const PLACEHOLDER_MARKER = '___';

/** Fields that hold a string ref in ExpressionNode but {$refText} in the AST. */
const REF_FIELDS = new Set(['symbol', 'feature', 'enumeration', 'key', 'referenceGuard']);
/** Array fields whose ELEMENTS are string refs. */
const REF_ARRAY_FIELDS = new Set(['attributes']);
/** UI-only fields to drop. */
const DROP_FIELDS = new Set(['id']);

export interface ToDehydratedOptions { allowPlaceholders: boolean }

export function expressionNodeToDehydrated(node: ExpressionNode, opts: ToDehydratedOptions): unknown {
  return convert(node as unknown as Record<string, unknown>, opts);
}

function convert(value: unknown, opts: ToDehydratedOptions): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => convert(v, opts));

  const obj = value as Record<string, unknown>;
  const $type = obj['$type'] as string | undefined;

  if ($type === 'Placeholder') {
    if (!opts.allowPlaceholders) throw new Error('Cannot serialize expression containing placeholders');
    return { $type: RAW_DSL_TYPE, text: PLACEHOLDER_MARKER };
  }
  if ($type === 'Unsupported') {
    return { $type: RAW_DSL_TYPE, text: String(obj['rawText'] ?? '') };
  }

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(obj)) {
    if (DROP_FIELDS.has(key)) continue;
    if (REF_FIELDS.has(key) && typeof v === 'string') {
      out[key] = { $refText: v };
    } else if (REF_ARRAY_FIELDS.has(key) && Array.isArray(v)) {
      out[key] = v.map((item) => (typeof item === 'string' ? { $refText: item } : convert(item, opts)));
    } else {
      out[key] = convert(v, opts);
    }
  }
  return out;
}
```

Verification note for the implementer: cross-check `REF_FIELDS`/`REF_ARRAY_FIELDS` against `ast-to-expression-node.ts`'s `resolveRef` call sites (the fields it flattened to strings) — the two sets MUST be inverses. Additionally: the builder's `SwitchCaseGuard.literalGuard` may be a PRIMITIVE (the old serializer `String()`d it) rather than a `RosettaLiteral` node — in `convert`, when a `literalGuard` value is a non-object primitive, wrap it as `{ $type: RAW_DSL_TYPE, text: String(v) }` so `renderSwitchCase`'s dispatch doesn't throw. Add a test case for a primitive literalGuard if the builder schema allows one. Also check how the builder stores `RosettaConstructorExpression.typeRef` (the existing serializer reads `typeRef?.symbol ?? typeRef?.name`): if the builder stores `typeRef.symbol` as a plain string, the nested `symbol` key is already covered by `REF_FIELDS` recursion; confirm with a constructor round-trip test case if the builder produces constructors.

- [ ] **Step 4: Gut `expression-node-to-dsl.ts`**

Replace the file body (keep SPDX header + module doc, updated) with:

```ts
/**
 * expression-node-to-dsl — Serialize an ExpressionNode tree to Rune DSL text.
 *
 * Thin wrapper: converts the builder IR via expressionNodeToDehydrated, then
 * delegates to the shared structural renderer (@rune-langium/codegen/rosetta
 * renderExpression) — the same renderer used by render-core serialization.
 */

import { renderExpression } from '@rune-langium/codegen/rosetta';
import type { ExpressionNode } from '../schemas/expression-node-schema.js';
import { expressionNodeToDehydrated } from './expression-node-to-dehydrated.js';

/** Serialize an ExpressionNode tree to Rune DSL text. Throws on placeholders. */
export function expressionNodeToDsl(tree: ExpressionNode): string {
  return renderExpression(expressionNodeToDehydrated(tree, { allowPlaceholders: false }) as never);
}

/** Serialize with placeholders rendered as `___` (for previews). */
export function expressionNodeToDslPreview(tree: ExpressionNode): string {
  return renderExpression(expressionNodeToDehydrated(tree, { allowPlaceholders: true }) as never);
}
```

- [ ] **Step 5: Fix the wrong-behavior test expectations, run the full suites**

Run: `pnpm --filter @rune-langium/visual-editor test -- expression-node-to-dsl`

Expected failures to correct in `expression-node-to-dsl.test.ts` (each is a documented bug fix, NOT a regression — verify each delta matches this list):
1. Any case asserting mixed `=`/`<>` vs comparison parenthesization per the old split tiers — update to the one-tier behavior.
2. Any case asserting lambda params inside brackets (`[a, b a + b]`) — grammar puts params before: `a, b [a + b]`.
3. Any `then` case asserting a bracketed body (`x then [item > 0]`) — bare body: `x then item > 0` (or the functional form `x then filter [...]`).
4. Any `with-meta` case asserting dropped entries — entries now render.
5. Any multi-arg only-exists case (if present) — now renders `(a, b) only exists`.

If a failing case is NOT explained by this list, STOP — that's a real adapter/renderer bug to fix, not an expectation to update.

Then the full gates:
```bash
pnpm --filter @rune-langium/visual-editor test
pnpm --filter @rune-langium/visual-editor run type-check
pnpm --filter @rune-langium/studio run type-check
```
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/visual-editor/src/adapters/expression-node-to-dehydrated.ts packages/visual-editor/src/adapters/expression-node-to-dsl.ts packages/visual-editor/test/expression-builder/expression-node-to-dehydrated.test.ts packages/visual-editor/test/expression-builder/expression-node-to-dsl.test.ts
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(ve): expression-builder DSL serialization via shared renderExpression"
```

---

## Final verification (after all tasks)

```bash
pnpm --filter @rune-langium/codegen run build
pnpm run type-check   # all 19 packages
pnpm test             # full monorepo
```
Expected: green. Then the final whole-branch review gate (subagent-driven-development) before finishing the branch.
