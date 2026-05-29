# CI Docs Build Separation Design

## Goal

Remove `@rune-langium/docs` from the PR CI critical path to reduce wall-clock time on every pull request.

## Context

`pnpm run build` is `pnpm -r run build` — it builds all workspaces recursively, including `@rune-langium/docs` which runs typedoc + VitePress. This adds meaningful wall-clock time to every PR even when docs are unrelated to the change.

Cloudflare Pages already builds and deploys docs automatically on every push to master via the `build:cloudflare` root script (`pnpm --filter @rune-langium/docs run build:combined`). There is no need for CI to also build docs.

## Decision

**Exclude `@rune-langium/docs` from the recursive build in `ci.yml`.**

No separate docs CI job is needed. Cloudflare Pages serves as the docs build validator post-merge. TypeDoc/VitePress errors are acceptable to catch at deploy time rather than on every PR, since they do not affect studio correctness.

## Architecture

Single change in `.github/workflows/ci.yml`, `lint-and-test` job:

**Before:**
```yaml
- name: Build
  run: pnpm run build
```

**After:**
```yaml
- name: Build
  run: pnpm run build --filter=!@rune-langium/docs
```

Or equivalently, add a root script to `package.json`:
```json
"build:ci": "pnpm -r --filter=!@rune-langium/docs run build"
```
and use `pnpm run build:ci` in CI. This is preferred — self-documenting, easier to grep.

## What stays the same

- Cloudflare Pages build: unchanged, already runs `build:combined` on push to master
- `pnpm run type-check`: already skips docs (no `type-check` script in `@rune-langium/docs`)
- `pnpm run test`: already skips docs (no tests)
- `studio-a11y`, `check-generated`, `fixture-diff` jobs: all already scoped, untouched

## Risk

Docs build errors (broken typedoc config, VitePress misconfiguration) are only caught post-merge when Cloudflare's build fails. Acceptable: docs errors are cosmetic and don't affect studio or library correctness. Cloudflare build failures are visible and actionable.

## No-ops considered and rejected

- **Separate docs CI job on master push:** redundant with Cloudflare Pages deploy. Adds complexity with no benefit.
- **Commit generated API docs (`api/`):** adds diff noise to every PR touching TypeScript, requires contributor discipline to regenerate. YAGNI.
- **Path-filtered docs CI job:** still blocks PRs when `packages/core/` changes (frequent). More complex job graph for marginal benefit.
