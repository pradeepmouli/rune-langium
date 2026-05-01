# rune-langium Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-14

## Active Technologies

- TypeScript 5.9, React 19.2, Tailwind CSS v4 + `@xyflow/react ^12.10`, `zustand ^5.0.11`, `zundo ^2.3`, shadcn/ui (CVA + Radix), `@rune-langium/core` (Langium AST), `@rune-langium/design-system` (tokens + theme.css), `lucide-react` (004-editor-forms)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.9, React 19.2, Tailwind CSS v4: Follow standard conventions

## Recent Changes

- 004-editor-forms: Added TypeScript 5.9, React 19.2, Tailwind CSS v4 + `@xyflow/react ^12.10`, `zustand ^5.0.11`, `zundo ^2.3`, shadcn/ui (CVA + Radix), `@rune-langium/core` (Langium AST), `@rune-langium/design-system` (tokens + theme.css), `lucide-react`

<!-- MANUAL ADDITIONS START -->
- This repository is a pnpm monorepo rooted at `apps/`, `packages/`, `specs/`, and `.resources/`; prefer `pnpm run lint` and `pnpm test` from the repo root over `npm` commands.
- Studio prefers the embedded browser LSP worker transport first; direct WebSocket and Cloudflare Worker LSP are fallbacks, and an explicit `wsUri` should select the direct WebSocket path.
- Real corpus fixtures live under `.resources/`; use them for repros and guard/skip tests that depend on them when the corpus is absent from the checkout.
- Studio Playwright tests should wait for visible UI readiness instead of `networkidle` on routes with persistent worker/LSP traffic.
<!-- MANUAL ADDITIONS END -->
