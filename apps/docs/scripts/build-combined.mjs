#!/usr/bin/env node
/**
 * Combined build for Cloudflare Pages — produces a single tree at
 * `apps/docs/.vitepress/dist/` containing:
 *
 *   _redirects                    → SPA fallback for /rune-studio/studio/*
 *   functions/                    → Pages Functions copied from apps/studio/
 *                                   functions/ (spec 019). Mounted at the
 *                                   deploy origin root, so the studio's
 *                                   same-origin LSP/parse calls to
 *                                   `${origin}/api/...` land here.
 *   rune-studio/                  → public subpath (www.daikonic.dev/rune-studio/)
 *     ├── <site/*>                → static landing page from `site/`
 *     ├── docs/                   → VitePress docs (base='/rune-studio/docs/')
 *     └── studio/                 → Rune Studio SPA (base='/rune-studio/studio/')
 *
 * Both sub-builds run with CF_PAGES=1 so their configs pick the right base.
 * CF Pages' git integration points at `apps/docs/.vitepress/dist/` as the
 * output directory; no GitHub Actions workflow is required.
 *
 * REQUIRED CF Pages dashboard configuration (one-time, spec 019 Phase 1):
 *   - Compatibility flag:  nodejs_compat
 *   - Durable Object binding:  LSP_SESSION → existing rune-lsp-worker Worker
 *     (class: RuneLspSession). CF Pages cannot host DOs — the DO is owned
 *     by apps/lsp-worker/ (a separate CF Worker) and Pages Functions
 *     consume it via this binding. See
 *     https://developers.cloudflare.com/pages/functions/bindings/#durable-objects
 *   - Vars:  ALLOWED_ORIGIN = https://www.daikonic.dev
 *   - Secret: SESSION_SIGNING_KEY = <random 32-byte base64> (HMAC for tokens)
 *
 * apps/lsp-worker/ remains deployed even after spec 019's Phase 2 cutover —
 * Pages can't take ownership of the DO. Phase 3 (deferred) was originally
 * "delete apps/lsp-worker entirely"; that's now a narrower "strip its HTTP
 * routes; keep the DO export."
 *
 * (The studio's wrangler.toml is NOT copied into the deploy root because
 * the existing dashboard config already holds bindings/vars for the rest
 * of the site; mirroring them here would risk drift. The local-dev
 * wrangler.toml at apps/studio/wrangler.toml uses the same script_name so
 * `pnpm dev:pages` matches the production routing.)
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
const combinedFunctions = join(combinedDist, 'functions');

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

// Copy the studio's Pages Functions into the deploy-root `functions/` dir
// where CF Pages discovers them (spec 019 Phase 1). The source is
// apps/studio/functions/ — same tree the local `pnpm dev:pages` reads from
// — minus the test/ + tsconfig artifacts that don't ship to production.
copyDir(studioFunctionsSrc, combinedFunctions, 'studio functions → /functions/');
for (const stripped of ['test', 'tsconfig.json', 'tsconfig.tsbuildinfo']) {
  rmSync(join(combinedFunctions, stripped), { recursive: true, force: true });
}
console.log('[build-combined] Stripped test/ + tsconfig artifacts from functions copy');

writeFileSync(
  join(combinedDist, '_redirects'),
  '/rune-studio/studio/* /rune-studio/studio/index.html 200\n'
);
console.log('[build-combined] Wrote _redirects with SPA fallback for /rune-studio/studio/*');

// Spec 019 Phase 1: emit a minimal wrangler.toml at the deploy root so the CF
// Pages project picks up the nodejs_compat flag, the LSP_SESSION DO binding
// (consumed from the existing rune-lsp-worker Worker — Pages cannot host DOs),
// and the ALLOWED_ORIGIN runtime var without requiring a dashboard click.
//
// We intentionally OMIT:
//   - `name`               (CF Pages project name is fixed by the dashboard;
//                          setting it here risks a mismatch).
//   - `pages_build_output_dir`  (we are already at the build output).
//   - `[[migrations]]`     (DO migrations are owned by apps/lsp-worker/wrangler.toml;
//                          binding consumers should not migrate someone else's DO).
//
// SESSION_SIGNING_KEY is intentionally NOT here — secrets are not
// committable. Set it once via:
//   pnpm wrangler pages secret put SESSION_SIGNING_KEY --project-name=<your-pages-project>
//
// Per CF Pages docs, wrangler.toml at the deployment root MERGES with
// dashboard settings (with wrangler.toml taking precedence for conflicts) —
// so this won't clobber unrelated dashboard vars/secrets.
const wranglerToml = `# Auto-generated by apps/docs/scripts/build-combined.mjs — do not edit.
# Spec 019 Phase 1: CF Pages project config (compat + LSP DO binding + vars).
# Edit the source script if you need to change this.

compatibility_date = "2025-09-23"
compatibility_flags = ["nodejs_compat"]

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
writeFileSync(join(combinedDist, 'wrangler.toml'), wranglerToml);
console.log('[build-combined] Wrote deploy-root wrangler.toml (019: compat + LSP DO binding + vars)');

rmSync(docsRawDist, { recursive: true, force: true });

console.log('\n[build-combined] Done. CF Pages output dir: apps/docs/.vitepress/dist');
