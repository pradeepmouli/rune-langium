# Feature 015 — Handoff for the next agent

**Branch**: `015-rune-codegen-zod`
**HEAD at handoff**: see `git log -1 --oneline` (Phase 8b merge)
**Progress**: 119 / 138 tasks (86%) complete. Two phases left: Phase 6 (Studio UX) + Phase 9 (Polish).

## How to pick up

1. `cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium`
2. `git checkout 015-rune-codegen-zod && git pull` (or `git fetch && git checkout 015-rune-codegen-zod`)
3. `pnpm install`
4. Confirm baseline:
   ```bash
   pnpm -r run type-check                              # exit 0 across 18 packages
   pnpm --filter @rune-langium/codegen test            # 336 passing + 9 todo
   ```
5. Read this file end-to-end, then `specs/015-rune-codegen-zod/tasks.md` from line where Phase 6 starts.

## What's done

| Phase | Tasks | Commits | Codegen tests |
|---|---|---|---|
| 1 — Setup (rename `packages/codegen` → `packages/codegen-legacy`) | T001–T014 | `e458145` | — |
| 2 — Foundational scaffold (types, cycle-detector, topo-sort, helpers, fixture harness) | T015–T027 | `94826a7` | 50 |
| 3 — US1 Structural Zod (MVP) — 6 fixture pairs + CLI | T028–T046 | merge `0130c87` | 58 |
| 4 — US2 Constraint conditions (one-of/choice/exists/absent/only-exists) | T047–T057 | merge `Phase 4` | 64 |
| 5 — US3 Full expression transpiler (13 forms) + 200-case parity matrix | T058–T078 | merge `195a5e6` | 290 |
| 7 — US5A JSON Schema target + ajv meta-validation | T090–T098 | merge `3b385a1` | 302 |
| 8 — US5B Full-class TS target (no Zod dep) | T099–T112 | direct `c9842d2` + `02d9223` | 319 |
| 8b — US6 Rune `func` → TS module-level functions | T113–T130 | merge after `103341e` | **336** |

All four code-emission targets work end-to-end with TDD-discipline byte-identical fixture diffs. CDM `tsc --noEmit` smoke passes for Zod + TS targets; ajv meta-schema validation passes for JSON Schema target.

## What's left

### Phase 6 — User Story 4: Studio multi-target live preview (T079–T089, 11 tasks)

**Why deferred**: this is the only phase that crosses out of `packages/codegen/` into `apps/studio/`. Worth doing directly (or in a single tightly-scoped worktree) rather than parallel.

**Goal**: Studio's right-hand panel shows live-generated output for the active document. A target switcher (Zod / JSON Schema / TypeScript) toggles between them. Source-mapping enables click-to-navigate from generated regions back to `.rune` source. Status states: `Generating…` / `Generated (Zod)` / `Outdated — fix errors to refresh` / `Preview unavailable`.

**Subtasks (per spec.md §US4 + contracts/studio-preview.md)**:

- **6a (T079–T082)** — RED component tests in `apps/studio/src/components/__tests__/`:
  - `TargetSwitcher.test.tsx` — segmented control; default Zod; raises onChange with correct Target
  - `CodePreviewPanel.test.tsx` — status transitions; last-known-good retention on `codegen:outdated`
  - `CodePreviewPanel-sourcemap.test.tsx` — Monaco onMouseDown → revealLineInCenter on source editor
  - `CodePreviewPanel-targets.test.tsx` — switching target sends `codegen:generate` worker message
- **6b (T083–T085)** — Studio store + LSP worker wiring:
  - Add `codePreviewTarget: Target` to the workspace zustand store; persist via existing IndexedDB layer; default `'zod'`
  - LSP Worker handles `codegen:generate` messages → calls `generate(builtDocs, { target })` from `@rune-langium/codegen` → posts `codegen:result` or `codegen:outdated`; 200ms debounce
  - Build-phase listener: after `DocumentBuilder.build()` succeeds, fire generation for the active target only (lazy, not all three)
- **6c (T086–T088)** — React components:
  - `apps/studio/src/components/TargetSwitcher.tsx` (FSL-1.1-ALv2 SPDX)
  - `apps/studio/src/components/CodePreviewPanel.tsx` (FSL-1.1-ALv2 SPDX) — read-only Monaco; status bar; click-to-navigate handler
  - Register in `apps/studio/src/shell/layout-factory.ts`'s right-hand panel group
- **6d (T089)** — iterate to GREEN

**Implementation notes for the next agent**:
- The LSP Worker entry file is `apps/studio/src/workers/lsp-worker.ts` (or whatever the equivalent is — check `apps/studio/src/main.tsx` for the Worker import).
- The Studio uses `dockview-react` for panels; existing panels live in `apps/studio/src/shell/dockview-bridge.ts` and `apps/studio/src/shell/layout-factory.ts`. Add `code-preview` as a new panel in the right-hand group; mirror the registration pattern of `Inspector` or `Output`.
- Source mapping shape: `GeneratorOutput.sourceMap` is already populated by all three emitters with `SourceMapEntry { outputLine, sourceUri, sourceLine, sourceChar }`. For the JSON Schema target, `outputLine` is a JSON Pointer string (e.g., `/$defs/TypeName/properties/foo`) — the click handler needs to deal with both forms. See `contracts/studio-preview.md §Click-to-navigate handler`.
- Worker message protocol: `{ type: 'codegen:generate', target: Target }` → `{ type: 'codegen:result', target, relativePath, content, sourceMap }` or `{ type: 'codegen:outdated' }`. See `contracts/studio-preview.md §Worker message protocol`.
- Use `@rune-langium/design-system` primitives for the TargetSwitcher (segmented control / tabs).
- Monaco read-only mode: `monaco.editor.create(el, { readOnly: true, language: target === 'json-schema' ? 'json' : 'typescript', ... })`.

### Phase 9 — Polish (T131–T138, 8 tasks)

**Goal**: lock the feature down with cross-cutting verification and CI.

**Subtasks**:
- **T131** — activate ALL CDM smoke sub-tests (Zod tsc, JSON Schema ajv, TS tsc) + per-condition-kind JSON battery for both valid and invalid; assert total run time < 30s (SC-006)
- **T132** [P] — `time pnpm rune-codegen packages/curated-schema/fixtures/cdm/ --target zod -o /tmp/cdm-out/` < 30s; document baseline
- **T133** [P] — determinism check in `fixture.test.ts`: run each Tier 1 fixture twice in the same vitest process; assert byte-identical (in-process SC-007 guard)
- **T134** [P] — CI fixture-diff job in `.github/workflows/`: runs `pnpm --filter @rune-langium/codegen test fixture`; fails on any drift (CI SC-007)
- **T135** [P] — verify `apps/codegen-container` and `apps/codegen-worker` still build with `@rune-langium/codegen-legacy` post-rename (FR-027 sanity)
- **T136** [P] — README in `packages/codegen/README.md` documenting all 4 targets (Zod / JSON Schema / TS class / func emission), CLI usage, fixture taxonomy
- **T137** [P] — bump versions / changelog if needed
- **T138** — final acceptance gate: `pnpm -r test` + `pnpm -r run type-check` + `pnpm rune-codegen` against curated CDM completes < 30s

## Known issues / decisions for the next agent

1. **Phase 8 quirk** — Sonnet agent edited the main repo via absolute paths instead of its worktree. Self-corrected (committed to `015-rune-codegen-zod` directly via `c9842d2` + `02d9223`). Phase 8b's brief was hardened against this; if you dispatch any further worktree agents, reuse Phase 8b's "stay in worktree, use relative paths" preamble.

2. **Phase 7 / Phase 8 conflict** — both modified `packages/codegen/src/generator.ts` to add a target dispatch case. Resolved at merge time by combining both branches (now all three target arms route from one switch). See merge commit `3b385a1`.

3. **SC-009 fidelity matrix** — Phase 8b's task T129 calls for a 100-case CDM-func battery. The curated CDM fixtures (`packages/curated-schema/fixtures/cdm/`) contain **zero** Rune `func` declarations, so 96/100 cases are `.todo` with a coverage-gap comment. The 4 active cases (add-two / accumulator / alias-func / recursive) cover the implementation paths (`set`/`add`/`alias`/recursion). Closing SC-009 to 100 cases is **not** Phase 9 work — it's a fixture-curation task that needs CDM funcs to be added to `packages/curated-schema/fixtures/cdm/`. Document as a follow-up if you want the bar fully met.

4. **Phase 8b oxfmt drift risk** — the agent didn't get linter/formatter feedback on the new `ts-emitter.ts` func-emission path. If a fresh `pnpm --filter @rune-langium/codegen test` shows fixture-diff failures after a `pnpm install` triggers a lint pass, the fix is the same as Phase 3's: align the emitted output with oxfmt's `arrowParens: always`, `trailingComma: none`, `singleQuote: true`, `printWidth: 100`. No fixture inputs change; only the emitter's string templates.

5. **Worktree branches** — there are several `worktree-agent-*` branches still around from Phases 2/3/4/5/7/8b. They're harmless (unmerged, point at older commits). Cleanup: `git worktree list` then `git worktree remove --force` + `git branch -D` for each one before final PR.

## Operational

- **Pre-commit hook**: `pnpm lint-staged` (oxfmt + oxlint --fix on staged `*.{ts,tsx,js,jsx,json,md}`). Don't bypass.
- **Pre-push hook**: `pnpm run type-check`. Load-bearing; must stay green.
- **TDD discipline**: every implementation task pairs with a RED test that fails first. Use `pnpm --filter @rune-langium/codegen test <pattern>` to scope.
- **Subagent-driven**: dispatch each phase to a Sonnet agent in an isolated worktree. Brief them with the phase task list, the `commit-before-reporting` protocol, and the "stay in worktree, use relative paths" rule. Phase 8b's brief is the canonical template.

## Final acceptance gate

When all 138 tasks are `[X]`:

```bash
pnpm -r test                                     # ≥1416 baseline + ~360 codegen
pnpm -r run type-check                           # exit 0
pnpm --filter @rune-langium/codegen test         # all green; .todo only on
                                                 # SC-009 fixture-coverage gap
time pnpm rune-codegen packages/curated-schema/fixtures/cdm/ \
     --target zod -o /tmp/cdm-out/               # < 30s
```

Then open the PR. Title suggestion:
> `feat(015): Rune-Langium native code generators (Zod / JSON Schema / TS class / funcs)`

The PR is large — squash-merging onto master is fine since the feature ships as one logical unit.
