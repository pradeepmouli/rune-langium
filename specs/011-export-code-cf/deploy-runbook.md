# Deploy Runbook: Hosted codegen service

**Feature**: `011-export-code-cf`
**Purpose**: Everything that has to happen for the first production deploy, in order, with paste-ready commands.

All commands assume `cwd = repo root`.

## Prerequisites check (do these first)

```bash
# 1. You're on the merged branch.
git status && git log --oneline -3
# Expected: on master (after #104 merges), or on 011-export-code-cf.

# 2. Docker daemon is up.
docker info | grep "Server Version"

# 3. wrangler is authenticated.
pnpm --filter @rune-langium/codegen-worker exec wrangler whoami
# If not logged in:
pnpm --filter @rune-langium/codegen-worker exec wrangler login

# 4. rosetta-code-generators sibling clone exists (Dockerfile clones it
#    fresh anyway, but local dev uses the sibling directory).
ls ../rosetta-code-generators/.git >/dev/null 2>&1 && echo ok || \
  git clone https://github.com/REGnosys/rosetta-code-generators.git ../rosetta-code-generators
```

## Step 1 — Build the container image

```bash
# Compile the Node HTTP wrapper first; Dockerfile copies dist/ in Stage 2.
pnpm --filter @rune-langium/codegen-container run build:ts

# Multi-stage build. 5–15 min the first time (Maven downloads + JVM install).
docker build -f apps/codegen-container/Dockerfile -t rune-codegen:latest .

# Verify the image runs locally + language list parity vs pnpm codegen:start.
docker run --rm -d -p 18080:8080 --name rune-codegen-smoke rune-codegen:latest
sleep 20
curl -s http://127.0.0.1:18080/api/generate/health | jq
docker stop rune-codegen-smoke

# Full parity check against the local Node server (catches generator drift):
pnpm codegen:start &            # terminal A
LOCAL_PID=$!
CONTAINER_TEST=1 pnpm --filter @rune-langium/codegen-container test container-parity
kill $LOCAL_PID
```

If the parity test fails, DO NOT DEPLOY. The upstream rosetta-code-generators commit pinned in the Dockerfile has drifted from what local dev uses.

## Step 2 — Create the Turnstile site

**Via CF dashboard** (not automated — token scope on the MCP was insufficient):

1. Navigate to https://dash.cloudflare.com → Turnstile → **Add site**.
2. Name: `rune-studio`
3. Domain: `www.daikonic.dev`
4. Widget mode: **Managed** (shows the challenge only when needed; most users see nothing).
5. Save; record the **Site Key** (public) and **Secret Key** (never commit).

## Step 3 — Push the container image to CF Registry

```bash
pnpm --filter @rune-langium/codegen-container exec wrangler containers push rune-codegen:latest
# Records the image tag CF's registry assigned — note it for verification.
```

If `wrangler containers push` isn't recognized, your wrangler is below the Containers-beta threshold. Upgrade:

```bash
pnpm --filter @rune-langium/codegen-worker add -D wrangler@latest
```

## Step 4 — Set Worker secrets

```bash
cd apps/codegen-worker

# Turnstile secret (from Step 2).
pnpm exec wrangler secret put TURNSTILE_SECRET
# (paste the secret key when prompted)

# Session signing key — 32 bytes of randomness.
# You can reuse the value I generated earlier, or regenerate:
openssl rand -base64 32
pnpm exec wrangler secret put SESSION_SIGNING_KEY
# (paste the base64 value when prompted)

cd ../..
```

## Step 5 — Update `wrangler.toml` with the real Turnstile site key

```toml
# apps/codegen-worker/wrangler.toml
[vars]
TURNSTILE_SITE_KEY = "0x4AAA…YOUR_REAL_KEY"   # from Step 2, site key, NOT secret
```

Commit + push so the value is in the repo (site keys are public, safe to commit). Studio's `build-combined.mjs` reads `TURNSTILE_SITE_KEY` from env at build time — CF Pages picks it up on the next rebuild of the `daikonic-dev` Pages project.

## Step 6 — Deploy the Worker

```bash
pnpm --filter @rune-langium/codegen-worker exec wrangler deploy
```

First deploy output should include:
- Worker name: `rune-codegen-worker`
- Route attached: `www.daikonic.dev/rune-studio/api/generate/*`
- Durable Object `RateLimiter` class migration applied (tag v1)
- KV namespace `LANG_CACHE` bound (id `a3007b9cfdd8415384fef5397890e19f`)
- Container `CODEGEN` bound to the pushed image

## Step 7 — Smoke tests

```bash
# 1. Health endpoint — should return {status:ok, languages:[...]}. Cold
#    start may take up to ~15s on the first call.
curl -s https://www.daikonic.dev/rune-studio/api/generate/health | jq

# 2. Generate endpoint without Turnstile token — expect 401.
curl -s -w "\nHTTP %{http_code}\n" -X POST \
     -H "Content-Type: application/json" \
     -d '{"language":"typescript","files":[]}' \
     https://www.daikonic.dev/rune-studio/api/generate
# Expected: HTTP 401, body {"error":"turnstile_required", ...}

# 3. Live Studio test (in a browser):
#    https://www.daikonic.dev/rune-studio/studio/
#    - Click "New" on the start page (feature 012).
#    - Click "Export Code".
#    - Select a language, solve the (likely invisible) Turnstile challenge.
#    - Verify files download.

# 4. Rate-limit verification — eleven rapid requests from the same IP.
for i in {1..11}; do
  curl -s -o /dev/null -w "Gen $i: HTTP %{http_code}\n" -X POST \
       -H "Content-Type: application/json" \
       -H "X-Turnstile-Token: 1x0000000000000000000000000000000AA_test" \
       -d '{"language":"typescript","files":[]}' \
       https://www.daikonic.dev/rune-studio/api/generate
done
# Expected: first 10 return 200 or 401 (real-token flow), 11th returns 429.
```

## Step 8 — One-time CF dashboard actions

1. **Billing alert** — Notifications → Add → Billing Usage Alert → **$25/month**. Notify to your email. (T039)
2. **Rollback rehearsal** — in a preview environment, run `wrangler rollback` to confirm the published plan works. (T040)

## Rollback

```bash
# Latest known-good version.
pnpm --filter @rune-langium/codegen-worker exec wrangler rollback

# Or, if the Studio deploy also needs to revert:
# Revert the commit updating VITE_CODEGEN_URL / TURNSTILE_SITE_KEY in
# apps/docs/scripts/build-combined.mjs and let CF Pages rebuild.
```

Local `pnpm codegen:start` remains authoritative for all developer workflows regardless of what's deployed.
