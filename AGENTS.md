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
- Codegen server/container paths still depend on Java 21 + `rosetta-code-generators`

## Recent Changes

- Codegen cleanup: extracted shared namespace walking and target path helpers so Zod/TS/JSON Schema emitters stay language-specific; covered by `packages/codegen/test/namespace-walker.test.ts`.

<!-- SPECKIT START -->
## Active Spec Kit Plan

- 016-studio-form-preview: `specs/016-studio-form-preview/plan.md`
<!-- SPECKIT END -->
