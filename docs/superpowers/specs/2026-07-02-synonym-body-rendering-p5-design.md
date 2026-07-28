# Full-Fidelity Synonym Body Rendering (P5) — Design

**Builds on:** B1/P1–P3 (structural expression rendering + corpus sweep + hardening, all merged). P5 of the renderer roadmap (`.superpowers/sdd/b1-progress.md`).

## Problem

The synonym renderers in `rosetta-render-core.ts` cover only a thin slice of the grammar:

- `renderSynonym` emits `[synonym src value "name"]` — only `v.name` per value. The grammar's value form also carries `refType tag|componentID value INT`, `path STRING`, `maps INT`; the body can carry trailing `mappingLogic`, `meta`, and four suffixes (`dateFormat`/`pattern`/`removeHtml`/`mapper`). **Rich value-forms render lossily if reached** (silent field drops — the same lossy-if-reached class fixed everywhere else in this roadmap).
- `hint`/`merge`/bare-`meta`/bare-mapping bodies fall back to CST (`values.length === 0 → null`) — safe but unrenderable without CST (programmatic synonyms with those bodies are dropped with a warning).
- `renderClassSynonym` drops `metaValue` entirely and renders only `value.name` (grammar: `value=RosettaClassSynonymValue` with `refType`/`value`/`path`, plus `('meta' metaValue=…)?`).
- `renderEnumSynonym` drops `definition`/`pattern`/`removeHtml`.

## Design

**New module** `packages/codegen/src/emit/rosetta/render-synonym-body.ts` (sibling to `render-expression.ts`, browser-safe, no new deps) covering the closed grammar family, verified against `rune-dsl.langium` L578–703 and the generated interfaces:

- `RosettaSynonymBody`: five alternatives — `value v (, v)* [mapping] [meta s (, s)*]` · `hint s (, s)*` · `merge name [when path <> excl]` · bare set-to mapping · bare `meta s (, s)*` — discriminated by populated fields (`values`/`hints`/`merge`/`mappingLogic`/`metaValues`), then suffixes in grammar order: `dateFormat s`, `pattern s s`, `removeHtml`, `mapper s`.
- `RosettaSynonymValueBase`: `"name" [tag|componentID INT] [path "s"] [maps INT]`.
- Mapping family: `RosettaMapping.instances` comma-joined; each `RosettaMappingInstance` discriminated: `default: true` → `default to <expr>` · `set` present → `set to <expr> [when <tests>]` · `when`-only → `set when <tests>`. `RosettaMappingPathTests.tests` joined ` and `. `RosettaMapTest` forms: `path = "s"` · `rosettaPath = <attrRef>` · `"s" exists` · `"s" is absent` · `"s" =|<> <primary>` · `condition-func Ref [condition-path "s"]`. `RosettaAttributeReference` renders recursively (`receiver` may be a `RosettaDataReference` — `Data.QualifiedName` — or a nested attribute reference; each hop `-> attribute`). `RosettaMapPrimaryExpression` = `EnumValueReference` (`Enum.QualifiedName -> Value`) | literal (delegate literals to `renderExpression`'s existing cases or a tiny local mirror — implementer's call, DRY-preferring delegation).
- All cross-refs via `$refText` + the existing `escapeId` keyword re-escaping (import from render-expression or export shared — refs here use `QualifiedName`/`ValidID` same as expressions).
- All STRINGs through the shared `escapeString`.

**render-core delegation + full surfaces:** `renderSynonym` renders the full body via the module; `renderClassSynonym` gains `value` full-surface + `metaValue`; `renderEnumSynonym` gains `definition`/`pattern`/`removeHtml`.

**Fallback (P3 posture preserved):** the body module throws (`UnsupportedExpressionError` or a sibling error) on any unknown `$type`/undiscriminable body; the three synonym cases catch → return `null` → existing CST fallback, with P3's `console.warn` observability convention for unexpected failures. Full coverage today, degrade-never-corrupt for future grammar additions.

**Verification — corpus sweep extension:** Langium registers every parser rule, so bare-rule parsing works for synonyms: `LangiumParser.parse(text, { rule: 'RosettaSynonym' | 'RosettaClassSynonym' | 'RosettaEnumSynonym' })`. Extend the sweep to collect every synonym's `$cstNode.text` from the 238-file corpus (the FpML ingest namespaces are dense with rich mapping synonyms) and assert parse → render → reparse under the existing **fixed-point + tree-equivalence** invariants. Requires a small core API addition or direct parser access from the test — prefer a `parseRule(text, rule)` internal test helper over widening the public core API (YAGNI until a real consumer needs it).

## Non-goals

- No synonym-editing UI (this makes it possible; the UI is a future effort).
- Display path, transpiler, store contracts untouched.
- No public `parseSynonym` core API (test-internal helper only).

## Testing

Unit tests per body form + value-surface fields + each mapping-test form; hand corpus entries (CI-safe, no `.resources/`) for one rich representative of each body alternative; the corpus sweep extension as the deep gate; render-core delegation tests (class/enum full surfaces); fallback test (unknown body $type → null → CST path intact). Full codegen + VE suites; dist rebuild.
