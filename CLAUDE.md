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
