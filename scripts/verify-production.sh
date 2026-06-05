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
#   STRICT       1 = treat warnings as failures. Default: 0.
#   ENABLE_TELEMETRY 1 = include /api/telemetry/* probes. Default: 0.
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
ENABLE_TELEMETRY="${ENABLE_TELEMETRY:-0}"

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
  if [ "$method" = "HEAD" ]; then
    curl -s -o /dev/null -w '%{http_code}' -I \
      ${extra:+-H "$extra"} \
      "$url"
  elif [ -n "$data" ]; then
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

# http_body <method> <url> [data] [extra_header]
http_body() {
  local method=$1 url=$2 data=${3:-} extra=${4:-}
  if [ -n "$data" ]; then
    curl -s -X "$method" \
      -H 'Content-Type: application/json' \
      ${extra:+-H "$extra"} \
      --data "$data" \
      "$url"
  else
    curl -s -X "$method" \
      ${extra:+-H "$extra"} \
      "$url"
  fi
}

echo "Verifying production deploy at:"
echo "  Studio:        $BASE/studio/"
echo "  Curated mirror: $ROOT_BASE/curated/"
echo "  Worker API:    $BASE/api/"
if [ "$ENABLE_TELEMETRY" != "1" ]; then
  echo "  Telemetry:     skipped (set ENABLE_TELEMETRY=1 to include)"
fi
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
      if grep -Eq '"schemaVersion"[[:space:]]*:' <<<"$body" \
         && grep -Eq '"modelId"[[:space:]]*:' <<<"$body" \
         && grep -Eq '"sha256"[[:space:]]*:' <<<"$body"; then
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
      if [ -n "$body" ] && grep -q '"error"' <<<"$body"; then
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

# ---------- 3. Curated mirror — latest archive endpoints ----------
# HEAD is enough here: we only need to prove the latest archive object exists
# and is reachable without downloading the full tarball.

for model in cdm fpml rune-dsl; do
  url="$ROOT_BASE/curated/$model/latest.tar.gz"
  status=$(http_status HEAD "$url")
  case "$status" in
    200)
      pass "Curated /$model/latest.tar.gz ($status)"
      ;;
    404)
      fail "Curated /$model/latest.tar.gz" \
           "404 — latest archive missing or curated-mirror Worker is not serving the tarball for $model."
      ;;
    *)
      fail "Curated /$model/latest.tar.gz" \
           "expected 200, got $status"
      ;;
  esac
done

if [ "$ENABLE_TELEMETRY" = "1" ]; then
  # ---------- 4. Telemetry Worker — accepts a valid event ----------
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

  # ---------- 5. Telemetry Worker — closed-schema rejection ----------
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
fi

# ---------- 6. github-auth Worker — device-init reachable ----------
# A real Worker returns 200 with device_code/user_code, OR 502 if the
# GitHub App client_id is the placeholder, OR 503 if upstream is down.

status=$(http_status POST "$BASE/api/github-auth/device-init" "" "Origin: $ROOT_BASE")
case "$status" in
  200)
    body=$(http_body POST "$BASE/api/github-auth/device-init" "" "Origin: $ROOT_BASE")
    if grep -q '"user_code"' <<<"$body" \
       && grep -q '"device_code"' <<<"$body"; then
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

# ---------- 7. Codegen — NOT probed here ----------
# The legacy JVM-bridge codegen Worker (`/api/generate/*`) was retired and is
# intentionally NOT deployed in prod (#272 — see apps/codegen-worker's
# package.json / wrangler.toml "NOT deployed in production"). Codegen now runs
# server-side as the studio's own `/api/codegen` Pages Function
# (apps/studio/functions/api/codegen.ts). Probing `/api/generate/health`
# therefore always 404s — a false failure — so the check is removed. (Codegen
# functional coverage lives in the package + studio test suites.)

# ---------- 8. Spec 019 Pages Functions — same-origin LSP + parse ----------
# These probes target the NEW endpoints deployed via apps/docs/.vitepress/dist/
# functions/ (see apps/docs/scripts/build-combined.mjs). They run at the ROOT
# of the origin (not under /rune-studio/), since CF Pages mounts functions at
# the project root. The legacy apps/lsp-worker probe was intentionally removed:
# production now verifies the same-origin Pages Functions directly.
#
# Skip this section when targeting a non-daikonic.dev BASE (e.g. a staging
# preview URL with a different routing prefix) by setting SKIP_019=1.

if [ "${SKIP_019:-0}" != "1" ]; then
  status=$(http_status GET "$ROOT_BASE/api/lsp/health")
  case "$status" in
    200)
      body=$(http_body GET "$ROOT_BASE/api/lsp/health")
      if grep -q '"langium_loaded":true' <<<"$body"; then
        pass "019 /api/lsp/health ($status, langium_loaded:true)"
      else
        fail "019 /api/lsp/health" \
             "200 but missing langium_loaded:true — Pages Function live but langium import failed (bundle regression). Body: ${body:0:160}"
      fi
      ;;
    404)
      warn "019 /api/lsp/health" \
           "404 — Pages Function not yet deployed at $ROOT_BASE/api/lsp/health. Either the build-combined functions/ copy didn't ship, or the CF Pages project hasn't picked it up. Push to trigger autodeploy, then re-run."
      ;;
    *)
      fail "019 /api/lsp/health" \
           "expected 200, got $status from $ROOT_BASE/api/lsp/health"
      ;;
  esac

  # /api/lsp/session: POST without Origin should be rejected (origin gating).
  # We expect 400/403 here — a 200 would indicate the origin allowlist is off.
  # 404/405 both mean "no Pages Function deployed at this path" (CF Pages
  # falls through to its static-asset 405 when the route is unhandled).
  status=$(http_status POST "$ROOT_BASE/api/lsp/session" '{"workspaceId":"verify"}')
  case "$status" in
    200)
      fail "019 /api/lsp/session origin gate" \
           "200 with no Origin header — token mint should reject cross-origin / null-origin requests (lsp-auth.ts). Check ALLOWED_ORIGIN var in CF dashboard."
      ;;
    400|401|403)
      pass "019 /api/lsp/session origin gate ($status without Origin header)"
      ;;
    404|405)
      warn "019 /api/lsp/session" \
           "$status — Pages Function not deployed yet at $ROOT_BASE/api/lsp/session (CF static-asset fallthrough)."
      ;;
    *)
      fail "019 /api/lsp/session origin gate" \
           "expected 400/401/403 from no-Origin POST, got $status"
      ;;
  esac

  # /api/parse: empty body should be rejected with 400.
  # 404/405 both mean "no Pages Function deployed at this path".
  status=$(http_status POST "$ROOT_BASE/api/parse" '{}')
  case "$status" in
    400)
      pass "019 /api/parse rejects empty body ($status)"
      ;;
    404|405)
      warn "019 /api/parse" \
           "$status — Pages Function not deployed yet at $ROOT_BASE/api/parse (CF static-asset fallthrough)."
      ;;
    *)
      fail "019 /api/parse" \
           "expected 400 from empty-body POST, got $status"
      ;;
  esac
fi

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
  echo "  For the codegen Worker gap: specs/011-export-code-cf/deploy-runbook.md"
  exit 1
fi
