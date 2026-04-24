# Quickstart: Hosted codegen service

**Feature**: `011-export-code-cf`

Shortest path from "clone the repo" to "Export Code button works on the live site". Aimed at the engineer who picks up `tasks.md` after this plan lands.

---

## Local development loop

The existing local flow is unchanged. You can develop and test the hosted-service code paths entirely with Miniflare + Docker, no CF account needed.

```bash
# One-time
cd ../rosetta-code-generators && git pull && JAVA_HOME=$JAVA21_HOME mvn package -DskipTests
cd /Users/pmouli/GitHub.nosync/active/ts/rune-langium
pnpm install

# Terminal A — local JVM codegen server (pre-existing; unchanged by this feature)
pnpm codegen:start    # serves http://localhost:8377

# Terminal B — studio dev server (pre-existing; unchanged)
pnpm --filter @rune-langium/studio dev
# Open http://localhost:5173, click Export Code — hits localhost:8377. No Turnstile.

# Terminal C — new Worker under Miniflare (add-in for this feature)
pnpm --filter @rune-langium/codegen-worker dev
# Miniflare on http://localhost:8787. Mocks CF Turnstile with dummy keys; rate-limit DO lives in-process.

# Terminal D — optional: build and run the container image locally to validate parity
docker build -t rune-codegen apps/codegen-container/
docker run --rm -p 8081:8080 rune-codegen
# Curl http://localhost:8081/api/generate/health to verify.
```

### Running the test suite

```bash
# Worker + DO tests (Miniflare)
pnpm --filter @rune-langium/codegen-worker test

# Container HTTP wrapper tests (requires Docker)
pnpm --filter @rune-langium/codegen-container test

# Studio e2e with the Worker in front (instead of localhost:8377)
VITE_CODEGEN_URL=http://localhost:8787/api/generate \
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA \
  pnpm --filter @rune-langium/studio test:e2e export-code-cf
```

---

## Deploying to Cloudflare (one-time)

Prerequisites: `wrangler login` completed against the `Pmouli@mac.com` CF account.

### 1. Build + push the container image

```bash
pnpm --filter @rune-langium/codegen-container build
# Builds the Docker image locally.

pnpm --filter @rune-langium/codegen-container publish
# Pushes to CF Container Registry. Uses wrangler containers push.
# Outputs the image tag; note it for wrangler.toml.
```

### 2. Create secrets for the Worker

```bash
cd apps/codegen-worker

wrangler secret put TURNSTILE_SECRET
# Paste the Turnstile secret key from the CF dashboard (not the site key).

wrangler secret put SESSION_SIGNING_KEY
# Generate a 32-byte random value, e.g.:
#   openssl rand -base64 32
```

### 3. Set the Turnstile site key (public, committed in wrangler.toml)

Edit `apps/codegen-worker/wrangler.toml`:

```toml
[vars]
TURNSTILE_SITE_KEY = "0x4AAA..."   # from the Turnstile dashboard, site key only
```

### 4. Deploy the Worker

```bash
pnpm --filter @rune-langium/codegen-worker deploy
# Creates:
#   - Worker: rune-codegen-worker
#   - Container binding: codegen (references pushed image)
#   - Durable Object class: RateLimiter + KV: RATE_LIMITER_KV (if any)
#   - Route: www.daikonic.dev/rune-studio/api/generate/*
```

### 5. Rebuild the Studio with the hosted-service URL

On the next push to `master` that touches `apps/studio/` or `apps/docs/scripts/build-combined.mjs`, CF Pages will rebuild the `daikonic-dev` project with:

```bash
# BrowserCodegenProxy appends '/api/generate' itself, so set the BASE URL only:
VITE_CODEGEN_URL=/rune-studio
VITE_TURNSTILE_SITE_KEY=<same as Worker wrangler.toml>
```

These are injected by `apps/docs/scripts/build-combined.mjs` — edit it to add these env exports (one of the tasks in `tasks.md`).

### 6. Set a billing alert (one-time, dashboard only)

1. Navigate to Cloudflare dashboard → **Notifications** → **Add** → **Billing Usage Alert**.
2. Threshold: **$25/month**.
3. Notify: your email on the account.

Document the alert ID in a private ops note; it's not version-controlled.

---

## Smoke test after deploy

```bash
# 1. Health endpoint
curl -s https://www.daikonic.dev/rune-studio/api/generate/health | jq
# Expect: { "status": "ok", "cold_start_likely": <bool>, "languages": [...] }
# Expect language list to match `codegen-cli --list-languages` locally.

# 2. Generation end-to-end (through a real browser for the Turnstile flow)
#    - Open https://www.daikonic.dev/rune-studio/studio/
#    - Load or create a model
#    - Click Export Code → pick a language → complete Turnstile → verify download
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `401 turnstile_required` on every request | Turnstile site key in Studio bundle doesn't match Worker's expected key. | Rebuild Studio after updating `VITE_TURNSTILE_SITE_KEY`. |
| `502 Bad Gateway` from Worker | Container not reachable (cold-start exceeded 30s, or image broken). | Check `wrangler tail` for container-binding errors. Rebuild + republish container. |
| Generation returns `{ files: [], errors: [...] }` on all requests | Parse errors in user input OR generator itself is crashing. | Compare against local `pnpm codegen:start`; if local also fails, it's a model issue. If local passes, it's a container build issue. |
| Rate-limit triggers too aggressively | DO state from a previous test run. | `wrangler d1 execute` / `wrangler kv:key delete` to clear, or wait for the day bucket to roll. |
| Monthly cost spike | Abuse, or hot-loop from a misconfigured client. | Inspect Worker logs for `ip_hash` frequency. Lower rate-limit caps or add per-hash cap. |

## Rollback plan

1. `wrangler rollback` the Worker to the previous deployment.
2. Revert the studio build's env vars (`VITE_CODEGEN_URL` back to `http://localhost:8377`) and redeploy the Pages project — the dialog will re-hide / disable Generate but won't crash.
3. The local `pnpm codegen:start` path continues to work for developers throughout.
