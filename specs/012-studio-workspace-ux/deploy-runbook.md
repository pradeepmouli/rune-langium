# Deploy Runbook: Studio workspace UX (012)

**Feature**: `012-studio-workspace-ux`
**Purpose**: First-time deploy steps for the three new Workers introduced
by this feature (curated-mirror, github-auth, telemetry) plus the R2
bucket and Studio Pages rebuild. Paste-ready, in order.

All commands assume `cwd = repo root`.

---

## Prerequisites check

```bash
# 1. Branch + clean tree.
git status && git log --oneline -3
# Expected: on master after 012 merges, or on 012-studio-workspace-ux.

# 2. wrangler logged in.
pnpm --filter @rune-langium/curated-mirror-worker exec wrangler whoami
# If not: pnpm --filter @rune-langium/curated-mirror-worker exec wrangler login

# 3. Type-check + tests are green BEFORE pushing any of this.
pnpm -r run type-check
pnpm -r run test
```

If any command above fails, **stop and fix it locally first**. None of the steps below tolerate a broken main.

---

## Step 1 — Create the R2 bucket (one-time, idempotent)

```bash
# T005 lists this; re-running is a no-op once the bucket exists.
pnpm --filter @rune-langium/curated-mirror-worker exec \
  wrangler r2 bucket create rune-curated-mirror
```

The bucket binding `rune_curated_mirror` is already declared in
`apps/curated-mirror-worker/wrangler.toml`. No further config needed.

---

## Step 2 — Create the GitHub App (for device-flow workspaces)

**Via GitHub** (not automated):

1. https://github.com/settings/apps → **New GitHub App**
2. Name: `Rune Studio (workspaces)`
3. Homepage URL: `https://www.daikonic.dev/rune-studio/studio/`
4. Callback URL: `https://www.daikonic.dev/rune-studio/api/github-auth/callback`
5. Disable webhooks; check **Enable Device Flow**.
6. Permissions:
   - **Contents**: read & write (clone + push the workspace branches)
   - **Metadata**: read (mandatory)
7. Save. Record the **Client ID** (public).

Then update `apps/github-auth-worker/wrangler.toml`:

```toml
[vars]
GITHUB_CLIENT_ID = "Iv1.YOUR_REAL_ID_HERE"
```

Commit + push (Client ID is public; safe to commit).

---

## Step 3 — Telemetry secrets + dashboards

The telemetry Worker has no secrets at this time — IP hashing uses an
in-memory daily-rotating salt and the closed schema cannot leak PII.
The only post-deploy task is exposing `/v1/stats` to admins:

```bash
# Already part of the wrangler config; no secret to put.
# Verify the DO migration is at v1.
pnpm --filter @rune-langium/telemetry-worker exec wrangler tail \
  --search 'TelemetryAggregator' --format pretty
```

If you want non-admin access blocked at the edge, in CF dashboard:
**Zero Trust → Access → Applications → Add → Self-hosted**
- Application URL: `https://www.daikonic.dev/rune-studio/api/telemetry/v1/stats`
- Policy: Allow your admin email allowlist.
- Leave `/v1/event` open (anonymous, schema-validated, rate-limited).

---

## Step 4 — Deploy the three new Workers

```bash
# Curated mirror first — its R2 bucket binding must resolve before
# Studio tries to fetch /curated/* in production.
pnpm --filter @rune-langium/curated-mirror-worker exec wrangler deploy

# GitHub auth mediator.
pnpm --filter @rune-langium/github-auth-worker exec wrangler deploy

# Telemetry ingester. Applies the v1 DO migration on first deploy
# (`new_classes=["TelemetryAggregator"]`).
pnpm --filter @rune-langium/telemetry-worker exec wrangler deploy
```

First deploy of each should report:
- A route attached under `www.daikonic.dev/...`
- For curated-mirror: cron `0 3 * * *` registered + R2 binding bound
- For telemetry: DO class migration tag `v1` applied

---

## Step 5 — Trigger the first curated-mirror cron run

```bash
# Without waiting for 03:00 UTC, manually invoke the cron handler:
pnpm --filter @rune-langium/curated-mirror-worker exec \
  wrangler dev --test-scheduled
# In another terminal:
curl -s "http://localhost:8787/__scheduled?cron=0+3+*+*+*"
```

After it completes, verify R2 has the archives:

```bash
pnpm --filter @rune-langium/curated-mirror-worker exec \
  wrangler r2 object list rune-curated-mirror --json | jq '.objects[].key' | head
```

Expect to see entries shaped like `cdm/<version>.tar.gz`,
`cdm/manifest.json`, etc.

---

## Step 6 — Studio Pages rebuild

The Studio app picks up the production endpoints at build time via
`resolveTelemetryEndpoint()` and `model-registry.ts`. Trigger a CF Pages
rebuild of `daikonic-dev` (push a no-op commit, or use the dashboard's
manual rebuild button).

---

## Step 7 — Smoke tests

```bash
# 1. Curated mirror — fetch a manifest. Must be 200 with the expected JSON.
curl -s https://www.daikonic.dev/curated/cdm/manifest.json | jq

# 2. Curated mirror — fetch the latest archive. Must be 200 + correct
#    Content-Type. (HEAD avoids downloading the whole thing.)
curl -sI https://www.daikonic.dev/curated/cdm/latest.tar.gz | head

# 3. Telemetry — submit a valid event. Must return 204 with empty body.
curl -i -X POST \
  -H 'Content-Type: application/json' \
  -d '{"event":"workspace_open_success","studio_version":"0.1.0","ua_class":"smoke"}' \
  https://www.daikonic.dev/rune-studio/api/telemetry/v1/event

# 4. Telemetry — submit a body with an unknown field. Must be 400 schema_violation.
curl -s -X POST \
  -H 'Content-Type: application/json' \
  -d '{"event":"workspace_open_success","studio_version":"0.1.0","ua_class":"smoke","leak":"nope"}' \
  https://www.daikonic.dev/rune-studio/api/telemetry/v1/event | jq

# 5. Telemetry rate-limit — 11 rapid events from the same IP must hit 429.
for i in {1..11}; do
  curl -s -o /dev/null -w "T $i: HTTP %{http_code}\n" -X POST \
    -H 'Content-Type: application/json' \
    -d '{"event":"workspace_open_success","studio_version":"0.1.0","ua_class":"smoke"}' \
    https://www.daikonic.dev/rune-studio/api/telemetry/v1/event
done
# Expected: 1..10 → HTTP 204, 11 → HTTP 429.

# 6. GitHub auth — request a device code (no token returned, just polling info).
curl -s -X POST \
  https://www.daikonic.dev/rune-studio/api/github-auth/device-code | jq

# 7. Live Studio test (browser):
#    https://www.daikonic.dev/rune-studio/studio/
#    - Click "Open Workspace…" → "Open from GitHub…" — device-flow polling starts.
#    - After auth, a workspace opens; Source Editor + File Tree are populated.
#    - Settings → Telemetry toggle: when off, Network panel shows zero
#      requests to /telemetry/*; when on, requests appear and return 204.
```

---

## Step 8 — One-time CF dashboard actions

1. **Billing alert** — Notifications → Add → Billing Usage Alert → **$25/month**, notify admin email.
2. **R2 lifecycle rule** — `rune-curated-mirror` bucket → Lifecycle → expire objects older than 30 days under prefix `*/old/`. (Curated archives keep their last 14 versions; the rule sweeps anything explicitly archived.)
3. **Rollback rehearsal** — pick the curated-mirror worker first; run `wrangler rollback` against a preview env to confirm the published plan works for the new DO migration shape.

---

## Rollback

```bash
# Per-worker rollback. Each is independent — telemetry can be rolled back
# without touching curated-mirror.
pnpm --filter @rune-langium/telemetry-worker exec wrangler rollback
pnpm --filter @rune-langium/github-auth-worker exec wrangler rollback
pnpm --filter @rune-langium/curated-mirror-worker exec wrangler rollback

# DO migration rollback caveat: the telemetry DO `v1` migration creates
# a new class. `wrangler rollback` to a pre-v1 version DOES NOT remove
# the class. To fully tear down, deploy a v0 with `deleted_classes`,
# then redeploy the previous code. This is documented but should never
# be needed in normal rollbacks.
```

---

## Operational notes

- The curated-mirror cron runs at **03:00 UTC nightly**. A failed run does not block Studio — the loader falls back to the previous archive via the `manifest.json` history list.
- Telemetry ingest is **opt-out by default** in Studio; the toggle lives in Settings. The privacy contract (`contracts/telemetry-event.md`) describes exactly which fields can ever be sent.
- The GitHub-auth Worker is **stateless**; it never stores tokens, never has a DO/KV. All persisted GitHub state is held client-side in OPFS + IndexedDB on the user's device.

Local `pnpm dev` workflows ignore all three Workers — Studio's
`resolveTelemetryEndpoint()` routes localhost back to the dev origin,
and the curated loader falls back to the bundled fixtures.
