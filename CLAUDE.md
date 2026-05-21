# Project Conventions

## Skills

When installing or creating new skills, always:
1. Place the canonical copy in `.agents/skills/<skill-name>/`
2. Create a relative symlink from `.github/skills/<skill-name>` -> `../../.agents/skills/<skill-name>`

This keeps skills discoverable from both locations without duplication.

## Core Stack

- TypeScript 5.9+ (strict mode, ESM) in a pnpm workspace monorepo
- Studio/UI: React 19, `@xyflow/react` 12, `dockview-react`, zustand 5, zundo 2, Tailwind CSS 4, Radix UI, CodeMirror 6
- Language/tooling: Langium 4.2.x, Zod v4, `@rune-langium/core`, `@rune-langium/codegen`, `@rune-langium/visual-editor`
- Browser persistence: OPFS for workspace files, IndexedDB for workspace metadata, caches, settings, and layouts
- Codegen server/container paths still depend on Java 21 + `rosetta-code-generators`

## Current Repo-Wide Notes

- Studio prefers the embedded browser LSP worker transport first; direct WebSocket and Cloudflare Worker LSP remain fallbacks, and an explicit `wsUri` selects the direct WebSocket path.
- Real CDM/source fixtures live under the hidden `.resources/` tree. Use those files for runtime repros, and guard/skip tests that depend on them when the corpus is absent.
- Studio Playwright flows should wait for visible UI readiness rather than `networkidle` on routes that keep worker/LSP connections open.
- Codegen is now split between a shared namespace walker and language-specific emitters. `packages/codegen/src/generator.ts` walks each namespace once via `packages/codegen/src/emit/namespace-walker.ts`, then passes a readonly `NamespaceWalkResult` to the Zod, TypeScript, and JSON Schema emitters.
- Target-specific output paths are centralized in `getTargetRelativePath`, while TypeScript-only func extraction stays in `packages/codegen/src/emit/ts-emitter.ts` so non-TS targets do not pick up func diagnostics.
- Useful validation commands: `pnpm run lint`, `pnpm test`, `pnpm run type-check`; for codegen-only work prefer `pnpm --filter @rune-langium/codegen test` and `pnpm --filter @rune-langium/codegen run type-check`.

## Recent Changes

- Codegen cleanup: shared namespace walking was extracted so emitters focus on target-specific output; regression coverage lives in `packages/codegen/test/namespace-walker.test.ts`.

## Licensing Boundary

This repo uses split licensing:
- `packages/` = MIT
- `apps/studio/` = FSL-1.1-ALv2

When creating new source files, always include the correct SPDX header for the directory.
Never refer to the studio as "open source" — it is "source-available."

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

## graphify

This project may have a generated knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

Rules:
- IF `graphify-out/GRAPH_REPORT.md` exists, read it before reading source files, running grep/glob searches, or answering codebase questions. When present, treat the graph as your primary map of the codebase.
- IF `graphify-out/wiki/index.md` exists, navigate it instead of reading raw files.
- IF the graph exists, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep for cross-module "how does X relate to Y" questions — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files.
- After modifying code, run `graphify update .` to keep the graph current when `graphify` is available and the repo is using the graph workflow.
