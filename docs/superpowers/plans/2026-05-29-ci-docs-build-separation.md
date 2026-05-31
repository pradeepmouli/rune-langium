# CI Docs Build Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `@rune-langium/docs` from the PR CI critical path by adding a `build:ci` root script and wiring it into the `lint-and-test` job.

**Architecture:** Add one root script to `package.json` that mirrors `build` but excludes both `@rune-langium/docs` **and** the root workspace package `rune-langium` (whose own `build` re-runs the unfiltered recursion — see Step 1). Update `ci.yml` to call `build:ci` instead of `build`. Cloudflare Pages continues to build docs at deploy time via `build:combined` — no CI docs job needed.

**Tech Stack:** pnpm workspace filters, GitHub Actions YAML.

---

### Task 1: Add `build:ci` root script and update CI

**Files:**
- Modify: `package.json:36`
- Modify: `.github/workflows/ci.yml:61`

- [ ] **Step 1: Add `build:ci` to `package.json`**

Open `package.json`. Find the `"build"` script (line 36):
```json
"build": "pnpm -r run build",
```
Add `build:ci` immediately after it:
```json
"build": "pnpm -r run build",
"build:ci": "pnpm -r --filter=!@rune-langium/docs --filter=!rune-langium run build",
```

> **Both exclusions are required.** `pnpm-workspace.yaml` lists `'.'` as a
> workspace package, so the repo root `rune-langium` is part of the `-r`
> recursion — and its own `build` script is `pnpm -r run build` (unfiltered).
> Excluding only docs leaves the root in scope; the root then re-runs the full
> unfiltered build, rebuilding docs anyway and building every leaf twice. The
> `--filter=!rune-langium` exclusion is what actually keeps docs out and avoids
> the nested double-build (see PR #263).

- [ ] **Step 2: Verify the script works locally**

Run:
```bash
pnpm run build:ci
```
Expected: all packages build successfully, `@rune-langium/docs` is NOT built (no typedoc or vitepress output appears). The build should complete faster than `pnpm run build`.

- [ ] **Step 3: Update `ci.yml` to use `build:ci`**

Open `.github/workflows/ci.yml`. Find the Build step (line 61):
```yaml
      - name: Build
        run: pnpm run build
```
Change it to:
```yaml
      - name: Build
        run: pnpm run build:ci
```

- [ ] **Step 4: Commit**

```bash
git add package.json .github/workflows/ci.yml
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "ci: exclude docs from PR build to reduce wall-clock time

pnpm run build is pnpm -r run build which includes @rune-langium/docs
(typedoc + vitepress) on every PR. Docs are already built by Cloudflare
Pages at deploy time via build:combined — no need to build them in CI.

Add build:ci script that mirrors build but filters out @rune-langium/docs
AND the root package rune-langium (whose build re-runs the unfiltered
recursion, which would otherwise rebuild docs and every leaf twice).
Wire ci.yml lint-and-test job to use build:ci."
```

- [ ] **Step 5: Verify CI passes**

Push the branch and confirm the `lint-and-test` job passes. The Build step should complete faster. Docs are not built during the PR run.

```bash
git push
```

Then check: `gh pr checks <PR-number>` — `lint-and-test` should be green.
