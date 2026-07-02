# Transpiler & Emitter Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emitted TypeScript/Zod reaches parity with the renderer: all 16 missing expression `$type`s transpile to real semantics (W1), and `Choice` types emit as key-presence discriminated unions with validators (W2).

**Architecture & per-type semantics:** in the spec — `docs/superpowers/specs/2026-07-02-transpiler-expression-parity-design.md`. The spec is the requirements document; this plan sequences it. Branch `feat/transpiler-emitter-parity` off master.

## Global Constraints

- New transpiler cases are mode-agnostic expression emitters (return JS expression strings); match sibling conventions for undefined/empty propagation (read `exists`/`absent`/`first`/`last` FIRST, mirror their guard style — consistency over cleverness).
- `RosettaSuperCall` = deliberate loud diagnostic (own case + own message + pinning test), NOT silent fall-through. If the corpus gate finds real `super` in conditions, STOP and escalate.
- Choice option field naming/casing MUST mirror the Data-attribute emission conventions (verify against emitInterface; never invent).
- Corpus diagnostic gate: zero `/* DIAGNOSTIC` across all corpus condition expressions post-work (record the pre-work baseline). `.resources/`-guarded per repo convention.
- Rebuild codegen dist before any VE suite. SKIP_SIMPLE_GIT_HOOKS=1; stage only named files; standard footers (Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com> + Claude-Session: https://claude.ai/code/session_01QBKeg1hukfnXfvCCkQnxb2).
- Whole-monorepo green at the end.

### Task 1: W1 tiers 1–3 — the 14 mechanical cases
Files: `packages/codegen/src/expr/transpiler.ts` + its unit test file(s) under `packages/codegen/test/`.
TDD per tier: failing unit tests (each case × the emit-mode variants where output differs) → implement per the spec's semantics table → green. Parse-first where a semantics doubt exists (e.g. verify Rune `to-int` failure semantics against any rune-dsl docs/tests in `.resources/rune-dsl-src`). Commit per tier or as one commit — implementer's call, note which.

### Task 2: W1 tier 4 + super + P4 regression debt
`SwitchOperation` (IIFE + ternary chain per spec; guard resolution shared with `ToEnumOperation`), `RosettaSuperCall` deliberate diagnostic + pinning test, PLUS the P4-noted missing regression tests: chained same-tier comparisons (`(a > b) = c`), nested `or` grouping — pin current (verified-correct) transpiler output. Commit.

### Task 3: corpus diagnostic gate
New `packages/codegen/test/expr/condition-transpile-corpus.test.ts` (or sibling dir convention): walk all `.resources/` docs (reuse the sweep's file-walking helper if exportable, else mirror it), collect every `Condition.expression`, transpile with a neutral ctx per emit mode `zod-refine`, count `/* DIAGNOSTIC` occurrences. Assert ZERO (and separately assert zero `super` occurrences). Log `transpiled N condition expressions from M files (baseline had K diagnostics)` — capture K by running the gate BEFORE Task 1 lands (do this first, record in the report, then the gate goes green after Tasks 1-2). Also transpile func-body expressions if cheaply reachable (operations/shortcuts) — report whether included or deferred. Commit.

### Task 4: W2 — Choice emission + mapping audit
Files: `packages/codegen/src/emit/namespace-walker.ts` (+ its test), `packages/codegen/src/emit/ts-emitter.ts`, `packages/codegen/src/emit/zod-emitter.ts`, tests for both emitters.
- Walker: collect `Choice` (`choiceByName`), thread through emitOrder + reference graph (mirror Data's treatment; namespace-walker.test.ts gets cases).
- ts-emitter: per spec — key-presence discriminated union type + exactly-one-of validator + type guard, following the file's existing conventions; typeRef mapping `isChoice → name`.
- zod-emitter: `z.union` of per-option object schemas per its Data conventions; same typeRef mapping fix.
- RecordType/MetaType audit: enumerate the 6+6 corpus decls, check each against `builtinTypeMap`/refText fallback in BOTH emitters; map explicitly anything falling to `unknown`; document the outcome either way in the report.
- Acceptance: a corpus-level check that NO attribute in emitted output for the cdm namespace types as `unknown` due to Choice (spot-check emitNamespace output for a Choice-consuming type, e.g. whatever references `Asset`).
Commit. Final: whole-monorepo build/type-check/test.
