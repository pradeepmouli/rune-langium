#!/usr/bin/env node
/**
 * Combined build for Cloudflare Pages — produces a single tree at
 * `apps/docs/.vitepress/dist/` containing:
 *
 *   _redirects                    → SPA fallback for /rune-studio/studio/*
 *   rune-studio/                  → public subpath (www.daikonic.dev/rune-studio/)
 *     ├── <site/*>                → static landing page from `site/`
 *     ├── docs/                   → VitePress docs (base='/rune-studio/docs/')
 *     └── studio/                 → Rune Studio SPA (base='/rune-studio/studio/')
 *
 * In ADDITION, the build writes two files at the REPO ROOT (both gitignored)
 * that CF Pages git-integration picks up automatically:
 *
 *   <repo>/functions/             → Pages Functions copied from
 *                                   apps/studio/functions/ (spec 019). CF
 *                                   Pages scans <Root Directory>/functions/
 *                                   for routes-based Functions; with default
 *                                   Root Directory = "/", that's the repo
 *                                   root. Placing them inside the build
 *                                   output dir does NOT work for git-
 *                                   integration deploys (only for direct
 *                                   `wrangler pages deploy` uploads).
 *   <repo>/wrangler.toml          → compat flags + LSP_SESSION DO binding +
 *                                   ALLOWED_ORIGIN var. Takes precedence
 *                                   over dashboard config for the keys it
 *                                   defines (per CF Pages docs, deploy-root
 *                                   wrangler.toml merges with dashboard
 *                                   settings).
 *
 * Both sub-builds run with CF_PAGES=1 so their configs pick the right base.
 * CF Pages' git integration points at `apps/docs/.vitepress/dist/` as the
 * output directory; no GitHub Actions workflow is required.
 *
 * REQUIRED CF Pages dashboard configuration (one-time, spec 019 Phase 1):
 *   - Durable Object namespace selection: bind LSP_SESSION → existing
 *     rune-lsp-worker Worker (class: RuneLspSession). The CF dashboard
 *     namespace picker has no CLI equivalent.
 *     See https://developers.cloudflare.com/pages/functions/bindings/#durable-objects
 *   - Secret: SESSION_SIGNING_KEY = <random 32-byte base64> for BOTH
 *     production AND preview environments. Set via:
 *       pnpm wrangler pages secret put SESSION_SIGNING_KEY \
 *         --project-name=daikonic-dev --environment=preview
 *       pnpm wrangler pages secret put SESSION_SIGNING_KEY \
 *         --project-name=daikonic-dev --environment=production
 *
 * (Compat flag + ALLOWED_ORIGIN var + DO binding script_name come from the
 * generated <repo>/wrangler.toml; no dashboard touch needed for those.)
 *
 * apps/lsp-worker/ remains deployed even after spec 019's Phase 2 cutover —
 * CF Pages cannot host DOs. Phase 3 (deferred) was originally "delete
 * apps/lsp-worker entirely"; that's now a narrower "strip its HTTP routes;
 * keep the DO export."
 *
 * apps/studio/wrangler.toml is the LOCAL-DEV-only config (for `pnpm
 * dev:pages` against apps/studio/functions/); it's not used by the CF
 * Pages deploy.
 */

import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(__dirname, '..');
const repoRoot = resolve(docsRoot, '..', '..');

const siteRoot = join(repoRoot, 'site');
const studioDist = join(repoRoot, 'apps', 'studio', 'dist');
const studioFunctionsSrc = join(repoRoot, 'apps', 'studio', 'functions');
const docsRawDist = join(docsRoot, '.vitepress', 'dist-docs-raw');
const combinedDist = join(docsRoot, '.vitepress', 'dist');
const subpathDist = join(combinedDist, 'rune-studio');
// CF Pages scans <Root Directory>/functions/ for routes-based Functions, where
// Root Directory defaults to "/" (the repo root). The deploy-root wrangler.toml
// also has to live at the repo root for CF Pages git-integration to apply its
// settings during deploy. Both are gitignored at the repo root because they're
// regenerated on every build.
const repoFunctions = join(repoRoot, 'functions');
const repoWranglerToml = join(repoRoot, 'wrangler.toml');

const env = {
  ...process.env,
  CF_PAGES: '1',
  // Studio nav links — baked in so they resolve under /rune-studio/ at runtime
  // regardless of window.location.origin.
  VITE_HOME_URL: '/rune-studio/',
  VITE_DOCS_URL: '/rune-studio/docs/',
  VITE_GITHUB_URL: 'https://github.com/pradeepmouli/rune-langium',
  // Hosted codegen service (feature 011-export-code-cf). Base URL is
  // same-origin so the browser never makes cross-origin calls during
  // Export Code. The Turnstile site key can be provided via env at build
  // time; falls back to Turnstile's documented "always-pass" dummy key
  // so preview builds never break for lack of a real key. Production
  // deploys MUST set TURNSTILE_SITE_KEY in the CF Pages build env.
  VITE_CODEGEN_URL: process.env.VITE_CODEGEN_URL ?? '/rune-studio',
  VITE_TURNSTILE_SITE_KEY:
    process.env.VITE_TURNSTILE_SITE_KEY ??
    process.env.TURNSTILE_SITE_KEY ??
    '1x00000000000000000000AA'
};

function run(label, command, cwd) {
  console.log(`\n[build-combined] ${label}`);
  console.log(`[build-combined] $ ${command}  (cwd: ${cwd})`);
  execSync(command, { cwd, env, stdio: 'inherit' });
}

function copyDir(from, to, label) {
  if (!existsSync(from)) {
    throw new Error(`[build-combined] missing source: ${from}`);
  }
  // Ensure only the parent of `to` exists; cpSync creates `to` itself and
  // copies `from`'s contents into it. Pre-creating `to` can cause some Node
  // versions to nest the source under `to/<basename(from)>`.
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`[build-combined] copied ${label}: ${from} → ${to}`);
}

rmSync(combinedDist, { recursive: true, force: true });
rmSync(docsRawDist, { recursive: true, force: true });

// Spec 019 Phase 1: the Pages Functions copied to <repo>/functions/ import
// `@rune-langium/core` (parse.ts + curated-fetch.ts), which resolves to
// `packages/core/dist/index.js` per its package.json exports. The studio's
// vite build transpiles core/src directly so the studio bundle doesn't need
// the dist, but CF Pages bundles the functions in a separate step and
// resolves the import via its package.json exports — so the dist MUST exist
// at deploy time or function bundling fails ("Cannot find module
// '@rune-langium/core'"). Local builds work because dist/ persists from
// prior `pnpm -r build` runs; CF Pages clones a fresh checkout each time.
//
// Building only the workspace packages the functions actually touch keeps
// the build short. Functions reference @rune-langium/core; that pulls
// langium-zod (already shipping built JS via npm) transitively but doesn't
// touch other workspace pkgs at runtime.
run(
  'Building @rune-langium/core (workspace dep imported by Pages Functions)',
  'pnpm --filter @rune-langium/core run build',
  repoRoot
);

run('Generating typedoc API markdown', 'pnpm run docs:api', docsRoot);
run(
  'Building VitePress docs (base=/rune-studio/docs/)',
  'pnpm exec vitepress build --outDir ./.vitepress/dist-docs-raw',
  docsRoot
);

run(
  'Building Rune Studio (base=/rune-studio/studio/)',
  'pnpm --filter @rune-langium/studio build',
  repoRoot
);

// `copyDir` creates `subpathDist` itself (so its contents are not nested).
copyDir(siteRoot, subpathDist, 'site → /rune-studio/');
copyDir(docsRawDist, join(subpathDist, 'docs'), 'vitepress → /rune-studio/docs/');
copyDir(studioDist, join(subpathDist, 'studio'), 'studio → /rune-studio/studio/');

writeFileSync(
  join(combinedDist, '_redirects'),
  '/rune-studio/studio/* /rune-studio/studio/index.html 200\n'
);
console.log('[build-combined] Wrote _redirects with SPA fallback for /rune-studio/studio/*');

// Spec 019 Phase 1: copy Pages Functions to the REPO ROOT where CF Pages
// git-integration scans for them. CF Pages scans `<Root Directory>/functions/`
// (default: repo root). Placing them inside the build output dir does NOT
// work for git-integration deploys — only direct `wrangler pages deploy`
// CLI uploads scan the build output. The source tree at
// apps/studio/functions/ is the canonical authoring location (used by
// `pnpm dev:pages` for local development); this is just a deploy-time copy.
rmSync(repoFunctions, { recursive: true, force: true });
copyDir(studioFunctionsSrc, repoFunctions, 'studio functions → <repo>/functions/ (CF Pages discovery)');
for (const stripped of ['test', 'tsconfig.json', 'tsconfig.tsbuildinfo']) {
  rmSync(join(repoFunctions, stripped), { recursive: true, force: true });
}
console.log('[build-combined] Stripped test/ + tsconfig artifacts from functions copy');

// Generate <repo>/wrangler.toml so CF Pages picks up the compat flag, the
// LSP_SESSION DO binding (consumed from the existing rune-lsp-worker Worker —
// Pages cannot host DOs), and the ALLOWED_ORIGIN runtime var declaratively
// without requiring dashboard clicks for those fields.
//
// We intentionally OMIT:
//   - `[[migrations]]`          (DO migrations are owned by
//                                apps/lsp-worker/wrangler.toml; binding
//                                consumers must not migrate someone else's DO).
//
// `name` MUST match the CF Pages dashboard project name — CF Pages refuses to
// read a wrangler.toml that doesn't carry one ("Missing top-level field
// 'name'"). Hardcoded to "daikonic-dev" since that's the project this repo
// deploys to; override via `CF_PAGES_PROJECT_NAME` if a fork uses a different
// project name.
//
// SESSION_SIGNING_KEY is intentionally NOT here — secrets must not be
// committable. Set once per environment via:
//   pnpm wrangler pages secret put SESSION_SIGNING_KEY \
//     --project-name=daikonic-dev --environment=preview
//   pnpm wrangler pages secret put SESSION_SIGNING_KEY \
//     --project-name=daikonic-dev --environment=production
//
// Per CF Pages docs, wrangler.toml at the project root merges with dashboard
// settings (wrangler.toml takes precedence for conflicts) — unrelated
// dashboard vars/bindings the rest of the site relies on remain intact.
const projectName = process.env.CF_PAGES_PROJECT_NAME ?? 'daikonic-dev';
const wranglerToml = `# Auto-generated by apps/docs/scripts/build-combined.mjs — do not edit.
# Spec 019 Phase 1: CF Pages project config (compat + LSP DO binding + vars).
# Edit the source script if you need to change this.

name = "${projectName}"
compatibility_date = "2025-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "apps/docs/.vitepress/dist"

# Durable Object binding — DO is owned by the rune-lsp-worker Cloudflare
# Worker (apps/lsp-worker/), not by this Pages project. CF Pages cannot
# create DOs; it consumes them via this binding.
# https://developers.cloudflare.com/pages/functions/bindings/#durable-objects
[[durable_objects.bindings]]
name = "LSP_SESSION"
class_name = "RuneLspSession"
script_name = "rune-lsp-worker"

# Allowlist for LSP session origin gating + parse-endpoint CORS.
[vars]
ALLOWED_ORIGIN = "https://www.daikonic.dev"
`;
writeFileSync(repoWranglerToml, wranglerToml);
console.log('[build-combined] Wrote <repo>/wrangler.toml (019: compat + pages_build_output_dir + LSP DO binding + vars)');

rmSync(docsRawDist, { recursive: true, force: true });

console.log('\n[build-combined] Done. CF Pages output dir: apps/docs/.vitepress/dist');
