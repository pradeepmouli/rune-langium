# Native Structural Expression Rendering (B1) — Design

**Builds on:** `2026-06-28-editable-surface-rendering-b2-design.md` (Plan B2 — the merged, prod-live editable-surface renderer). B2 explicitly deferred this as its "Follow-up: B1" — see `docs/superpowers/plans/2026-06-28-editable-surface-rendering-b2.md` (bottom section) and the "Relationship to B1" section of the B2 design doc.

## Problem

B2 renders `Condition`/`Operation`/`ShortcutDeclaration` bodies verbatim from `expression.$cstText` (fallback `$cstNode.text`) — no parsing, no structural understanding. This means:

- A freshly-added expression node with no CST (e.g. programmatically constructed) has nothing to fall back on.
- render-core cannot participate in expression-level dirty-path/CST-reuse decisions the way it does for every other construct.
- Three separate, partially-diverging implementations of "turn a Rune expression tree into DSL text" already exist in the codebase, none of which is render-core's own:
  1. `packages/codegen/src/expr/transpiler.ts` (1145 lines) — transpiles a real, parser-produced `RosettaExpression` to target-language validation code (Python/TS), not DSL text.
  2. `packages/visual-editor/src/adapters/expression-node-to-dsl.ts` (316 lines) — renders the expression-*builder* UI's own `ExpressionNode` IR (Zod-derived from the grammar's operation schemas, with a synthetic `id` field and two UI-only variants, `Placeholder`/`Unsupported`) back to DSL text.
  3. render-core's `exprText()` — today just the `$cstText` passthrough this design replaces.

## Non-Goals

- **`transpiler.ts` is untouched** — no dispatch changes, no shared precedence constant. It transpiles to target-language validation code (a different concern from DSL rendering) and is validation-critical production code. Sharing its copied precedence table with the new renderer is a reasonable, low-risk future follow-up, deliberately deferred out of this design.
- No expression-builder UI/UX changes — only the two adapter modules (`expression-node-to-dsl.ts`, `parse-expression.ts`) and render-core are touched.
- No grammar or store shape changes — this is purely a render/parse capability swap behind existing call sites.
- `parseExpression` never attempts cross-reference linking (see below).

## Architecture

Three deliverables, in dependency order:

### 1. `renderExpression` (render-core)

```ts
function renderExpression(expr: Dehydrated<RosettaExpression>): string
```

A structural renderer covering the full expression grammar: the 8-level precedence chain (`ThenOperationRule` → `OrOperation` → `AndOperation` → `EqualityOperationRule` → `AdditiveOperation` → `MultiplicativeOperation` → `BinaryOperationRule` → `UnaryOperation`/`PrimaryExpression`), all ~30+ node types under `UnaryOperation`/`PrimaryExpression` (navigation, aggregation, higher-order functions, control flow, constructors, literals), plus the 4 mapping-qualifier types (`RosettaMapTestExistsExpression`, `RosettaMapTestAbsentExpression`, `RosettaMapTestEqualityOperation`, `RosettaAttributeReference`) that the expression-builder UI deliberately excludes but real parsed/curated documents can contain.

Replaces `exprText()` at its 3 call sites: `renderOperation`, `renderShortcut`, `renderCondition` (all in `packages/codegen/src/emit/rosetta/rosetta-render-core.ts`).

**Input shape:** `Dehydrated<RosettaExpression>`, matching every other render-core function and matching how `transpiler.ts` already operates in practice (it uses `$refText ?? ref?.name` throughout and never touches `$cstNode`/`$container`, i.e. it's already dehydration-tolerant even though its type imports are the live-AST names). Dispatch is modeled on `transpiler.ts`'s existing per-operation structure, reusing the same Langium-generated type guards from `packages/core/src/generated/ast.ts` (pure `$type` checks — work identically on live or dehydrated nodes) — but each case emits Rune DSL syntax instead of transpiled code.

**Precedence table** (authoritative, corrects an existing bug — see below):

| Level | Operators | Grammar rule |
|---|---|---|
| 1 (loosest) | `then` | `ThenOperationRule` |
| 2 | `or` | `OrOperation` |
| 3 | `and` | `AndOperation` |
| 4 | `=` `<>` `>=` `<=` `>` `<` | `EqualityOperationRule` (one tier — see below) |
| 5 | `+` `-` | `AdditiveOperation` |
| 6 | `*` `/` | `MultiplicativeOperation` |
| 7 | `contains` `disjoint` `default` `join` | `BinaryOperationRule` |
| 8 (tightest) | postfix/unary (`->`, `exists`, `count`, …) | `UnaryOperation`/`PrimaryExpression` |

**Bug found and fixed:** `expression-node-to-dsl.ts`'s existing precedence table splits `=`/`<>` (tier 3) from `>=`/`<=`/`>`/`<` (tier 4) — but the grammar parses both at the *same* `EqualityOperationRule` level. The new table uses one tier for both, matching the grammar.

**Bug found and fixed — left/right-aware parenthesization:** the grammar's binary chains are left-associative-by-repetition (`A ({left=current} op B)*`). The **left** operand naturally shares the parent's precedence (it's the accumulated chain — never needs parens). The **right** operand is always a strictly-tighter rule *unless* the source had explicit parens (`a or (b or c)`). A single `<` comparison for both sides (as `expression-node-to-dsl.ts` does today) silently drops that grouping on render, breaking round-trip fidelity and, for non-associative operators, correctness. Fix: side-aware wrapping — left child wraps when `childPrecedence < parentPrecedence`; right child wraps when `childPrecedence <= parentPrecedence`.

**Auxiliary shapes** referenced from `RosettaExpression` nodes but not themselves in the union — `InlineFunction` (`MapOperation.function` etc.), `SwitchCaseOrDefault` (`SwitchOperation.cases`), `ConstructorKeyValuePair` (`RosettaConstructorExpression.values`) — get their own small render helpers, mirroring the existing `serializeInlineFunction`/`convertInlineFunction`/`convertSwitchCase`/`convertKVP` helper pattern already established in `expression-node-to-dsl.ts` and `ast-to-expression-node.ts`. `Dehydrated<T>`'s mapped type already recurses into any `AstNode`-shaped field generically, so no separate top-level entry point is needed for these.

**Extension point:** `renderExpression` accepts an optional leaf-rendering callback for a UI-only escape-hatch shape (see Unification below), defaulting to `never`/unused for render-core's own 3 callers, which never produce such leaves. This keeps render-core's default type contract pure (`Dehydrated<RosettaExpression>` only) while giving the visual-editor wrapper an extension point without "infecting" render-core's public type with UI-only concepts.

### 2. `parseExpression` (core)

```ts
export interface ExpressionParseResult {
  value: RosettaExpression;
  lexerErrors: Array<{ message: string; offset: number; line?: number; column?: number }>;
  parserErrors: Array<{ message: string; offset?: number; line?: number; column?: number }>;
  hasErrors: boolean;
}

export function parseExpression(text: string): ExpressionParseResult
```

New file `packages/core/src/api/parse-expression.ts`, exported from core's barrel, mirroring `parse.ts`'s existing conventions and JSDoc style (`@remarks`/`@useWhen`/`@avoidWhen`/`@pitfalls`/`@example`).

**Mechanism:** Langium 4.3's `LangiumParser.parse(text, options?: { rule?: string })` natively supports parsing from any registered parser rule, not just the grammar's `entry` rule — confirmed directly against `node_modules/.pnpm/langium@4.3.0/.../langium-parser.js`: every declared rule is registered into `this.allRules` (not just the entry rule), and `parse()`'s `options.rule` looks it up directly. `parseExpression` calls `services.parser.LangiumParser.parse(text, { rule: 'ExpressionWithAsKey' })` directly.

**Rule choice:** `ExpressionWithAsKey` is used for all cases. `Operation.expression` uses this rule directly; `Condition.expression`/`ShortcutDeclaration.expression` use the plain `Expression` rule, but `ExpressionWithAsKey`'s trailing `as-key` suffix is optional (`(...)?`), making it a strict superset — no need to expose a rule parameter.

**Synchronous, unlike `parse()`/`parseWorkspace()`** — no `DocumentBuilder.build()` pass, because a bare expression snippet has no enclosing namespace to build against. This is a deliberate, real simplification over the document-based APIs, not an oversight.

**`value` is always present** (Chevrotain performs best-effort error recovery), mirroring `parse()`'s existing "even when `hasErrors` is `false`... the returned value is always valid (possibly partial)" contract. Callers check `hasErrors`.

**Never resolves cross-references** — documented as a `@pitfalls` note matching `parse()`'s style. This is stronger than `parse()`'s "unresolved across files" caveat: a bare expression parse has *no* scope at all, so references are *always* unresolved (`.ref` never set, only `.$refText`).

**Replaces the existing hack.** `packages/visual-editor/src/adapters/parse-expression.ts`'s `parseExpressionAsync` today wraps expression text in a synthetic `func ParseWrapper: output result string (1..1) set result: <expr>` document, calls the full async `parse()` (document build + linking + validation), and navigates 4 levels deep into the resulting tree (`elements[0].operations[0].expression`) to extract the expression back out — silently collapsing every failure mode (lexer errors, parser errors, wrong navigation shape) into a single `null`. `parseExpression` in core replaces this entirely: no document templating, no full-pipeline cost, no swallowed errors.

**Consequence for visual-editor:** because the raw parser's live `RosettaExpression` output is `$refText`-tolerant (Langium's `Reference<T>` always carries `.$refText` even unlinked), it can be fed *directly* into the existing `astToExpressionNode` converter (`packages/visual-editor/src/adapters/ast-to-expression-node.ts`) without a dehydration step — that converter's `resolveRef` helper already accepts both `{$refText}`-shaped objects and plain strings, and never touches `$container`/`$cstNode`. So visual-editor's `parseExpression` collapses from a two-tier sync/async split to one synchronous function:

```ts
export function parseExpression(text: string): ExpressionNode {
  if (!text) return { $type: 'Placeholder', id: uid() };
  const { value, hasErrors } = coreParseExpression(text);
  if (hasErrors) return { $type: 'Unsupported', id: uid(), rawText: text };
  return astToExpressionNode(value, text);
}
```

The dynamic `import('@rune-langium/core')`, the wrapper-document templating, and the manual tree navigation are all deleted.

### 3. Unification: `expression-node-to-dsl.ts`

New adapter `packages/visual-editor/src/adapters/expression-node-to-dehydrated.ts`:

```ts
function expressionNodeToDehydrated(node: ExpressionNode): Dehydrated<RosettaExpression> | RawDslLeaf
```

Walks the `ExpressionNode` tree, converting real operation nodes 1:1 — inverting the field mapping already established by the existing `ast-to-expression-node.ts` converter (that one does `{$refText} → string`; this one does `string → {$refText}` for the same known set of ref-bearing fields: `symbol`, `feature`, `enumeration`, `attributes`). `Placeholder` and `Unsupported` (the two UI-only variants with no grammar equivalent) convert to a small escape-hatch leaf shape (`RawDslLeaf`, carrying either the `___` placeholder marker or `Unsupported.rawText`) instead of attempting a `Dehydrated<RosettaExpression>` shape that doesn't exist for them.

`expressionNodeToDsl`/`expressionNodeToDslPreview` become thin wrappers: convert the whole tree via the adapter (throwing immediately on encountering `Placeholder` for the non-preview variant — same behavior as today, just relocated into the adapter's walk) then make one call into `renderExpression`, passing a leaf-callback that emits `RawDslLeaf.text` verbatim (unquoted, unescaped — it's already either a marker or pre-existing DSL text).

**This fixes 3 real bugs in the current hand-rolled serializer as a side effect**, since everything now routes through the one correct renderer:
1. The precedence-tier split (`=`/`<>` vs comparisons) described above.
2. `RosettaOnlyExistsExpression`'s multi-arg primary form (`(a, b, c) only exists`) — today's serializer only handles the unary-postfix form (`argument`), never the `args` array form.
3. `WithMetaOperation.entries` — today's serializer emits bare `with-meta` and silently drops the `{key: value, ...}` entries block entirely.

**`ast-to-expression-node.ts` is unchanged** — the reverse (AST→`ExpressionNode`) direction already exists, is correct for its own purpose, and this design doesn't touch it (though `parseExpression`'s visual-editor wrapper becomes a new *caller* of it, per above).

## Testing

- **`renderExpression` unit tests**, one group per precedence tier, plus a dedicated regression test for the left/right-aware wrap fix: `a or (b or c)` must render *with* parens (the exact case the current bug silently drops).
- **Round-trip suite**: parse → render → re-parse → structurally equal, over a curated set of expressions exercising the full grammar surface (mirrors `packages/visual-editor/test/serialize/editable-roundtrip.test.ts`'s existing pattern from B2).
- **`parseExpression` unit tests**: valid syntax → correct tree; invalid syntax → `hasErrors: true` with a still-present best-effort `value`; explicit test confirming no cross-reference is ever resolved (`.ref` is always `undefined`).
- **`expression-node-to-dsl.test.ts` (existing suite) must stay green** — 3 of its current cases assert the *incorrect* precedence/missing-entries behavior described above and need their expected-output strings corrected. This is a deliberate, expected test update, not a red flag to investigate.
- **Adapter tests**: `expressionNodeToDehydrated` round-trips through `renderExpression` for each `ExpressionNode` variant, including `Placeholder` (preview mode) and `Unsupported`.

## File Structure

- **Create** `packages/codegen/src/emit/rosetta/render-expression.ts` — the expression dispatcher (kept separate from `rosetta-render-core.ts`, which stays focused on non-expression constructs; render-core imports and calls it at the 3 existing `exprText()` call sites).
- **Create** `packages/core/src/api/parse-expression.ts` — `parseExpression`/`ExpressionParseResult`, exported from core's barrel alongside `parse`/`parseWorkspace`.
- **Create** `packages/visual-editor/src/adapters/expression-node-to-dehydrated.ts` — the `ExpressionNode → Dehydrated<RosettaExpression> | RawDslLeaf` adapter.
- **Modify** `packages/codegen/src/emit/rosetta/rosetta-render-core.ts` — `exprText()` calls replaced with `renderExpression()` at all 3 sites; `exprText()` itself removed.
- **Modify** `packages/visual-editor/src/adapters/expression-node-to-dsl.ts` — gutted to the two thin wrappers described above.
- **Modify** `packages/visual-editor/src/adapters/parse-expression.ts` — gutted to the single synchronous function described above; `parseExpressionAsync` removed. Confirmed dead code today: `rg` finds zero real call sites (only self-referential doc comments) — `ExpressionBuilder.tsx` only ever calls the sync `parseExpression`, which today returns `Unsupported` for any raw DSL text. So this isn't just a sync/async cleanup: `ExpressionBuilder.tsx`'s **existing, unchanged call site** starts receiving real parsed trees instead of `Unsupported` placeholders for raw text the moment `parseExpression` is swapped to call the new core API — a functional fix with no call-site change required.
