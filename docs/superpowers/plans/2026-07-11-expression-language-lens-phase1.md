# Expression Language Lens — Phase 1 (TypeScript Condition Lens MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a studio user toggle a Rune `condition` expression to a TypeScript projection, edit it there, and commit a change back to canonical Rune — for a narrow, provably-reversible subset of boolean expressions (comparisons, logical ops, exists/absent, arithmetic, feature-call paths, literals) — with hard refusal (never silent degradation) outside that subset.

**Architecture:** A new `packages/codegen/src/lens/` module (MIT, browser-safe subpath `@rune-langium/codegen/lens`) owns the bijection: `subset.ts` defines which `RosettaExpression` `$type`s are in scope, `typescript/render-ts.ts` projects a `RosettaExpression` to TS text (`string | null`), `typescript/parse-ts.ts` parses TS text back to a `RosettaExpression` or a typed refusal, using a **dynamically-imported** `typescript` compiler (`await import('typescript')`) so the parser only loads into the browser bundle on first use of the toggle, not eagerly. Studio wires a new `LanguageLensEditor.tsx` into `ExplorePerspective.tsx`'s existing `renderExpressionEditor` slot, alongside the already-shipped `<ExpressionBuilder>`. Commit reuses the **exact same plain-text channel** the Textarea fallback in `ConditionSection.tsx` already uses (`onChange(runeText)` → `onUpdate(index, { expressionText: runeText })`) — the lens produces canonical Rune text via the already-shipped, corpus-tested `renderExpression()` and hands it to that unmodified path. No new store-patch mechanism is introduced.

**Tech Stack:** TypeScript 5.9 (strict, ESM), Vitest, Langium 4.3 (`@rune-langium/core`'s `parseExpression`), `@rune-langium/codegen`'s shipped `rosetta` renderer, CodeMirror 6 (`@codemirror/lang-javascript`, already a studio dependency), the `typescript` npm package's compiler API (parser-only usage, dynamically imported), React 19.

## Global Constraints

- Every file under `packages/codegen/src/lens/` is **MIT**-licensed (SPDX header `// SPDX-License-Identifier: MIT`), matching `emit/rosetta/*` and `expr/transpiler.ts`.
- Files under `apps/studio/src/**` are **FSL-1.1-ALv2** (SPDX header `// SPDX-License-Identifier: FSL-1.1-ALv2`), matching `ExpressionEditor.tsx`.
- `packages/codegen/src/lens/**` must import **no** Node built-ins (`fs`, `path`, etc.) and **no** `ExcelJS` — it is exposed via a browser-safe subpath exactly like `rosetta.ts`, consumed by the visual editor / studio in the browser hot path.
- The `typescript` compiler package must be loaded via dynamic `import('typescript')`, never a static top-level `import` — this is what keeps it out of the eagerly-loaded main bundle (Vite/Rollup code-splits dynamic imports into a separate chunk, fetched only when the toggle is first used).
- After any change under `packages/codegen/src/**`, run `pnpm --filter @rune-langium/codegen run build` before testing studio/visual-editor against it — both consume the built `dist/`, not the source, per this repo's established convention.
- `S` (the supported subset) for Phase 1 is **exactly** these 13 `RosettaExpression` `$type`s — no others, and no unary logical negation (there is no `$type` for it in the shipped grammar; do not invent one):
  `ComparisonOperation`, `EqualityOperation`, `LogicalOperation`, `ArithmeticOperation`, `RosettaExistsExpression`, `RosettaAbsentExpression`, `RosettaFeatureCall`, `RosettaDeepFeatureCall`, `RosettaBooleanLiteral`, `RosettaIntLiteral`, `RosettaNumberLiteral`, `RosettaStringLiteral`, `RosettaSymbolReference`.
- Cross-reference fields (`RosettaFeatureCall.feature`, `RosettaDeepFeatureCall.feature`, `RosettaSymbolReference.symbol`) must be read via `.$refText`, **never** `.ref` — `parseExpression()` never resolves cross-references (no scope, no document), so `.ref` is always `undefined` on lens-parsed trees. This mirrors the shipped `render-expression.ts`'s own input-tolerance contract.

---

## Deviations From the Spec (decided here, not left open)

The spec (`docs/superpowers/specs/2026-07-11-expression-language-lens-design.md`) left two implementation choices as "reuse if possible" suggestions. Investigating the actual code before writing this plan surfaced concrete reasons to decide differently:

1. **Do not wrap `packages/codegen/src/expr/transpiler.ts`.** Its per-category functions (`transpileComparison`, `transpileBoolean`, etc.) all require an `ExpressionTranspilerContext` — `{ selfName, emitMode: 'zod-refine' | 'zod-superRefine' | 'ts-method', conditionName, ... }` — a context shaped entirely around emitting Zod-validator predicates for a named `Condition` inside a generated class. The lens projects a **bare** expression tree with no host condition, no `selfName`, no error-emission mode. Forcing a fake context to satisfy the signature would be more code than writing a small dedicated dispatcher, and would couple the lens to codegen's validator-emission concerns. `render-ts.ts` (Task 2) is therefore new, independent code — not a wrapper.
2. **Use CodeMirror, not Monaco.** The spec's UI section says "a Monaco editor showing the core projection." Monaco is not used anywhere in this repo. `apps/studio/src/components/ExpressionEditor.tsx` already implements exactly this render-slot pattern with CodeMirror 6, and `@codemirror/lang-javascript@^6.2.5` (which supports a `typescript: true` mode) is already a studio dependency. `LanguageLensEditor.tsx` (Task 6) follows `ExpressionEditor.tsx`'s existing shape.

---

### Task 1: `LanguageLens` interface + subset definition

**Files:**
- Create: `packages/codegen/src/lens/language-lens.ts`
- Create: `packages/codegen/src/lens/subset.ts`
- Test: `packages/codegen/test/lens/subset.test.ts`

**Interfaces:**
- Produces: `LanguageLens<L extends string>` (not implemented until Task 6's registry — this task defines the type only), `LensResult`, `RefusalReason`, and `isInSubsetS(node: { $type: string }): boolean` — the single membership predicate every later task calls.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/codegen/test/lens/subset.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { isInSubsetS, SUBSET_S_TYPES } from '../../src/lens/subset.js';

describe('isInSubsetS', () => {
  it('accepts every $type in SUBSET_S_TYPES', () => {
    for (const $type of SUBSET_S_TYPES) {
      expect(isInSubsetS({ $type }), `expected ${$type} to be in S`).toBe(true);
    }
  });

  it('rejects $types outside S', () => {
    for (const $type of ['SwitchOperation', 'ThenOperation', 'RosettaCountOperation', 'ChoiceOperation', 'RawDsl']) {
      expect(isInSubsetS({ $type }), `expected ${$type} to be rejected`).toBe(false);
    }
  });

  it('has exactly 13 members', () => {
    expect(SUBSET_S_TYPES).toHaveLength(13);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/subset.test.ts`
Expected: FAIL — `Cannot find module '../../src/lens/subset.js'`

- [ ] **Step 3: Write `language-lens.ts`**

```typescript
// packages/codegen/src/lens/language-lens.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * A language projection over the canonical `RosettaExpression` AST.
 *
 * `render` never approximates: it returns `null` for any node outside the
 * lens's supported subset `S`, so the caller falls back to read-only Rune.
 * `parse` never returns a degraded node: an out-of-subset or syntactically
 * invalid input is a `RefusalReason`, not a best-effort tree.
 */
import type { RosettaExpression } from '@rune-langium/core';

export interface LanguageLens<L extends string> {
  readonly language: L;
  render(node: RosettaExpression): string | null;
  parse(text: string): LensResult;
}

export type LensResult = { ok: true; node: RosettaExpression } | { ok: false; reason: RefusalReason };

/** `offset`/`length` index into the TS source text the lens was asked to parse. */
export interface RefusalReason {
  kind: 'syntax-error' | 'out-of-subset';
  message: string;
  offset: number;
  length: number;
}
```

- [ ] **Step 4: Write `subset.ts`**

```typescript
// packages/codegen/src/lens/subset.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * The single source of truth for the lens's supported `RosettaExpression`
 * subset `S`. Widening this list is a deliberate act — add a round-trip
 * fixture (Task 4) and a `render-ts.ts` case (Task 2) in the same change.
 *
 * Deliberately excludes: `RosettaCountOperation`, `OneOfOperation`,
 * `ChoiceOperation` (deferred — no confirmed-reversible TS shape yet),
 * `SwitchOperation`/`ThenOperation` (irreversible lowering, per the spec's
 * Phase 1 seeding rule: reversibility, not transpiler coverage, is the
 * boundary), and any unary "not" (no such `$type` exists in the shipped
 * grammar — do not invent one).
 */
export const SUBSET_S_TYPES = [
  'ComparisonOperation',
  'EqualityOperation',
  'LogicalOperation',
  'ArithmeticOperation',
  'RosettaExistsExpression',
  'RosettaAbsentExpression',
  'RosettaFeatureCall',
  'RosettaDeepFeatureCall',
  'RosettaBooleanLiteral',
  'RosettaIntLiteral',
  'RosettaNumberLiteral',
  'RosettaStringLiteral',
  'RosettaSymbolReference'
] as const;

export type SubsetSType = (typeof SUBSET_S_TYPES)[number];

const SUBSET_S_SET: ReadonlySet<string> = new Set(SUBSET_S_TYPES);

/** True if `node.$type` is one of the 13 types Phase 1 supports. */
export function isInSubsetS(node: { $type: string }): boolean {
  return SUBSET_S_SET.has(node.$type);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/subset.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/lens/language-lens.ts packages/codegen/src/lens/subset.ts packages/codegen/test/lens/subset.test.ts
git commit -m "feat(codegen): lens LanguageLens interface + subset S definition"
```

---

### Task 2: `render-ts.ts` — `RosettaExpression` → TypeScript text

**Files:**
- Create: `packages/codegen/src/lens/typescript/render-ts.ts`
- Test: `packages/codegen/test/lens/typescript/render-ts.test.ts`

**Interfaces:**
- Consumes: `isInSubsetS` (Task 1) from `../subset.js`.
- Produces: `renderTs(node: RosettaExpression): string | null` — used by Task 4's round-trip test and by Task 6's read-only-projection path.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/codegen/test/lens/typescript/render-ts.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderTs } from '../../../src/lens/typescript/render-ts.js';

function render(rune: string): string | null {
  const { value, hasErrors } = parseExpression(rune);
  expect(hasErrors, `must parse: ${rune}`).toBe(false);
  return renderTs(value);
}

describe('renderTs', () => {
  it('renders a comparison', () => {
    expect(render('value >= 0')).toBe('value >= 0');
  });
  it('renders exists as a null check', () => {
    expect(render('currency exists')).toBe('currency != null');
  });
  it('renders absent as a null-equality check', () => {
    expect(render('currency is absent')).toBe('currency == null');
  });
  it('preserves precedence/parenthesization', () => {
    expect(render('a and (b or c)')).toBe('a && (b || c)');
  });
  it('renders equality/inequality with the TS operators', () => {
    expect(render('a = b')).toBe('a === b');
    expect(render('a <> b')).toBe('a !== b');
  });
  it('renders a feature-call path with optional chaining', () => {
    expect(render('trade -> quantity')).toBe('trade?.quantity');
  });
  it('renders arithmetic', () => {
    expect(render('(a + b) * c')).toBe('(a + b) * c');
  });
  it('renders string/number/boolean literals', () => {
    expect(render('"USD"')).toBe('"USD"');
    expect(render('3.5')).toBe('3.5');
    expect(render('True')).toBe('true');
  });
  it('returns null outside the subset', () => {
    expect(render('items count')).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/typescript/render-ts.test.ts`
Expected: FAIL — `Cannot find module '../../../src/lens/typescript/render-ts.js'`

- [ ] **Step 3: Write `render-ts.ts`**

```typescript
// packages/codegen/src/lens/typescript/render-ts.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Rune → TypeScript projection over subset `S` (see ../subset.ts).
 *
 * Independent of `expr/transpiler.ts` on purpose: that module's per-category
 * functions all require an `ExpressionTranspilerContext` (selfName, emitMode,
 * conditionName) built for emitting Zod-validator predicates inside a
 * generated class — this projects a bare expression tree with no host
 * condition at all. See the plan's "Deviations From the Spec" note.
 *
 * Returns `null` for any node outside `S` — never an approximate rendering.
 */
import type { RosettaExpression } from '@rune-langium/core';
import { isInSubsetS } from '../subset.js';

type AnyNode = RosettaExpression & Record<string, unknown>;

const COMPARISON_TS: Record<string, string> = { '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const EQUALITY_TS: Record<string, string> = { '=': '===', '<>': '!==' };
const LOGICAL_TS: Record<string, string> = { and: '&&', or: '||' };
const ARITHMETIC_TS: Record<string, string> = { '+': '+', '-': '-', '*': '*', '/': '/' };

/** Render `child`, parenthesizing whenever it is itself a binary/logical node. */
function r(child: RosettaExpression): string {
  const node = child as AnyNode;
  const text = renderTs(child);
  if (text === null) throw new UnsupportedInChild();
  const needsParens =
    node.$type === 'LogicalOperation' ||
    node.$type === 'ComparisonOperation' ||
    node.$type === 'EqualityOperation' ||
    node.$type === 'ArithmeticOperation';
  return needsParens ? `(${text})` : text;
}

/** Internal signal: a child was outside `S` — caught by `renderTs` to return `null`. */
class UnsupportedInChild extends Error {}

export function renderTs(node: RosettaExpression): string | null {
  try {
    return dispatch(node as AnyNode);
  } catch (e) {
    if (e instanceof UnsupportedInChild) return null;
    throw e;
  }
}

function dispatch(node: AnyNode): string {
  if (!isInSubsetS(node)) throw new UnsupportedInChild();

  switch (node.$type) {
    case 'RosettaBooleanLiteral':
      return node['value'] ? 'true' : 'false';
    case 'RosettaIntLiteral':
    case 'RosettaNumberLiteral':
      return String(node['value']);
    case 'RosettaStringLiteral':
      return JSON.stringify(String(node['value']));
    case 'RosettaSymbolReference': {
      const symbol = node['symbol'] as { $refText?: string } | undefined;
      const rawArgs = (node['rawArgs'] as RosettaExpression[] | undefined) ?? [];
      if (rawArgs.length > 0) throw new UnsupportedInChild(); // function calls: out of S for Phase 1
      return symbol?.$refText ?? '';
    }
    case 'RosettaFeatureCall': {
      const receiver = r(node['receiver'] as RosettaExpression);
      const feature = node['feature'] as { $refText?: string } | undefined;
      return `${receiver}?.${feature?.$refText ?? ''}`;
    }
    case 'RosettaDeepFeatureCall': {
      const receiver = r(node['receiver'] as RosettaExpression);
      const feature = node['feature'] as { $refText?: string } | undefined;
      return `${receiver}?.${feature?.$refText ?? ''}`;
    }
    case 'RosettaExistsExpression': {
      const argument = r(node['argument'] as RosettaExpression);
      return `${argument} != null`;
    }
    case 'RosettaAbsentExpression': {
      const argument = r(node['argument'] as RosettaExpression);
      return `${argument} == null`;
    }
    case 'ArithmeticOperation': {
      const left = r(node['left'] as RosettaExpression);
      const right = r(node['right'] as RosettaExpression);
      const op = ARITHMETIC_TS[node['operator'] as string];
      return `${left} ${op} ${right}`;
    }
    case 'ComparisonOperation': {
      const left = r(node['left'] as RosettaExpression);
      const right = r(node['right'] as RosettaExpression);
      const op = COMPARISON_TS[node['operator'] as string];
      return `${left} ${op} ${right}`;
    }
    case 'EqualityOperation': {
      const left = r(node['left'] as RosettaExpression);
      const right = r(node['right'] as RosettaExpression);
      const op = EQUALITY_TS[node['operator'] as string];
      return `${left} ${op} ${right}`;
    }
    case 'LogicalOperation': {
      const left = r(node['left'] as RosettaExpression);
      const right = r(node['right'] as RosettaExpression);
      const op = LOGICAL_TS[node['operator'] as string];
      return `${left} ${op} ${right}`;
    }
    default:
      throw new UnsupportedInChild();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/typescript/render-ts.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/codegen/src/lens/typescript/render-ts.ts packages/codegen/test/lens/typescript/render-ts.test.ts
git commit -m "feat(codegen): lens render-ts — RosettaExpression to TypeScript projection"
```

---

### Task 3: `parse-ts.ts` — TypeScript text → `LensResult`

**Files:**
- Create: `packages/codegen/src/lens/typescript/parse-ts.ts`
- Modify: `packages/codegen/package.json:dependencies` — add `"typescript"` if not already present (check first: `packages/codegen` likely already has it as a devDependency for its own build; confirm with `node -e "console.log(require('/Users/pmouli/GitHub.nosync/active/ts/rune-langium/packages/codegen/package.json').devDependencies.typescript)"` — if present only in devDependencies, move/add it to `dependencies` since `parse-ts.ts` needs it at runtime, not just build time).
- Test: `packages/codegen/test/lens/typescript/parse-ts.test.ts`

**Interfaces:**
- Consumes: `LensResult`, `RefusalReason` (Task 1, `../language-lens.js`); `isInSubsetS` (Task 1, `../subset.js`).
- Produces: `async function parseTs(text: string): Promise<LensResult>` — async because the `typescript` module is dynamically imported. Used by Task 4's round-trip test and Task 6's commit path.

- [ ] **Step 1: Check whether `typescript` is already a runtime dependency**

Run: `node -e "const p = require('/Users/pmouli/GitHub.nosync/active/ts/rune-langium/packages/codegen/package.json'); console.log('dependencies:', p.dependencies?.typescript); console.log('devDependencies:', p.devDependencies?.typescript);"`

If it prints only under `devDependencies`, move the line from `devDependencies` to `dependencies` in `packages/codegen/package.json` (same version string), then run `pnpm install` at the repo root. If it's already under `dependencies`, skip the edit.

- [ ] **Step 2: Write the failing test**

```typescript
// packages/codegen/test/lens/typescript/parse-ts.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseTs } from '../../../src/lens/typescript/parse-ts.js';

describe('parseTs', () => {
  it('parses a comparison', async () => {
    const r = await parseTs('value >= 0');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('ComparisonOperation');
  });

  it('parses `!= null` as an exists check, not equality', async () => {
    const r = await parseTs('currency != null');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('RosettaExistsExpression');
  });

  it('parses `== null` as an absent check', async () => {
    const r = await parseTs('currency == null');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('RosettaAbsentExpression');
  });

  it('parses logical and/or with correct precedence', async () => {
    const r = await parseTs('a && (b || c)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('LogicalOperation');
  });

  it('parses optional-chained feature paths', async () => {
    const r = await parseTs('trade?.quantity');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.$type).toBe('RosettaFeatureCall');
  });

  it('refuses a syntactically invalid buffer', async () => {
    const r = await parseTs('value >=');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('syntax-error');
  });

  it('refuses an assignment (out of subset)', async () => {
    const r = await parseTs('value = 3');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses a method call (out of subset)', async () => {
    const r = await parseTs('value.toFixed(2)');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });

  it('refuses unguarded property access (no null-safety guarantee)', async () => {
    const r = await parseTs('trade.quantity');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason.kind).toBe('out-of-subset');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/typescript/parse-ts.test.ts`
Expected: FAIL — `Cannot find module '../../../src/lens/typescript/parse-ts.js'`

- [ ] **Step 4: Write `parse-ts.ts`**

```typescript
// packages/codegen/src/lens/typescript/parse-ts.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * TypeScript text → `LensResult` (parse-back).
 *
 * Uses the `typescript` compiler API's parser only (no type-checker, no
 * `Program`) via a DYNAMIC import — this keeps `typescript` out of the
 * eagerly-loaded browser bundle; Vite code-splits it into a chunk fetched
 * only the first time a user opens the TypeScript lens.
 *
 * Walks a deliberately narrow set of `ts.SyntaxKind`s. Anything else —
 * assignments, calls (except the disallowed forms below), unguarded
 * `PropertyAccessExpression` (no `?.`), loops, statements other than a
 * single expression — is a refusal, never a degraded node.
 */
import type { RosettaExpression } from '@rune-langium/core';
import type { LensResult, RefusalReason } from '../language-lens.js';

function refusal(kind: RefusalReason['kind'], message: string, offset: number, length: number): LensResult {
  return { ok: false, reason: { kind, message, offset, length } };
}

export async function parseTs(text: string): Promise<LensResult> {
  const ts = await import('typescript');
  const sourceFile = ts.createSourceFile('lens.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const diagnosticSyntaxErrors = (
    sourceFile as unknown as { parseDiagnostics?: Array<{ messageText: unknown; start: number; length: number }> }
  ).parseDiagnostics;
  if (diagnosticSyntaxErrors && diagnosticSyntaxErrors.length > 0) {
    const d = diagnosticSyntaxErrors[0]!;
    return refusal('syntax-error', ts.flattenDiagnosticMessageText(d.messageText as never, '\n'), d.start, d.length);
  }

  const statements = sourceFile.statements;
  if (statements.length !== 1 || !ts.isExpressionStatement(statements[0]!)) {
    return refusal('syntax-error', 'expected a single expression', 0, text.length);
  }

  const expr = (statements[0] as import('typescript').ExpressionStatement).expression;
  try {
    return { ok: true, node: toRosetta(ts, expr) };
  } catch (e) {
    if (e instanceof OutOfSubset) {
      return refusal('out-of-subset', e.message, e.tsNode.getStart(sourceFile), e.tsNode.getWidth(sourceFile));
    }
    throw e;
  }
}

class OutOfSubset extends Error {
  constructor(message: string, public readonly tsNode: import('typescript').Node) {
    super(message);
  }
}

const COMPARISON_FROM_TS: Record<string, string> = { '<': '<', '<=': '<=', '>': '>', '>=': '>=' };
const EQUALITY_FROM_TS: Record<string, string> = { '===': '=', '!==': '<>' };
const LOGICAL_FROM_TS: Record<string, string> = { '&&': 'and', '||': 'or' };
const ARITHMETIC_FROM_TS: Record<string, string> = { '+': '+', '-': '-', '*': '*', '/': '/' };

function toRosetta(ts: typeof import('typescript'), node: import('typescript').Node): RosettaExpression {
  if (ts.isParenthesizedExpression(node)) return toRosetta(ts, node.expression);

  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.getText();

    // `x != null` / `x == null` are the presence idiom, not literal equality —
    // Rune has no null literal, so this mapping is unambiguous both ways.
    if ((op === '!==' || op === '!=') && ts.isNullLiteral(node.right)) {
      return {
        $type: 'RosettaExistsExpression',
        argument: toRosetta(ts, node.left),
        operator: 'exists'
      } as unknown as RosettaExpression;
    }
    if ((op === '===' || op === '==') && ts.isNullLiteral(node.right)) {
      return {
        $type: 'RosettaAbsentExpression',
        argument: toRosetta(ts, node.left),
        operator: 'absent'
      } as unknown as RosettaExpression;
    }

    if (op in COMPARISON_FROM_TS) {
      return {
        $type: 'ComparisonOperation',
        left: toRosetta(ts, node.left),
        operator: COMPARISON_FROM_TS[op],
        right: toRosetta(ts, node.right)
      } as unknown as RosettaExpression;
    }
    if (op in EQUALITY_FROM_TS) {
      return {
        $type: 'EqualityOperation',
        left: toRosetta(ts, node.left),
        operator: EQUALITY_FROM_TS[op],
        right: toRosetta(ts, node.right)
      } as unknown as RosettaExpression;
    }
    if (op in LOGICAL_FROM_TS) {
      return {
        $type: 'LogicalOperation',
        left: toRosetta(ts, node.left),
        operator: LOGICAL_FROM_TS[op],
        right: toRosetta(ts, node.right)
      } as unknown as RosettaExpression;
    }
    if (op in ARITHMETIC_FROM_TS) {
      return {
        $type: 'ArithmeticOperation',
        left: toRosetta(ts, node.left),
        operator: ARITHMETIC_FROM_TS[op],
        right: toRosetta(ts, node.right)
      } as unknown as RosettaExpression;
    }
    throw new OutOfSubset(`operator '${op}' is not supported`, node);
  }

  // Only `?.`-guarded access is accepted — plain `.` implies a different
  // (non-propagating) null semantic than Rune's optional path navigation.
  if (ts.isPropertyAccessExpression(node)) {
    if (!node.questionDotToken) {
      throw new OutOfSubset('property access must use ?. — plain . has no Rune equivalent', node);
    }
    return {
      $type: 'RosettaFeatureCall',
      receiver: toRosetta(ts, node.expression),
      feature: { $refText: node.name.getText() }
    } as unknown as RosettaExpression;
  }

  if (ts.isIdentifier(node)) {
    return {
      $type: 'RosettaSymbolReference',
      explicitArguments: false,
      rawArgs: [],
      symbol: { $refText: node.getText() }
    } as unknown as RosettaExpression;
  }

  if (node.kind === ts.SyntaxKind.TrueKeyword || node.kind === ts.SyntaxKind.FalseKeyword) {
    return { $type: 'RosettaBooleanLiteral', value: node.kind === ts.SyntaxKind.TrueKeyword } as unknown as RosettaExpression;
  }
  if (ts.isNumericLiteral(node)) {
    const text = node.getText();
    return {
      $type: text.includes('.') ? 'RosettaNumberLiteral' : 'RosettaIntLiteral',
      value: text.includes('.') ? Number(text) : parseInt(text, 10)
    } as unknown as RosettaExpression;
  }
  if (ts.isStringLiteral(node)) {
    return { $type: 'RosettaStringLiteral', value: node.text } as unknown as RosettaExpression;
  }

  throw new OutOfSubset(`'${ts.SyntaxKind[node.kind]}' is not supported`, node);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/typescript/parse-ts.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/lens/typescript/parse-ts.ts packages/codegen/test/lens/typescript/parse-ts.test.ts packages/codegen/package.json pnpm-lock.yaml
git commit -m "feat(codegen): lens parse-ts — TypeScript text to RosettaExpression parse-back"
```

---

### Task 4: Round-trip fixed-point tests (both directions) + refusal corpus

**Files:**
- Create: `packages/codegen/test/lens/typescript/roundtrip.test.ts`

**Interfaces:**
- Consumes: `parseExpression`/`renderExpression` (already shipped, `@rune-langium/core` / `../../../src/emit/rosetta/render-expression.js`), `renderTs` (Task 2), `parseTs` (Task 3), `treesEquivalent` (already shipped, `../../emit/rosetta/expression-tree-equivalence.js`).

- [ ] **Step 1: Write the test (this task is entirely test-writing; no new production code)**

```typescript
// packages/codegen/test/lens/typescript/roundtrip.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { renderExpression } from '../../../src/emit/rosetta/render-expression.js';
import { treesEquivalent } from '../../emit/rosetta/expression-tree-equivalence.js';
import { renderTs } from '../../../src/lens/typescript/render-ts.js';
import { parseTs } from '../../../src/lens/typescript/parse-ts.js';

// Every entry must be in subset S (see ../../../src/lens/subset.ts) and
// exercises the mapping this feature's contract depends on.
const IN_SUBSET_CORPUS = [
  'value >= 0',
  'currency exists',
  'currency is absent',
  'a and (b or c)',
  'a = b',
  'a <> b',
  'trade -> quantity',
  'trade -> quantity ->> amount',
  '(a + b) * c',
  '"USD"',
  '3.5',
  'True',
  'quantity > 0 and price exists'
];

describe('lens: Rune -> TS -> Rune fixed point (contract points 1+2)', () => {
  for (const rune of IN_SUBSET_CORPUS) {
    it(`round-trips: ${rune}`, async () => {
      const p1 = parseExpression(rune);
      expect(p1.hasErrors, `must parse: ${rune}`).toBe(false);

      const ts = renderTs(p1.value);
      expect(ts, `must be in S: ${rune}`).not.toBeNull();

      const back = await parseTs(ts!);
      expect(back.ok, `TS must parse back: ${ts}`).toBe(true);
      if (!back.ok) return;

      const rune2 = renderExpression(back.node);
      const p2 = parseExpression(rune2);
      expect(p2.hasErrors, `re-rendered Rune must reparse: ${rune2}`).toBe(false);
      expect(
        treesEquivalent(p1.value, p2.value),
        `round-tripped tree must be structurally equivalent: ${rune} -> ${ts} -> ${rune2}`
      ).toBe(true);
    });
  }
});

describe('lens: TS -> Rune -> TS fixed point (write-back direction)', () => {
  const TS_CORPUS = ['value >= 0', 'currency != null', 'currency == null', 'a && (b || c)', 'trade?.quantity'];
  for (const ts of TS_CORPUS) {
    it(`round-trips: ${ts}`, async () => {
      const parsed = await parseTs(ts);
      expect(parsed.ok, `must parse: ${ts}`).toBe(true);
      if (!parsed.ok) return;

      const ts2 = renderTs(parsed.node);
      expect(ts2, `must render back: ${ts}`).not.toBeNull();
      expect(ts2).toBe(ts);
    });
  }
});

describe('lens: refusal corpus (contract point 3 — never a degraded node)', () => {
  const REFUSALS: Array<{ ts: string; kind: 'syntax-error' | 'out-of-subset' }> = [
    { ts: 'value >=', kind: 'syntax-error' },
    { ts: 'value = 3', kind: 'out-of-subset' },
    { ts: 'value.toFixed(2)', kind: 'out-of-subset' },
    { ts: 'trade.quantity', kind: 'out-of-subset' },
    { ts: 'for (;;) {}', kind: 'syntax-error' }
  ];
  for (const { ts, kind } of REFUSALS) {
    it(`refuses (${kind}): ${ts}`, async () => {
      const r = await parseTs(ts);
      expect(r.ok, `must be refused: ${ts}`).toBe(false);
      if (!r.ok) expect(r.reason.kind).toBe(kind);
    });
  }
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/typescript/roundtrip.test.ts`
Expected: PASS (13 + 5 + 5 = 23 tests). If any `IN_SUBSET_CORPUS` entry fails, the bug is in Task 2 or Task 3 — fix there, not by removing the fixture.

- [ ] **Step 3: Commit**

```bash
git add packages/codegen/test/lens/typescript/roundtrip.test.ts
git commit -m "test(codegen): lens Rune<->TS fixed-point and refusal corpus"
```

---

### Task 5: Browser-safe `./lens` export subpath

**Files:**
- Modify: `packages/codegen/package.json:exports`
- Create: `packages/codegen/src/lens.ts` (entry file, mirrors `src/rosetta.ts`)
- Test: `packages/codegen/test/lens/browser-safe.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–3.
- Produces: the public `@rune-langium/codegen/lens` import path that Task 6 (studio) uses.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/codegen/test/lens/browser-safe.test.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LENS_DIR = join(import.meta.dirname, '../../src/lens');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []
  );
}

describe('codegen/lens is browser-safe', () => {
  it('imports no Node built-ins or ExcelJS in any source file', () => {
    for (const file of walk(LENS_DIR)) {
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} must not import 'fs'`).not.toMatch(/from ['"](node:)?fs['"]/);
      expect(src, `${file} must not import ExcelJS`).not.toMatch(/exceljs/i);
    }
  });

  it("'typescript' is only ever dynamically imported, never a static import", () => {
    for (const file of walk(LENS_DIR)) {
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} must not statically import 'typescript'`).not.toMatch(/^import .* from ['"]typescript['"]/m);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/browser-safe.test.ts`
Expected: PASS actually (nothing to violate yet) — this is a guard test, not a red/green TDD step for new behavior. Confirm it passes now so it's a real regression guard once Task 6 or later tasks add files.

- [ ] **Step 3: Write `src/lens.ts`**

```typescript
// packages/codegen/src/lens.ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Browser-safe entry for the expression language lens.
 *
 * Re-exports ONLY the lens bijection. Must never import `./index.js`,
 * `./generator.js`, or anything under `./emit/excel-emitter.js` — same
 * constraint as `./rosetta.ts`. The `typescript` compiler is loaded via a
 * dynamic `import()` inside `parse-ts.ts`, not a static import here, so it
 * never lands in this subpath's eagerly-bundled dependency graph.
 */
export type { LanguageLens, LensResult, RefusalReason } from './lens/language-lens.js';
export { isInSubsetS, SUBSET_S_TYPES } from './lens/subset.js';
export type { SubsetSType } from './lens/subset.js';
export { renderTs } from './lens/typescript/render-ts.js';
export { parseTs } from './lens/typescript/parse-ts.js';
```

- [ ] **Step 4: Add the `./lens` export to `package.json`**

In `packages/codegen/package.json`, add to the `exports` map (alongside the existing `./rosetta` entry):

```json
    "./lens": {
      "types": "./dist/src/lens.d.ts",
      "default": "./dist/src/lens.js"
    }
```

- [ ] **Step 5: Rebuild dist and run the guard test**

Run: `pnpm --filter @rune-langium/codegen run build`
Run: `pnpm --filter @rune-langium/codegen exec vitest run test/lens/browser-safe.test.ts`
Expected: build succeeds with no errors; test PASSES (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/codegen/src/lens.ts packages/codegen/package.json packages/codegen/test/lens/browser-safe.test.ts
git commit -m "feat(codegen): expose @rune-langium/codegen/lens browser-safe subpath"
```

---

### Task 6: Studio `LanguageLensEditor` — toggle, CodeMirror TS projection, commit wiring

**Files:**
- Create: `apps/studio/src/components/LanguageLensEditor.tsx`
- Create: `apps/studio/src/lang/typescript-readonly.ts` (small CodeMirror extension helper — read-only TS syntax highlighting for the projection view)
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx` — wrap the existing `renderExpressionEditor` callback
- Test: `apps/studio/test/components/LanguageLensEditor.test.tsx`

**Interfaces:**
- Consumes: `ExpressionEditorSlotProps` (`@rune-langium/visual-editor`, already shipped — `{ value, onChange, onBlur, error, placeholder, expressionAst }`), `parseTs`/`renderTs`/`isInSubsetS` (`@rune-langium/codegen/lens`), `parseExpression`/`renderExpression` (already shipped).
- Produces: `LanguageLensEditor(props: ExpressionEditorSlotProps): ReactElement` — a drop-in alternative to `<ExpressionBuilder>` for the same slot, adding a Rune/TypeScript toggle.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/studio/test/components/LanguageLensEditor.test.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageLensEditor } from '../../src/components/LanguageLensEditor.js';

describe('LanguageLensEditor', () => {
  it('defaults to the Rune view', () => {
    render(<LanguageLensEditor value="value >= 0" onChange={vi.fn()} onBlur={vi.fn()} />);
    expect(screen.getByText('value >= 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /typescript/i })).toBeInTheDocument();
  });

  it('projects to TypeScript on toggle', async () => {
    render(<LanguageLensEditor value="currency exists" onChange={vi.fn()} onBlur={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /typescript/i }));
    await waitFor(() => expect(screen.getByText('currency != null')).toBeInTheDocument());
  });

  it('commits a valid TS edit back as canonical Rune text via onChange', async () => {
    const onChange = vi.fn();
    render(<LanguageLensEditor value="value >= 0" onChange={onChange} onBlur={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /typescript/i }));
    await waitFor(() => screen.getByText('value >= 0'));

    const editor = screen.getByRole('textbox', { name: /typescript expression/i });
    fireEvent.input(editor, { target: { textContent: 'value > 0' } });
    fireEvent.blur(editor);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('value > 0'));
  });

  it('blocks commit and shows an inline error for out-of-subset TS', async () => {
    const onChange = vi.fn();
    render(<LanguageLensEditor value="value >= 0" onChange={onChange} onBlur={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /typescript/i }));
    await waitFor(() => screen.getByText('value >= 0'));

    const editor = screen.getByRole('textbox', { name: /typescript expression/i });
    fireEvent.input(editor, { target: { textContent: 'value.toFixed(2)' } });
    fireEvent.blur(editor);

    await waitFor(() => expect(screen.getByText(/not supported/i)).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows read-only Rune with a notice for expressions outside S, never a TS toggle result', () => {
    // 'items count' is outside S (RosettaCountOperation) — renderTs returns null.
    render(<LanguageLensEditor value="items count" onChange={vi.fn()} onBlur={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /typescript/i }));
    expect(screen.getByText(/can.t be shown in typescript/i)).toBeInTheDocument();
    expect(screen.getByText('items count')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/LanguageLensEditor.test.tsx`
Expected: FAIL — `Cannot find module '../../src/components/LanguageLensEditor.js'`

- [ ] **Step 3: Write `LanguageLensEditor.tsx`**

```tsx
// apps/studio/src/components/LanguageLensEditor.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * LanguageLensEditor — Rune/TypeScript toggle over a condition expression.
 *
 * Drop-in replacement for `<ExpressionBuilder>` in the `renderExpressionEditor`
 * slot (ExpressionEditorSlotProps). Defaults to showing the Rune text as-is
 * (no risk added over today's behavior). Toggling to TypeScript renders the
 * projection via `renderTs` (from `@rune-langium/codegen/lens`) when the
 * current expression is in subset S; otherwise shows read-only Rune with a
 * notice and disables further editing in that mode — it never shows an
 * approximate TypeScript rendering.
 *
 * Commit path: on blur, `parseTs` parses the edited TS buffer. A refusal
 * (syntax error or out-of-subset construct) is shown inline and `onChange`
 * is NOT called — canonical Rune is unaffected. A successful parse is
 * rendered back to canonical Rune text via `renderExpression` (the shipped,
 * corpus-tested Rune emitter) and handed to `onChange` UNCHANGED — this is
 * the exact same plain-text commit contract `ConditionSection.tsx`'s
 * Textarea fallback already uses (`onChange={(val) => onUpdate?.(index, {
 * expressionText: val })}`), so no new store-patch mechanism is needed.
 *
 * @module
 */
import { useEffect, useState, useCallback } from 'react';
import type { ExpressionEditorSlotProps } from '@rune-langium/visual-editor';
import { parseExpression } from '@rune-langium/core';
import { renderExpression } from '@rune-langium/codegen/rosetta';
import { renderTs, parseTs } from '@rune-langium/codegen/lens';
import { cn } from '@rune-langium/design-system/utils';
import { Button } from '@rune-langium/design-system/ui/button';

type Language = 'rune' | 'typescript';

export function LanguageLensEditor({ value, onChange, onBlur, error }: ExpressionEditorSlotProps) {
  const [language, setLanguage] = useState<Language>('rune');
  const [tsDraft, setTsDraft] = useState('');
  const [tsError, setTsError] = useState<string | null>(null);
  const [projection, setProjection] = useState<string | null>(null);

  // Recompute the TS projection whenever the canonical Rune text or the
  // language mode changes — never cached across a different `value`.
  useEffect(() => {
    if (language !== 'typescript') return;
    const parsed = parseExpression(value);
    if (parsed.hasErrors) {
      setProjection(null);
      return;
    }
    const ts = renderTs(parsed.value);
    setProjection(ts);
    if (ts !== null) setTsDraft(ts);
  }, [language, value]);

  const handleToggle = useCallback((next: Language) => {
    setTsError(null);
    setLanguage(next);
  }, []);

  const handleTsBlur = useCallback(async () => {
    const result = await parseTs(tsDraft);
    if (!result.ok) {
      setTsError(result.reason.message);
      return;
    }
    setTsError(null);
    const runeText = renderExpression(result.node);
    onChange(runeText);
    onBlur();
  }, [tsDraft, onChange, onBlur]);

  const outOfSubset = language === 'typescript' && projection === null;

  return (
    <div data-slot="language-lens-editor" className="flex flex-col gap-1">
      <div className="flex gap-1">
        <Button
          type="button"
          variant={language === 'rune' ? 'default' : 'outline'}
          size="xs"
          onClick={() => handleToggle('rune')}
        >
          Rune
        </Button>
        <Button
          type="button"
          variant={language === 'typescript' ? 'default' : 'outline'}
          size="xs"
          onClick={() => handleToggle('typescript')}
        >
          TypeScript
        </Button>
      </div>

      {language === 'rune' || outOfSubset ? (
        <pre className="studio-scroll text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap overflow-auto max-h-40">
          {value || '(empty)'}
        </pre>
      ) : (
        <div
          role="textbox"
          aria-label="TypeScript expression"
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          className={cn(
            'text-xs font-mono rounded p-2 border border-input bg-background min-h-[2.5rem]',
            (tsError || error) && 'border-destructive'
          )}
          onInput={(e) => setTsDraft(e.currentTarget.textContent ?? '')}
          onBlur={handleTsBlur}
        >
          {tsDraft}
        </div>
      )}

      {outOfSubset && (
        <p className="text-xs text-muted-foreground italic">This expression can't be shown in TypeScript.</p>
      )}
      {tsError && <p className="text-xs text-destructive">{tsError}</p>}
      {!tsError && error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

> Note: the test's `contentEditable` div stands in for the CodeMirror instance in this task's scope — it exercises the toggle/commit/refusal contract without requiring a full CodeMirror harness in the test. A follow-up task (not in this plan) can swap the `contentEditable` for a real `@codemirror/lang-javascript` instance (mirroring `ExpressionEditor.tsx`'s `buildExtensions` pattern) once this contract is proven; the `ExpressionEditorSlotProps` surface does not change either way.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/LanguageLensEditor.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire it into `ExplorePerspective.tsx`**

Find the existing `renderExpressionEditor` callback (currently `(props) => <ExpressionBuilder {...props} scope={functionScope} />`) and wrap it with a top-level editor-family toggle so `<ExpressionBuilder>` (the structured builder) remains the default and `<LanguageLensEditor>` becomes an alternative, not a replacement:

```tsx
// apps/studio/src/shell/ExplorePerspective.tsx — near the existing renderExpressionEditor callback
import { LanguageLensEditor } from '../components/LanguageLensEditor.js';

// ... existing functionScope useMemo stays as-is ...

const [expressionEditorMode, setExpressionEditorMode] = useState<'builder' | 'lens'>('builder');

const renderExpressionEditor = useCallback(
  (props: ExpressionEditorSlotProps) =>
    expressionEditorMode === 'lens' ? (
      <LanguageLensEditor {...props} />
    ) : (
      <ExpressionBuilder {...props} scope={functionScope} />
    ),
  [functionScope, expressionEditorMode]
);
```

(A visible switch for `expressionEditorMode` — e.g. a settings toggle — is deliberately out of scope for this plan; wiring the two modes side-by-side here unblocks manual QA and a future settings-surface task without widening Phase 1.)

- [ ] **Step 6: Type-check and run the full studio test suite**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: no errors — confirms `@rune-langium/codegen/lens` and `@rune-langium/codegen/rosetta` both resolve their types correctly from studio.

Run: `pnpm --filter @rune-langium/studio run test`
Expected: all existing tests still pass, plus the 5 new `LanguageLensEditor` tests.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/components/LanguageLensEditor.tsx apps/studio/src/shell/ExplorePerspective.tsx apps/studio/test/components/LanguageLensEditor.test.tsx apps/studio/package.json pnpm-lock.yaml
git commit -m "feat(studio): LanguageLensEditor — TypeScript projection toggle for conditions"
```

---

## Self-Review

**1. Spec coverage.** US1 acceptance scenarios 1–4 (comparison, exists, precedence, out-of-subset notice) are covered by Task 2 + Task 6's tests. US2 acceptance scenarios 1–5 (comparison commit, exists-idiom commit, out-of-subset refusal, syntax-error refusal, edit locality) are covered by Task 3, Task 4, and Task 6 — edit locality itself is not re-tested here because it is already covered by the shipped `cst-reuse-renderer` test suite (`editable-roundtrip`, `cst-reuse-cascade`) and this plan's commit path produces the identical `expressionText` string shape those tests already exercise; no new locality mechanism is introduced. US3 (function-body lens) and US4 (Python) are explicitly Phase 2/3, out of this plan's scope per the spec's own MVP definition.

**2. Placeholder scan.** No "TBD"/"handle edge cases" prose steps. Every step either is pure test-writing (Task 4) or pairs a runnable command with real, complete code. Task 6's `contentEditable` stand-in is flagged explicitly as a scope decision (not a TODO) with a named follow-up.

**3. Type consistency.** `LensResult`/`RefusalReason` (Task 1) are used with identical shapes in Tasks 3, 4, and 6. `renderTs`/`parseTs` signatures are identical everywhere they're called. `isInSubsetS` is defined once (Task 1) and only ever imported, never redefined.

## Open items carried forward (not blocking Phase 1, tracked for Phase 2 planning)

- Spec Open Questions 2 (`us12-cdm-corpus.test.ts` ceiling ratcheting) and 5/6 (Monaco language services / keyword-collision identifiers) remain unaddressed — none block Phase 1's narrower subset, since Phase 1 doesn't touch reserved-keyword identifiers or the CDM corpus ceilings.
- Undo/redo (spec Open Question 8) should be manually verified once Task 6 lands: toggle to TS, edit, commit, then exercise the studio's undo control and confirm the Rune text reverts. Not written as an automated test in this plan because it requires the full editor-store + zundo harness, which is disproportionate to Phase 1's scope — flag as a manual QA step before this ships.
- The rollback/kill-switch (spec Open Question 10) is partially addressed by Task 6 Step 5's `expressionEditorMode` local toggle (an escape hatch already exists structurally), but no user-facing settings surface or feature flag is built — a follow-up, not this plan's job.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-11-expression-language-lens-phase1.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
