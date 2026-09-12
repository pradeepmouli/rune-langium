# Development Workflow

## Commands and Hooks

Read root and affected-package `package.json` scripts before choosing commands.
Use the pinned pnpm version and preserve overrides/patches in
`pnpm-workspace.yaml` during dependency changes.

- The pre-commit hook runs `lint-staged`, formatting staged JS/TS/JSON-family files with oxfmt. The pre-push hook runs type checking. Prefer the existing `simple-git-hooks` / `lint-staged` setup for hook changes.
- `SKIP_SIMPLE_GIT_HOOKS=1` bypasses hooks; report skipped verification when relevant.
- After codegen render changes, run `pnpm --filter @rune-langium/codegen run build` so consumers receive updated dist output.

## Generated Sources

Do not hand-edit generated AST, Zod, editable-domain, or conformance files.
Change the grammar, generator inputs/configuration, or authoritative generator,
then regenerate the affected surface:

```bash
pnpm --filter @rune-langium/core run generate
pnpm --filter @rune-langium/core run generate:zod
pnpm --filter @rune-langium/core run generate:domain
pnpm --filter @rune-langium/visual-editor run generate:schemas
pnpm --filter @rune-langium/codegen run generate:sql-node-types
```

Run only the generators affected by the change.
`langium-zod` is exactly pinned in workspace overrides and core/visual-editor
manifests; update those together if deliberately upgrading the generator.
SQL node types derive from the exactly pinned `@l1xnan/tree-sitter-sql` grammar.

## Testing and Editor Setup

- Use Vitest for public APIs and shared architecture seams. Prefer focused package checks for isolated changes; broaden for affected consumers.
- Real CDM/Rune/FpML fixtures live under hidden `.resources/`. Prefer them for corpus repros, and guard or skip corpus-dependent tests when absent.
- Studio Playwright tests must wait for visible readiness, not `networkidle`, when workers or LSP traffic remain active.
- Production smoke: `pnpm --filter @rune-langium/studio run test:prod-smoke`. Endpoint and fuller UX checks are documented in [TESTING.md](../TESTING.md).
- Tailwind IntelliSense uses `.vscode/settings.json`: `tailwindCSS.experimental.configFile` maps `apps/studio/src/app.css` to Studio, design-system, and visual-editor source trees.

## Shared Agent Configuration

- Keep Claude plugin preferences in `.claude/settings.json`; do not copy Claude hook or permission syntax into Codex configuration. Preserve ignored local settings and machine-specific MCP registrations.
- Infigraph is supplied through the active agent environment. Check tool availability before adding a duplicate project MCP server. `.mcp.json` currently configures Playwright.
- For new skills, put the canonical copy in `.agents/skills/<skill-name>/` and a relative symlink at `.github/skills/<skill-name>` pointing to `../../.agents/skills/<skill-name>`.

## Comment Review

Requires the `ast-grep` CLI on PATH. The audit is read-only:

```bash
pnpm run audit:comments
node scripts/audit-comments.mjs --json > /tmp/rune-comment-audit.json
node scripts/audit-comments.mjs packages/codegen/src
pnpm run test:comment-audit
```

`rules/comment-audit.yml` queries comment nodes in TypeScript, TSX, and JavaScript,
including JSDoc. The reporter groups consecutive line comments only when no code
separates them. It selects multiline groups and comments mentioning spec/issue
references or historical phrases, ranking references/history before length.

The default scope is `apps` and `packages`. Scripts, generated directories,
tests, fixtures, dependencies, and dist output are excluded. Comments containing
license, compiler, linter, coverage, or instrumentation directives are also
excluded. These exclusions favor retaining directives over finding every comment.

Matches are review candidates, not violations. Keep API contracts, format tables,
and security/lifecycle constraints. Remove planning or review history and comments
that merely repeat the code; preserve substantive rationale when shortening.
There is no autofix or commit gate. `sgconfig.yml` uses repository-relative paths.

## Source Audit

Oxlint uses `oxlint.config.ts` with `defineConfig` from `oxlint`. The old
`oxlintrc.json` name was not discovered by the CLI, and its nested rule names were
invalid. Newly activated import/type-style rules start as warnings so existing
findings do not block unrelated work. Nested package configurations still apply
to normal `pnpm run lint`.

```bash
pnpm run audit:source
pnpm exec oxlint --config oxlint.audit.config.ts --disable-nested-config apps packages --format json
```

The audit enables type-aware assertion/union checks through `oxlint-tsgolint`,
plus selected redundant-control-flow and spread rules. Build workspace dependencies
first when declaration output is missing or stale. Tests, scripts, fixtures,
dependencies, and build output are excluded. Generated source is included for
review; fix its authoritative generator rather than applying fixes to generated
files. Codegen golden outputs may need regeneration when generator output changes.

Treat diagnostics as review candidates. Apply only reviewed rule-specific safe
fixes, then run type checking and affected tests. An assertion removal should not
change emitted JavaScript. The typed configuration format is experimental in the
installed Oxlint CLI and runs through its Node entry point (`pnpm exec oxlint`).

## Copilot CLI Language Server

`.github/lsp.json` starts the workspace TypeScript 7 native LSP with
`pnpm exec tsc --lsp --stdio`; the root `lsp.json` is a compatibility symlink.
Run `pnpm install` first. TSX/JSX use their React language IDs. The Rust server
entry is preserved and requires `rust-analyzer` on PATH.

After changing the config, exit and relaunch Copilot CLI, then run `/lsp` to
check status. This config does not add an LSP tool to an already-running Codex
session. The native server can also be queried over standard LSP stdio.
