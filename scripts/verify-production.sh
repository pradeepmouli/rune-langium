#!/usr/bin/env bash
# SPDX-License-Identifier: FSL-1.1-ALv2
# Copyright (c) 2026 Pradeep Mouli
#
# verify-production.sh
#
# Smoke-checks the live Studio deploy + the three feature-012 Workers.
# Catches the "Workers not deployed" / "R2 bucket empty" / "Worker
# unrouted" class of bug in seconds.
#
# Exits non-zero on the first FAIL so CI / cron callers can rely on it.
# Prints a structured PASS / FAIL line per check; pipe through `tee` if
# you want both human-readable and machine-readable output.
#
# Usage:
#   ./scripts/verify-production.sh                # default origin
#   BASE=https://staging.example/rune-studio ./scripts/verify-production.sh
#
# Env:
#   BASE         override the public origin path. Default:
#                https://www.daikonic.dev/rune-studio
#   STRICT       1 = treat warnings as failures (telemetry rate-limit,
#                github-auth misconfig). Default: 0.
#
# Exit codes:
#   0  all checks passed
#   1  at least one check failed
#   2  bash / curl prerequisite missing

set -u
set -o pipefail

BASE="${BASE:-https://www.daikonic.dev/rune-studio}"
ROOT_BASE="${BASE%/rune-studio}"
STRICT="${STRICT:-0}"

if ! command -v curl >/dev/null 2>&1; then
  echo "FATAL: curl not found in PATH"
  exit 2
fi

failures=0
warnings=0

# --- helpers ---

# pass <label>
pass() { printf 'PASS  %s\n' "$1"; }

# fail <label> <detail>
fail() {
  printf 'FAIL  %s\n      %s\n' "$1" "$2"
  failures=$((failures + 1))
}

# warn <label> <detail>
warn() {
  printf 'WARN  %s\n      %s\n' "$1" "$2"
  warnings=$((warnings + 1))
  if [ "$STRICT" = "1" ]; then failures=$((failures + 1)); fi
}

# http_status <method> <url> [data] [extra_header]
http_status() {
  local method=$1 url=$2 data=${3:-} extra=${4:-}
  if [ -n "$data" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$method" \
      -H 'Content-Type: application/json' \
      ${extra:+-H "$extra"} \
      --data "$data" \
      "$url"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$method" \
      ${extra:+-H "$extra"} \
      "$url"
  fi
}

# http_body <method> <url> [data]
http_body() {
  local method=$1 url=$2 data=${3:-}
  if [ -n "$data" ]; then
    curl -s -X "$method" -H 'Content-Type: application/json' --data "$data" "$url"
  else
    curl -s -X "$method" "$url"
  fi
}

echo "Verifying production deploy at:"
echo "  Studio:        $BASE/studio/"
echo "  Curated mirror: $ROOT_BASE/curated/"
echo "  Worker API:    $BASE/api/"
echo

# ---------- 1. Studio HTML reachable ----------

status=$(http_status GET "$BASE/studio/")
if [ "$status" = "200" ]; then
  pass "Studio HTML reachable ($status)"
else
  fail "Studio HTML reachable" "expected 200, got $status from $BASE/studio/"
fi

# ---------- 2. Curated mirror — manifest endpoints ----------
# Each modelId should serve a manifest.json. After the first cron run R2
# has populated archives; before that, the Worker (if deployed) returns
# 404 from a real handler with a structured body.

for model in cdm fpml rune-dsl; do
  url="$ROOT_BASE/curated/$model/manifest.json"
  status=$(http_status GET "$url")
  case "$status" in
    200)
      body=$(http_body GET "$url")
      # Sanity-check manifest shape.
      if printf '%s' "$body" | grep -q '"schemaVersion"' \
         && printf '%s' "$body" | grep -q '"modelId"' \
         && printf '%s' "$body" | grep -q '"sha256"'; then
        pass "Curated /$model/manifest.json ($status, valid shape)"
      else
        fail "Curated /$model/manifest.json shape" \
             "200 but body missing schemaVersion/modelId/sha256: ${body:0:120}"
      fi
      ;;
    304)
      pass "Curated /$model/manifest.json (304 cached)"
      ;;
    404)
      body=$(http_body GET "$url")
      if [ -n "$body" ] && printf '%s' "$body" | grep -q '"error"'; then
        # Worker is deployed but R2 is empty for this modelId.
        warn "Curated /$model/manifest.json" \
             "Worker reports 404 with body — Worker live, R2 empty for $model. Run the first cron."
      else
        # No body at all = catch-all 404, Worker not bound.
        fail "Curated /$model/manifest.json" \
             "404 with empty body — curated-mirror Worker is not routed (run runbook Step 4)"
      fi
      ;;
    *)
      fail "Curated /$model/manifest.json" \
           "expected 200/304/404, got $status"
      ;;
  esac
done

# ---------- 3. Telemetry Worker — accepts a valid event ----------
# A real telemetry Worker returns 204 on a valid POST with the same-
# origin Origin header. A catch-all 405 means the Worker is not bound.

valid_event='{"event":"workspace_open_success","studio_version":"verify-prod","ua_class":"smoke"}'
status=$(http_status POST "$BASE/api/telemetry/v1/event" "$valid_event" "Origin: $ROOT_BASE")
case "$status" in
  204)
    pass "Telemetry POST /v1/event ($status)"
    ;;
  403)
    fail "Telemetry POST /v1/event" \
         "403 — Worker live but ALLOWED_ORIGIN doesn't include $ROOT_BASE. Fix env binding."
    ;;
  400)
    fail "Telemetry POST /v1/event" \
         "400 schema_violation — schema drift between client and Worker (e.g. ErrorCategory enum)"
    ;;
  405)
    fail "Telemetry POST /v1/event" \
         "405 — telemetry Worker is not routed (catch-all). Run runbook Step 4."
    ;;
  404)
    fail "Telemetry POST /v1/event" \
         "404 — route is wrong; check apps/telemetry-worker/wrangler.toml [[routes]]"
    ;;
  *)
    fail "Telemetry POST /v1/event" \
         "expected 204, got $status"
    ;;
esac

# ---------- 4. Telemetry Worker — closed-schema rejection ----------
# A schema-violation should yield 400 — proves the schema is wired.

bad_event='{"event":"workspace_open_success","studio_version":"vp","ua_class":"smoke","leak":"no"}'
status=$(http_status POST "$BASE/api/telemetry/v1/event" "$bad_event" "Origin: $ROOT_BASE")
if [ "$status" = "400" ]; then
  pass "Telemetry rejects unknown field ($status)"
elif [ "$status" = "204" ]; then
  fail "Telemetry rejects unknown field" \
       "expected 400, got 204 — schema is not .strict() in production"
elif [ "$status" = "405" ]; then
  : # already reported above
else
  fail "Telemetry rejects unknown field" \
       "expected 400, got $status"
fi

# ---------- 5. github-auth Worker — device-init reachable ----------
# A real Worker returns 200 with device_code/user_code, OR 502 if the
# GitHub App client_id is the placeholder, OR 503 if upstream is down.

status=$(http_status POST "$BASE/api/github-auth/device-init" "" "Origin: $ROOT_BASE")
case "$status" in
  200)
    body=$(http_body POST "$BASE/api/github-auth/device-init")
    if printf '%s' "$body" | grep -q '"user_code"' \
       && printf '%s' "$body" | grep -q '"device_code"'; then
      pass "github-auth POST /device-init ($status)"
    else
      fail "github-auth POST /device-init" \
           "200 but body missing user_code/device_code: ${body:0:120}"
    fi
    ;;
  502)
    warn "github-auth POST /device-init" \
         "502 github_misconfigured — likely GITHUB_CLIENT_ID still set to placeholder. Update wrangler.toml + redeploy."
    ;;
  503)
    warn "github-auth POST /device-init" \
         "503 github_unavailable — GitHub upstream returned a non-JSON / 5xx response."
    ;;
  403)
    fail "github-auth POST /device-init" \
         "403 — Origin not in ALLOWED_ORIGIN allowlist. Check wrangler.toml."
    ;;
  405)
    fail "github-auth POST /device-init" \
         "405 — github-auth Worker is not routed (catch-all). Run runbook Step 4."
    ;;
  404)
    fail "github-auth POST /device-init" \
         "404 — route is wrong; check apps/github-auth-worker/wrangler.toml [[routes]]"
    ;;
  *)
    fail "github-auth POST /device-init" \
         "expected 200, got $status"
    ;;
esac

# ---------- 6. Sanity: catch-all detection ----------
# If a randomly-named POST under /api/* returns the same status as the
# real telemetry POST, we're hitting a catch-all rather than the real
# Workers.

random_status=$(http_status POST "$BASE/api/random-nonexistent-$(date +%s)" '{}')
real_status=$(http_status POST "$BASE/api/telemetry/v1/event" "$valid_event" "Origin: $ROOT_BASE")
if [ "$random_status" = "$real_status" ] && [ "$random_status" = "405" ]; then
  fail "Worker route precedence" \
       "POST to a random unknown path returned the same 405 as the telemetry endpoint — every /api/* is being eaten by a catch-all (likely codegen-worker's parent route pattern). Tighten route patterns in apps/{telemetry,github-auth}-worker/wrangler.toml."
fi

# ---------- 7. LSP Worker — /health probe (feature 014, US3) ----------
# A live LSP Worker returns 200 with {ok:true, langium_loaded:true}.
# 404 = unrouted (T043 deploy not yet run); 200 with langium_loaded:false
# = Worker live but the langium import failed at runtime (bundle regression).

status=$(http_status GET "$BASE/api/lsp/health")
case "$status" in
  200)
    body=$(http_body GET "$BASE/api/lsp/health")
    if printf '%s' "$body" | grep -q '"langium_loaded":true'; then
      pass "LSP /health ($status, langium_loaded:true)"
    elif printf '%s' "$body" | grep -q '"langium_loaded":false'; then
      fail "LSP /health" \
           "200 but langium_loaded:false — LSP Worker live but langium import failed at runtime (bundle regression). Check apps/lsp-worker/src/index.ts module resolution."
    else
      fail "LSP /health" \
           "200 but body missing langium_loaded: ${body:0:160}"
    fi
    ;;
  404)
    fail "LSP /health" \
         "404 — LSP Worker is not routed (T043 deploy pending). Run \`pnpm --filter @rune-langium/lsp-worker exec wrangler deploy\` and confirm route /rune-studio/api/lsp/* in apps/lsp-worker/wrangler.toml."
    ;;
  405)
    fail "LSP /health" \
         "405 — every /api/* is being eaten by a catch-all (route-precedence bug). Tighten route patterns in apps/{telemetry,github-auth,codegen}-worker/wrangler.toml."
    ;;
  *)
    fail "LSP /health" \
         "expected 200, got $status from $BASE/api/lsp/health"
    ;;
esac

# ---------- summary ----------

echo
echo "─────────────────────────────────────────"
if [ "$failures" -eq 0 ] && [ "$warnings" -eq 0 ]; then
  echo "All production checks passed."
  exit 0
elif [ "$failures" -eq 0 ]; then
  echo "Production checks passed with $warnings warning(s)."
  echo "  (Set STRICT=1 to treat warnings as failures.)"
  exit 0
else
  echo "Production verification FAILED: $failures failure(s), $warnings warning(s)."
  echo
  echo "Most likely cause: deploy-runbook Steps 4–5 not yet executed."
  echo "  See specs/012-studio-workspace-ux/deploy-runbook.md"
  echo "  See specs/_deferred/012-production-gaps.md (B1b)"
  exit 1
fi
