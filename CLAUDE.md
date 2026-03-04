# Project Conventions

## Skills

When installing or creating new skills, always:
1. Place the canonical copy in `.agents/skills/<skill-name>/`
2. Create a relative symlink from `.github/skills/<skill-name>` -> `../../.agents/skills/<skill-name>`

This ensures skills are discoverable from both `.agents/skills/` and `.github/skills/` without duplication.

## Active Technologies
- TypeScript 5.9+ (strict mode, ESM) (002-reactflow-visual-editor)
- Browser-only; File System Access API for standalone app, no backend (002-reactflow-visual-editor)
- TypeScript 5.9+ (strict mode, ESM) + React 19, @xyflow/react 12, zustand 5, zundo 2 (undo/redo), @rune-langium/core (parser, AST types), @rune-langium/design-system (theme, tokens, UI primitives), @radix-ui/* (popover, collapsible, tabs, tooltip, scroll-area), class-variance-authority (CVA), cmdk (command palette), lucide-react (icons), Tailwind CSS 4 (claude/rune-expression-builder-G0SFR)
- N/A (browser-only, in-memory expression tree state) (claude/rune-expression-builder-G0SFR)

## Recent Changes
- 002-reactflow-visual-editor: Added TypeScript 5.9+ (strict mode, ESM)
