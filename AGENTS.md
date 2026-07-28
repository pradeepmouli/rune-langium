# Agent Guide

This repository is designed for multi-agent collaboration (Copilot, Claude, Gemini, Codex). Use this guide to stay consistent when automating tasks.

## Project Metadata

- Name: rune-langium
- Language: TypeScript (pnpm workspaces)
- Tooling: pnpm, oxlint, oxfmt, Vitest, simple-git-hooks, lint-staged

## Ground Rules

- Prefer non-destructive changes; never reset user work.
- Follow conventional commits.
- Keep formatting consistent with `.editorconfig` and `.oxfmtrc.json`.
- Keep docs and durable repo memory current when architecture or workflows change.

## Workflow Checklist

1. Install deps: `pnpm install`
2. Lint: `pnpm run lint`
3. Test: `pnpm test`
4. Format: `pnpm run format` (or `pnpm run format:check`). Staged `*.{ts,tsx,js,jsx,mjs,cjs,json,jsonc}` files are also auto-formatted with `oxfmt` on commit via the `lint-staged` pre-commit hook, so a normal `git commit` formats what you staged. (`SKIP_SIMPLE_GIT_HOOKS=1` bypasses the hook.)
5. Type-check: `pnpm run type-check`
6. For codegen-only changes, prefer `pnpm --filter @rune-langium/codegen test` and `pnpm --filter @rune-langium/codegen run type-check`

## Coding Standards

- Keep public API docs concise; avoid documenting internals.
- Use Vitest for tests; add coverage for public APIs and shared architecture seams.

## Agent-Specific Notes

- When modifying scripts or workflows, update the relevant docs and memory files in the same change.
- If adding hooks, prefer `simple-git-hooks` and `lint-staged` already configured in `package.json`.
- For Studio, the primary LSP path is the embedded browser worker transport; direct WebSocket and Cloudflare Worker LSP are fallbacks, and an explicit `wsUri` selects the direct WebSocket path.
- Tailwind CSS 4 IntelliSense in this monorepo relies on `.vscode/settings.json` using `tailwindCSS.experimental.configFile` with `apps/studio/src/app.css` as the entry stylesheet mapped to `apps/studio/src/**`, `packages/design-system/src/**`, and `packages/visual-editor/src/**`.
- Real corpus fixtures live under the hidden `.resources/` tree. Prefer those files for repros, and guard/skip tests that rely on them when the corpus is unavailable in the checkout.
- In Studio Playwright tests, avoid `waitForLoadState('networkidle')` on routes with persistent worker/LSP traffic; wait for visible UI readiness signals instead.
- Codegen now walks each namespace once in `packages/codegen/src/emit/namespace-walker.ts`; emitters consume the readonly walk result and own their own diagnostics/source maps. Keep TS-only func extraction in the TypeScript emitter unless behavior intentionally changes across targets.

## Deliverables Expectation

- Summaries should include what changed, where, and how to verify.
- For automation runs, report commands executed and their results.

## Current Stack

- TypeScript 5.9+ (strict mode, ESM) + React 19
- Studio/UI: `@xyflow/react` 12, `dockview-react`, zustand 5, zundo 2, Tailwind CSS 4, Radix UI, CodeMirror 6
- Language/tooling: Langium 4.2.x, Zod v4, `@rune-langium/core`, `@rune-langium/codegen`, `@rune-langium/visual-editor`
- Storage/runtime: browser-only app, OPFS for workspace files, IndexedDB for metadata/cache/layouts

<!-- infigraph-instructions -->
# Infigraph — Code Intelligence

This project is indexed by Infigraph. Use Infigraph tools FIRST for all code tasks. Fall back to grep/read only if Infigraph returns nothing or for non-code files.

## Rules
1. Check `list_projects` before indexing — don't re-index
2. **`search`** for ALL code search — hybrid BM25+vector+grep in one call, auto-escalates
3. **`get_doc_context`** before editing any function — returns source+callers+callees in one call
4. **`trace_callers`** / **`find_all_references`** before refactoring — never grep for callers
5. **`trace_callees`** / **`transitive_impact`** for blast radius — never manually trace call chains
6. Read files directly only for non-code files (configs, docs, manifests) or edit tool line-number context

## Workflows
- **Find code:** `search` → if need symbol detail: `get_code_snippet` or `symbol_context`
- **Before editing:** `get_doc_context`
- **Before refactoring:** `find_all_references` → `transitive_impact` → edit
- **Onboarding:** `index_project` → `get_architecture` → `get_stats`
- **Multi-repo:** `group_create` → `group_add` × N → `group_index` → `group_sync` → `group_link`

> Each tool description says what it replaces — check descriptions when unsure which tool to use.

## Session Continuity — MANDATORY
- **On session start:** MUST call `get_latest_session` to resume prior context
- **After context compaction:** if you see "continued from a previous conversation" or a compaction summary, IMMEDIATELY call `save_session` with whatever context survived before doing anything else
- **MUST call `save_session` IMMEDIATELY (before responding to the user)** when ANY of these occur. No session-end signal exists — if you don't save now, context is lost forever:
  1. **Finding** — root cause identified, discovered a bug, learned how something works
  2. **Milestone** — bug fixed and verified, feature committed, test passing, build green
  3. **Decision** — chose an approach, ruled something out, changed strategy
  4. **Task done** — any pending task from a prior session is completed
  5. **Periodic** — if you have NOT called `save_session` in the last 5 exchanges with the user, call it NOW regardless of whether anything dramatic happened. This is a hard rule, not a suggestion.
- Do NOT defer saves ("I'll save later"). Do NOT batch them. Do NOT wait for user to ask.
- "Later" does not exist — context compaction or session end can happen at any moment.
- Same-day saves merge: summary/pending_tasks overwrite, decisions append, files_touched union
- **Narrative dumps:** On every `save_session`, include `narrative` field with full session story — what was explored, found, reasoned, decided, and why. Chronological prose, not terse bullets. Written to `.infigraph/sessions/session_YYYY-MM-DD.md` and embedded for semantic search. On session start, if `get_latest_session` shows a narrative log path, read it when structured fields aren't enough context.

<!-- infigraph-instructions -->