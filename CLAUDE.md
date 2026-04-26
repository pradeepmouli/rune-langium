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
- TypeScript 5.9+ (studio, worker, container HTTP wrapper) / Java 21 (codegen CLI, already in use via `rosetta-code-generators`) + `@rune-langium/codegen` (existing), Cloudflare Workers, Cloudflare Containers (beta), `@cloudflare/workers-types`, `wrangler` 4, CF Turnstile (`@marsidev/react-turnstile` or equivalent), CF Durable Objects, `rosetta-code-generators` (existing Maven build) (011-export-code-cf)
- CF Durable Object for per-IP rate-limit counters (hour + day buckets); container is stateless (no disk writes beyond `/tmp`) (011-export-code-cf)
- TypeScript 5.9 (strict mode, ESM) for all browser + Worker code; Java 21 unchanged for the existing codegen container (untouched by this feature). + React 19, `dockview-react` (new), `@zod-to-form/{core,react,vite}` 0.7.x / 0.2.x (upgrade), `isomorphic-git` 1.37 (existing, retained for arbitrary-URL + git-backed workspaces), `pako` (new — gzip), small custom tar parser or `tar-stream` (new), `idb` (existing), Tailwind CSS 4 (existing), VitePress (existing for docs), Cloudflare Workers + R2 + Durable Objects + Cron Triggers. (012-studio-workspace-ux)
- OPFS (Origin Private File System) for workspace files + git object stores; IndexedDB for workspace metadata, recent-workspaces, settings, and serialised FSA folder handles. R2 for the curated-mirror archives. Durable Object storage for telemetry counters (per-day instances). No D1, no KV. (012-studio-workspace-ux)
- TypeScript 5.9 (strict mode, ESM) for all new (014-studio-prod-ready)

## Recent Changes
- 002-reactflow-visual-editor: Added TypeScript 5.9+ (strict mode, ESM)

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
