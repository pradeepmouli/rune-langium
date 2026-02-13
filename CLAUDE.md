# Project Conventions

## Skills

When installing or creating new skills, always:
1. Place the canonical copy in `.agents/skills/<skill-name>/`
2. Create a relative symlink from `.github/skills/<skill-name>` -> `../../.agents/skills/<skill-name>`

This ensures skills are discoverable from both `.agents/skills/` and `.github/skills/` without duplication.

## Active Technologies
- TypeScript 5.9+ (strict mode, ESM) (002-reactflow-visual-editor)
- Browser-only; File System Access API for standalone app, no backend (002-reactflow-visual-editor)

## Recent Changes
- 002-reactflow-visual-editor: Added TypeScript 5.9+ (strict mode, ESM)
