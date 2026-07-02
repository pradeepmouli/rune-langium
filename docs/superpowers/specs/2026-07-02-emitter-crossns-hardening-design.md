# Emitter Cross-Namespace & JSON Schema Hardening — Design

**Follows:** Data-extends-Choice emission (PR #365, merged). Closes the four-item follow-up cluster recorded there. All four items are grounded findings from #365's review passes — none are speculative.

## Items

### 1. JSON Schema emitter: Choice emission + Choice supertypes

`packages/codegen/src/emit/json-schema-emitter.ts` never implements the optional `NamespaceEmitter.emitChoice` hook (W2 added it; ts/zod implement it). Consequences today:

- No Choice `$defs` entry is ever emitted, so ANY reference to a Choice type — an attribute typed by a Choice, or a `Data extends Choice` supertype — emits a dangling `$ref: #/$defs/<Choice>` (json-schema-emitter.ts:333-347 emits `allOf: [{$ref}, own]` for every supertype kind indiscriminately).

Required:
- Implement `emitChoice`: a `$defs/<Choice>` entry expressing the key-presence discriminated union with the SAME semantics as W2's ts/zod surfaces — exactly one option key present, option key names via the shared `choiceOptionFieldName` camelCase rule, each key's value a `$ref` to the option type's def. The natural JSON Schema encoding is a `oneOf` of single-required-key objects; ground the exact shape in what a REAL validator (ajv — already a codegen devDependency, used by us5a-jsonschema.test.ts) accepts and rejects: `{cash:…}` valid, `{cash:…, commodity:…}` invalid, `{}` invalid.
- `Data extends Choice`: express the inheritance by DERIVATION from the Choice def (same design principle as #365 — never statically decompose): the child def references the Choice's `$defs` entry composed with the child's own properties. Verify with ajv the same five behavior cases as #365's zod tests (single option + extras passes; multi-option fails; extras-only fails; extras validate their own schema; unknown keys rejected per the emitter's additional/unevaluated-properties convention).
- Multi-level (`Data → Data → Choice`) resolves through the chain (reuse the `findChoiceAncestor` logic/pattern from ts-emitter, or walk equivalently).

**Adjacent suspect (verify, then fix-if-real or record):** the existing Data-extends-Data composition emits `allOf: [{$ref: parent}, {…, additionalProperties: false}]`. Under JSON Schema semantics, `additionalProperties: false` in the own-branch is evaluated against the own-branch's `properties` alone, so instances carrying PARENT properties may fail the own branch — meaning every inherited property could be rejected. Test this against ajv with a real parent+child instance BEFORE building item-1 on the same pattern. If real: the standard fix is branch-level schemas without `additionalProperties: false` plus `unevaluatedProperties: false` at the composed level (requires draft 2019-09+; check the emitter's declared `$schema` dialect and what the existing tests pin). If the emitter's dialect can't support it, document the chosen trade-off in the emitter's doc comment. This bug (if real) is PRE-EXISTING — fix it as its own commit, do not fold silently into item 1.

### 2. TS emitter: cross-namespace `Data extends Data` silently drops inheritance

`packages/codegen/src/emit/ts-emitter.ts` gates all supertype emission on `parentInNamespace = parentRef && isData(parentRef) && this.ctx.dataByName.has(name)` at three sites (interface ~548, class ~620, type-guard ~819). A parent Data in ANOTHER namespace fails `dataByName.has` → the interface loses `extends <Parent>Shape`, the class loses `extends <Parent>`, and the guard loses the parent chain — silently. Meanwhile `collectCrossNamespaceImports` ALREADY tracks and emits `import { <Parent>Shape, <Parent> }` for exactly this case (ts-emitter.ts:334-336), so today those imports are unused.

Reviewer's 3-namespace probe from #365 surfaced this; zod has NO such gate (its `buildSuperTypeSchemaExpr` extends cross-ns parents fine with tracked imports) — TS-only bug.

Required: drop the `dataByName.has` condition — `isData(parentRef)` alone suffices (Langium cross-ns refs are resolved AST nodes; `.name` and `findChoiceAncestor` both work through them, which is exactly how cross-ns Data-extends-CHOICE already works post-#365). Verify the generic-Shape threading path (`findChoiceAncestor` through a cross-ns intermediate) composes: a chain `C(ns c) extends B(ns b) extends Choice(ns a)` must emit B and C both as generic aliases threading `T` — extend the existing `data-extends-choice-crossns` fixtures rather than inventing new ones where possible. Multi-file `tsc --strict` compile check (the #365 pattern via `ts.createProgram` + NodeNext over emitted `.js` specifiers) is the gate — it structurally catches both missing imports and broken extends.

### 3. Both emitters: Choice-TYPED attributes are never import-tracked cross-namespace

Both import walks track only `isData`/`isRosettaEnumeration` attribute types:
- ts-emitter.ts ~338-344 (attribute loop) — a Choice-typed attribute resolves to the bare Choice union name (`resolveTypeName` ~403 consults `isChoice`) but the symbol is never imported cross-ns.
- zod-emitter.ts (the sibling attribute loop in its `collectCrossNamespaceImports`) — same gap for `<Choice>Schema`.

Required: add `isChoice` tracking to both attribute loops — TS tracks the bare `<Choice>` name (the type used in attribute positions per existing convention; check whether any attribute-position emission path also references `<Choice>Shape` and track it only if actually referenced), zod tracks `<Choice>Schema`. Fixture: a Data in ns B with an attribute typed by a Choice in ns A; assert emitted import lines in both targets AND run both multi-file guards (tsc for TS, dynamic-import for zod).

### 4. Zod multi-file resolution guard — generalize

#365's Fix 3 already added a real multi-file zod runtime check for the 3-namespace Data-extends-Choice fixture (`zod-data-extends-choice-crossns.test.ts` dynamic-imports the child module across all three emitted on-disk files, via `mkdtempWithNodeModules`). Remaining gap (recorded as Minor in #365's review): the 2-namespace fixture (`data-extends-choice-crossns`) has a TS-side multi-file compile check but no zod-side runtime-import counterpart, and no general cross-ns fixture executes zod output.

Required: add a zod-side multi-file dynamic-import check to the 2-ns fixture suite (same `mkdtempWithNodeModules` pattern — MUST use it; plain `mkdtemp` fails under the root-level coverage runner's native loader, the exact CI-only failure #365 hit). Item 3's new fixture should use the same guard, so this may fold into item 3's test work naturally — one shared pattern, not parallel bespoke ones.

## Constraints

- Design principle carried over from #365: express inheritance by derivation/reference in the emitted artifact; never statically decompose a Choice union into the child.
- Option-key naming rule (camelCased type name via `choiceOptionFieldName`) is FIXED — reuse the shared helper, no re-derivation.
- Plain same-namespace emission for all targets must be byte-identical to master except where item 1's adjacent-suspect fix (if real) changes JSON Schema composition — that change must be its own commit with its own ajv behavior tests.
- Emitted-artifact tests: compile checks use real `ts.createProgram` (never `transpileModule`); runtime checks execute the literal emitted output (never hand-transcribed analogues); JSON Schema behavior checks use real ajv validation, not shape assertions alone.
- New test tmp dirs that dynamic-import emitted modules use `mkdtempWithNodeModules` (packages/codegen/test/emit/emitted-module-dir.ts).
- SPDX headers on new files under packages/ (MIT).

## Acceptance

- ajv-verified behavior suite for JSON Schema Choice + Data-extends-Choice (the five #365 cases) and — if the adjacent suspect is real — a regression test proving parent properties validate on plain Data-extends-Data.
- Cross-ns Data-extends-Data: interface/class/guard all extend across namespaces; multi-file tsc gate green; the previously-unused imports are now load-bearing (assert one).
- Choice-typed cross-ns attribute fixture green in both targets with both multi-file guards.
- Existing corpus gates (condition-transpile-corpus, choice-corpus-acceptance) stay green with zero new exceptions.
- Whole-package: `pnpm --filter @rune-langium/codegen test`, `run type-check`, `run build` clean; whole-monorepo `pnpm run type-check` clean.

## Non-goals

- No change to W2's ts/zod Choice unions, the Shape-level union from #365, or `runeExtendChoice`.
- No renderer/VE/display changes.
- JSON Schema cross-namespace `$ref` STRATEGY (per-file defs vs cross-file refs) stays whatever it is today — item 1 follows the emitter's existing convention for referencing types outside the current namespace; if that convention is itself broken, record it, don't redesign it here.
