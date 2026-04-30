# Quickstart: Studio Production Readiness

**Feature**: `014-studio-prod-ready`
**Phase**: 1 (Design)

This document walks an integrator through verifying each phase of
014 lands cleanly. Each section corresponds to a phase from the
plan; running the listed commands against a freshly-deployed
Studio MUST produce the listed output.

---

## §1 — Phase 1: Operational unblock (B1b)

```sh
# 1. Make sure wrangler is logged into the right account.
pnpm --filter @rune-langium/curated-mirror-worker exec wrangler whoami
# Expected: account 8327a4da4660eab7d78695268282da09

# 2. Tighten the codegen-worker route BEFORE deploying the new workers
#    so they reach their narrower binds.
#    (Edit apps/codegen-worker/wrangler.toml: route = /rune-studio/api/codegen/*)
pnpm --filter @rune-langium/codegen-worker exec wrangler deploy

# 3. Deploy the three feature-012 Workers.
pnpm run deploy:curated-mirror
pnpm --filter @rune-langium/github-auth-worker exec wrangler deploy
pnpm --filter @rune-langium/telemetry-worker exec wrangler deploy

# 4. Seed R2 with the first cron run.
pnpm --filter @rune-langium/curated-mirror-worker exec wrangler dev --test-scheduled &
SCHED_PID=$!
sleep 3
curl -s "http://localhost:8787/__scheduled?cron=0+3+*+*+*"
kill $SCHED_PID

# 5. Verify R2 has objects.
pnpm --filter @rune-langium/curated-mirror-worker exec wrangler r2 object list rune-curated-mirror | head
# Expected: at least cdm/manifest.json, cdm/latest.tar.gz, fpml/..., rune-dsl/...

# 6. Smoke-check from your shell.
pnpm run verify:prod
# Expected: 5 of 7 checks PASS (LSP probe still FAILs — Phase 4).
#           No catch-all detection failure.
```

---

## §2 — Phase 2: Curated-load wiring (B2, B3, C1, C2, FR-019)

```sh
# 1. Build with the changes.
pnpm --filter '@rune-langium/studio...' run build

# 2. Local smoke — no production deploy required.
pnpm dev:studio &
DEV_PID=$!
sleep 5
curl -s http://localhost:5173/ | grep -c "studio" >/dev/null && echo "Studio reachable"
kill $DEV_PID
```

**Browser test** (production deploy after Phase 2 push to `master`):

1. Open `https://www.daikonic.dev/rune-studio/studio/` in a **fresh** Chrome profile.
2. Open DevTools → Network tab; filter by "manifest".
3. Click the **CDM** curated card.
4. Verify exactly two requests appear:
   - `GET https://www.daikonic.dev/curated/cdm/manifest.json` → 200
   - `GET https://www.daikonic.dev/curated/cdm/latest.tar.gz` → 200
5. Verify ZERO requests to `cors.isomorphic-git.org`. (FR-019.)
6. Verify the IDE shell renders with visible tab strips at the top of each panel group, and panel labels read `Files` / `Editor` / `Problems` / `Output` / `Preview` / `Inspector` (NOT the registry IDs). (B3 + C1.)
7. Verify the status bar copy. With dev-mode off, it MUST NOT mention `localhost:3001`. (C2.)

---

## §3 — Phase 3: Workspace restore + GitHub UI (C4, C5)

**Browser test:**

1. Continuing from §2, with the workspace open, click the editor tab and type a few characters into a file. Then **reload the tab** (Cmd-R / F5).
2. Within 5 seconds, the editor MUST restore the same file at the same scroll position. The start page MUST NOT appear. (C4 / SC-002.)
3. Open a **second** Chrome window in incognito. Open `https://www.daikonic.dev/rune-studio/studio/`.
4. Click the **"Open from GitHub"** button on the empty start page.
5. A dialog MUST appear with a `user_code` and a link to `github.com/login/device`.
6. Complete the device-flow on `github.com/login/device`.
7. Return to the dialog. Within 30s, Studio MUST clone the repo into a workspace. (C5 / SC-007.)

---

## §4 — Phase 4: LSP host (C3)

**Spike first** (do not skip):

```sh
# Build the scratch worker that imports langium and parses a fixture.
cd scratch/lsp-spike
pnpm install
pnpm exec wrangler dev --port 8788 &
SPIKE_PID=$!
sleep 3
node test-client.mjs ws://localhost:8788/lsp
# Expected: a publishDiagnostics with `[]` for the valid fixture, OR
#           the same Xtext-parity-ish diagnostics for an invalid one.
kill $SPIKE_PID
```

If the spike PASSes, proceed with the worker build. If it FAILs,
drop to the documentation-rewrite fallback (research.md R2). The
spike's pass/fail outcome is the gate.

**Deploy `apps/lsp-worker` (T043 — operational)**:

```sh
# 1. Mint a fresh signing key and stash it as a wrangler secret.
#    Rotated per-feature-release; never logged.
openssl rand -base64 32 | \
  pnpm --filter @rune-langium/lsp-worker exec wrangler secret put SESSION_SIGNING_KEY

# 2. Deploy the Worker + Durable Object.
pnpm --filter @rune-langium/lsp-worker exec wrangler deploy

# 3. Verify the deploy.
curl -s https://www.daikonic.dev/rune-studio/api/lsp/health | jq
# Expected: {"ok":true, "version":"0.1.0", "langium_loaded":true, "uptime_seconds":N}

# 4. Re-run verify-production — should now be all-pass.
pnpm run verify:prod
# Expected: all 7 checks PASS.
```

**On migration**: the wrangler.toml ships a `v1` migration that creates
the `RuneLspSession` DO class. There are no existing instances on this
class, so the deploy is a clean roll-forward; no `--force` flags or
storage backups are required.

**Browser test**:

1. Open Studio on production.
2. Type a deliberate typo (`tradse Trade:` for `type Trade:`).
3. Within 2 seconds, an error squiggle MUST appear under the typo and the Problems panel must list the diagnostic. (SC-005.)
4. Hover over a known type name. Within 1 second, a tooltip with the type's source location appears.
5. With the cursor positioned where a type name is expected, press `Ctrl-Space`. Within 1 second, an autocomplete list appears.

---

## §5 — Phase 5: Polish + e2e (FR-020, FR-021)

```sh
# Run the new Playwright happy-path test against a local studio build.
pnpm --filter @rune-langium/studio exec playwright test test/e2e/curated-load.spec.ts
# Expected: 1 test, all pass within ~30s on local hardware.

# Verify the env var ergonomics work.
VITE_LSP_WS_URL=ws://example.invalid:9999 pnpm dev:studio &
sleep 3
# DevTools console should show the studio attempting wss://example.invalid:9999/...
# Not ws://localhost:3001/... .
```

---

## §6 — Phase 6: Cross-surface UX consistency (US7)

```sh
# Build all three surfaces.
pnpm run build
pnpm --filter '@rune-langium/studio...' run build

# Run the visual-consistency tests.
pnpm --filter @rune-langium/studio exec vitest run test/visual
# Expected: all pass; no hardcoded-hex regressions in styles.css.

# Confirm the design-token CI guard catches an undefined property.
echo '.bad-rule { padding: var(--space-999); }' >> apps/studio/src/styles.css
pnpm --filter @rune-langium/studio exec vitest run test/quality/no-undefined-vars.test.ts
# Expected: FAIL, with --space-999 named in the failure output.
git checkout -- apps/studio/src/styles.css

# Side-by-side visual screenshot review (manual; spec gate SC-011).
# Capture at 1280x800:
#   - https://www.daikonic.dev/                     (landing)
#   - https://www.daikonic.dev/rune-studio/         (docs)
#   - https://www.daikonic.dev/rune-studio/studio/  (Studio)
# Verify a designer cannot identify them as different products.
```

---

## §7 — Final acceptance gate

```sh
# All-checks-pass on production.
pnpm run verify:prod
# Expected: zero failures, zero warnings.

# Workspace test suite.
pnpm -r test
# Expected: ≥1356 tests pass (no regression from the 1356 baseline
# established at master HEAD post-105 merge).

# Type-check.
pnpm -r run type-check
# Expected: clean.
```
