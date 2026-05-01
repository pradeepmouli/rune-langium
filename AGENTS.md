# Agent Guide

This repository is designed for multi-agent collaboration (Copilot, Claude, Gemini, Codex). Use this guide to stay consistent when automating tasks.

## Project Metadata
- Name: rune-langium
- Language: TypeScript (pnpm workspaces)
- Tooling: pnpm, oxlint, oxfmt, Vitest, simple-git-hooks, lint-staged

## Ground Rules
- Prefer non-destructive changes; never reset user work.
- Follow conventional commits.
- Keep formatting consistent with .editorconfig and .oxfmtrc.json.
- Run pnpm run lint and pnpm test after code changes when practical.
- Keep docs current when changing scripts or workflows.

## Workflow Checklist
1) Install deps: pnpm install
2) Lint: pnpm run lint
3) Test: pnpm test
4) Format: pnpm run format (or pnpm run format:check)
5) Type-check (if added): pnpm run type-check

## Coding Standards
- Keep public API docs concise; avoid documenting internals.
- Use vitest for tests; add coverage for public APIs.

## Agent-Specific Notes
- Coordinate with other agents by updating docs (README, specs) when workflows change.
- When modifying scripts, explain any new prompts or defaults in relevant documentation.
- If adding hooks, prefer simple-git-hooks and lint-staged already in package.json.
- For Studio, the primary LSP path is the embedded browser worker transport; direct WebSocket and Cloudflare Worker LSP are fallbacks, and an explicit `wsUri` selects the direct WebSocket path.
- Real corpus fixtures live under the hidden `.resources/` tree. Prefer those files for repros, and guard/skip tests that rely on them when the corpus is unavailable in the checkout.
- In Studio Playwright tests, avoid `waitForLoadState('networkidle')` on routes with persistent worker/LSP traffic; wait for visible UI readiness signals instead.

## Deliverables Expectation
- Summaries should include what changed, where, and how to verify.
- For automation runs, report commands executed and their results.

## Active Technologies
- TypeScript 5.x (strict mode) + React 19 (peer), React Hook Form 7+ (peer), Zod v4 (peer), (013-z2f-editor-migration)
- N/A (in-memory editor state; persistence handled by the graph store (013-z2f-editor-migration)
- TypeScript 5.x strict mode, React 19, Vite 8 + `dockview-react`, CodeMirror 6, `@rune-langium/codegen`, `@rune-langium/core`, `@rune-langium/visual-editor`, React Hook Form 7, Zod v4, `@zod-to-form/*` where reusable for rendering metadata (016-studio-form-preview)
- Workspace metadata and saved layouts persist in IndexedDB while browser workspace files live in OPFS; form preview sample state is in-memory only (016-studio-form-preview)

## Recent Changes
- 013-z2f-editor-migration: Added TypeScript 5.x (strict mode) + React 19 (peer), React Hook Form 7+ (peer), Zod v4 (peer),

<!-- SPECKIT START -->
## Active Spec Kit Plan
- 016-studio-form-preview: `specs/016-studio-form-preview/plan.md`
<!-- SPECKIT END -->
