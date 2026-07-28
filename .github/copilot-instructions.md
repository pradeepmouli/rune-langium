# Project Conventions

## Skills

When installing or creating new skills, always:
1. Place the canonical copy in `.agents/skills/<skill-name>/`
2. Create a relative symlink from `.github/skills/<skill-name>` -> `../../.agents/skills/<skill-name>`

This ensures skills are discoverable from both `.agents/skills/` and `.github/skills/` without duplication.

## Active Technologies
- TypeScript 5.9+ (strict mode, ESM), React 19, @xyflow/react 12, zustand 5, zundo 2 (undo/redo), @rune-langium/core (parser, AST types), @rune-langium/design-system (theme, tokens, UI primitives), @radix-ui/*, class-variance-authority (CVA), cmdk, lucide-react, Tailwind CSS 4
- Browser-only; File System Access API for standalone app, no backend
- TypeScript 5.9+ (strict mode, ESM) + React 19, @xyflow/react 12, zustand 5, @tanstack/react-virtual (new), @radix-ui/*, Tailwind CSS 4 (refactor/001-optimize-ui-performance)
- N/A (browser-only, File System Access API) (refactor/001-optimize-ui-performance)
- TypeScript 5.9+ (strict mode, ESM) + React 19, @xyflow/react 12, zustand 5, zundo 2, langium 4.2.1, zod 4.3.6, @zod-to-form/cli 0.2.7, langium-zod 0.5.3, isomorphic-git (new), idb (new), commander 14 (008-core-editor-features)
- IndexedDB (via idb) for model caching; in-memory for workspace state (008-core-editor-features)

## Recent Changes
- 002-reactflow-visual-editor: Added TypeScript 5.9+ (strict mode, ESM)

## Current Repo-Wide Notes
- Studio prefers the embedded browser LSP worker transport first; direct WebSocket and Cloudflare Worker LSP are fallbacks, and an explicit `wsUri` should select the direct WebSocket path.
- Real corpus fixtures live under the hidden `.resources/` tree. Prefer those files for runtime repros, and guard/skip tests that rely on them when the corpus is not present.
- Studio Playwright tests should wait for visible UI readiness instead of `networkidle` on routes with persistent worker/LSP traffic.

## Licensing Boundary

This repo uses split licensing:
- `packages/` = MIT
- `apps/studio/` = FSL-1.1-ALv2

When creating new source files, always include the correct SPDX header for the directory.
Never refer to the studio as "open source" — it is "source-available."


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