# Full-Fidelity Synonym Body Rendering (P5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Structurally render the entire `RosettaSynonymBody`/`RosettaClassSynonym`/`RosettaEnumSynonym` grammar surface (ending the lossy-if-reached value forms and the CST-only mapping bodies), gated by a synonym-body extension of the real-corpus sweep.

**Architecture:** New `render-synonym-body.ts` module; render-core's three synonym cases delegate with catch→null→CST fallback. Spec: `docs/superpowers/specs/2026-07-02-synonym-body-rendering-p5-design.md` (grammar refs: rune-dsl.langium L578–703; interface shapes verified).

**Tech Stack:** TypeScript 5.9 strict ESM, Vitest. Branch `feat/synonym-body-rendering-p5` off master.

## Global Constraints

- Fallback posture: body module THROWS on unknown/undiscriminable input; the three synonym cases in render-core catch → `null` → CST fallback (never corrupt). P3's warn-on-unexpected convention applies (`UnsupportedExpressionError`-family silent, anything else warns).
- All cross-refs render via `$refText` through the existing keyword `escapeId`; all STRING fields through the shared `escapeString`.
- Suffix ordering exactly per grammar: value-list [mapping] [meta] for the value form; then `dateFormat` → `pattern` → `removeHtml` → `mapper`.
- Corpus sweep + hand corpus (fixed-point + tree-equivalence) are the regression gate; the sweep extension must sweep ALL THREE synonym rule types.
- Browser-safe: no parser/services import into the render modules (test helper may import core services).
- Rebuild codegen dist before VE suites. SKIP_SIMPLE_GIT_HOOKS=1; stage only named files; standard footers (Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com> + Claude-Session: https://claude.ai/code/session_01QBKeg1hukfnXfvCCkQnxb2).

## Reference render forms (grammar-verified; implementer translates to code)

- Value: `"name"` + (` tag INT` | ` componentID INT` when `refType`/`value` present) + (` path "p"`) + (` maps N`)
- Body value-form: `value <v>, <v>` + (` <mapping>`)? + (` meta "s", "s"`)? — note the grammar allows mappingLogic+meta ONLY on the value form
- Body alternatives: `hint "s", "s"` · `merge name` (+ ` when path <> "excl"`) · `<set-to mapping>` (bare) · `meta "s", "s"` (bare)
- Suffixes: ` dateFormat "s"` · ` pattern "match" "replace"` · ` removeHtml` · ` mapper "s"`
- Mapping: instances comma-joined. Instance: `default: true` → `default to <primary>` · `set` present → `set to <primary>` (+ ` when <tests>`) · else `set when <tests>`
- Tests: joined ` and `. Forms: `path = "s"` · `rosettaPath = <attrRef>` · `"s" exists` · `"s" is absent` · `"s" = <primary>` / `"s" <> <primary>` · `condition-func <Ref>` (+ ` condition-path "s"`)
- AttrRef (recursive): `Data.QualifiedName -> attr [-> attr ...]` (receiver is RosettaDataReference at the root, RosettaAttributeReference when nested — discriminate by $type)
- Primary: EnumValueReference `Enum.QualifiedName -> Value` | literal (delegate to renderExpression for the literal $types — they're already covered there)
- Class synonym: `[synonym src, src [value <classValue>] [meta <metaValue>]]` where classValue = value-surface WITHOUT `maps`
- Enum synonym: `[synonym src, src value "s" [definition "s"] [pattern "m" "r"] [removeHtml]]`

---

### Task 1: `render-synonym-body.ts` + render-core full surfaces

**Files:**
- Create: `packages/codegen/src/emit/rosetta/render-synonym-body.ts`
- Modify: `packages/codegen/src/emit/rosetta/rosetta-render-core.ts` (renderClassSynonym/renderSynonym/renderEnumSynonym; keep signatures `string | null`)
- Modify: `packages/codegen/src/rosetta.ts` (export renderSynonymBody + error type if new)
- Test: `packages/codegen/test/emit/rosetta/render-synonym-body.test.ts` (create)

**Interfaces:**
- Produces: `renderSynonymBody(body: unknown): string` (throws on unknown), plus small exported helpers only if Task 2's tests need them. render-core: the 3 synonym fns render full surfaces, catching body-render throws → `null` (CST fallback), warning per P3 convention on non-designed errors.
- Consumes: `escapeString` (render-core), `escapeId` + literal cases from render-expression (export `escapeId` from render-expression if not already; delegate literal rendering via `renderExpression`).

TDD steps: failing unit tests first — at minimum one per body alternative, one rich value (`"n" tag 2 path "p" maps 3`), each mapping-test form, a 2-instance mapping with `and`-chained tests, recursive attrRef (2 hops), enum-value-ref primary, literal primary, each suffix, suffix ordering, class synonym with value+metaValue, enum synonym with all suffixes, unknown-body-$type → render-core returns null (CST fallback intact — test through renderNode with a $cstText stub). Then implement; full codegen suite + type-check; commit.

---

### Task 2: corpus sweep extension + hand corpus entries

**Files:**
- Modify: `packages/codegen/test/emit/rosetta/expression-corpus-sweep.test.ts` (add a synonym sweep section) — or create a sibling `synonym-corpus-sweep.test.ts` if cleaner (implementer's call; share the file-walking/tree-equivalence helpers either way, DRY)
- Modify: `packages/codegen/test/emit/rosetta/expression-tree-equivalence.ts` ONLY if the normalize helper needs no changes — verify it's shape-agnostic (it should be; it walks generic $type trees)
- Create/extend hand-corpus coverage: `packages/codegen/test/emit/rosetta/synonym-roundtrip.test.ts` with CI-safe entries — one per body alternative + rich forms, e.g.:
  - `[synonym FpML value "tradeDate" path "trade" maps 2 meta "id"]`
  - `[synonym FpML value "t" set when path = "a.b", default to "X"]` (adjust to a grammar-valid mapping body — verify by parsing FIRST)
  - `[synonym FpML hint "h1", "h2"]`
  - `[synonym FpML merge "m" when path <> "x"]`
  - `[synonym FpML set to Foo.Bar -> V when rosettaPath = Data.Type -> attr]` (again: parse-first to pin exact valid syntax)
  - value + dateFormat/pattern/removeHtml/mapper suffix combos
  - class synonym `[synonym FpML value "n" tag 2 meta "m"]`, enum synonym with definition+pattern+removeHtml

**Mechanism:** bare-rule parse helper local to the tests: `services.RuneDsl.parser.LangiumParser.parse(text, { rule: 'RosettaSynonym' })` (and the other two rule names) via `createRuneDslServices` — mirror how parseExpression does it (core `api/parse-expression.ts`) but keep it a TEST helper (no public API). Round-trip: parse → render via `renderNode` (through the real dispatch) → reparse → fixed-point + tree-equivalence.

**Sweep extraction:** walk each parsed corpus document for `$type in {RosettaSynonym, RosettaClassSynonym, RosettaEnumSynonym}` nodes, take `$cstNode.text`, dedupe, run the round-trip per snippet. Log counts (`swept N unique synonyms from M files`). ANY finding = triage → fix in render-synonym-body.ts (same branch) → add minimal repro to the hand corpus — the P1 protocol.

Verify: full codegen suite, dist rebuild, full VE suite (synonym render paths feed VE serialize), both type-checks. Commit.

---

## Final verification

`pnpm --filter @rune-langium/codegen run build && pnpm run type-check && pnpm test` (whole monorepo) → review gate → PR.
