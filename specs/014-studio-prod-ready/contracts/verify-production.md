# Contract — `verify-production.sh`

**Spec hooks**: FR-016, SC-003, US6.

The script `scripts/verify-production.sh` already exists from the
012 review pass. This contract describes its current production wire
shape after the legacy `$BASE/api/lsp/health` probe was removed in
favor of the same-origin Pages Function checks under `$ROOT_BASE/api/*`.

---

## Invocation

```sh
pnpm run verify:prod
# OR
BASE=https://staging.example/rune-studio ./scripts/verify-production.sh
```

**Env**:

| Var | Default | Purpose |
|---|---|---|
| `BASE` | `https://www.daikonic.dev/rune-studio` | Override origin for previews / staging. |
| `STRICT` | `0` | When `1`, treat warnings as failures. |

**Exit codes**:

| Code | Meaning |
|---|---|
| `0` | All checks passed |
| `1` | At least one check failed |
| `2` | `curl` not on PATH |

**Output**: one line per check, `PASS …` / `WARN …` / `FAIL …`. The
parent shell can grep / pipe / fail on `^FAIL`.

---

## Probe inventory

| # | Check | Expected | Failure points |
|---|---|---|---|
| 1 | `GET <BASE>/studio/` | 200 + HTML | Studio HTML not deployed; check CF Pages |
| 2a | `GET <ROOT>/curated/cdm/manifest.json` | 200 + valid manifest shape, OR 304 cached | 404 empty body = curated-mirror Worker unrouted; 404 with body = Worker live but R2 empty |
| 2b | `GET <ROOT>/curated/fpml/manifest.json` | same | same |
| 2c | `GET <ROOT>/curated/rune-dsl/manifest.json` | same | same |
| 3 | `POST <BASE>/api/telemetry/v1/event` (valid body) | 204 | 405 = Worker unrouted; 403 = ALLOWED_ORIGIN missing this BASE |
| 4 | `POST <BASE>/api/telemetry/v1/event` (extra field) | 400 schema_violation | Schema not `.strict()` in production |
| 5 | `POST <BASE>/api/github-auth/device-init` | 200 with `device_code`/`user_code`, OR 502 misconfig (warn), OR 503 upstream (warn) | 405 = Worker unrouted |
| 6 | `POST <BASE>/api/random-nonexistent-<ts>` | NOT 405 (or NOT same status as the real telemetry POST) | Catch-all is eating `/api/*` requests; tighten codegen-worker route |
| 7a | `GET <ROOT_BASE>/api/lsp/health` | 200 with `langium_loaded:true`, OR 404 warn while Pages Functions are not yet deployed | `langium_loaded:false` = Pages Function live but langium import failed |
| 7b | `POST <ROOT_BASE>/api/lsp/session` (no `Origin`) | 400/401/403, OR 404/405 warn while Pages Functions are not yet deployed | 200 = origin allowlist is not enforced |
| 7c | `POST <ROOT_BASE>/api/parse` (`{}`) | 400, OR 404/405 warn while Pages Functions are not yet deployed | Any other status means parse validation is broken or unrouted |

---

## Output schema

Each line of output is one of:

```
PASS  <label>
PASS  <label> (<extra>)
WARN  <label>
      <reason>
FAIL  <label>
      <reason>
```

The trailing summary block:

```
─────────────────────────────────────────
Production verification {PASSED | FAILED}: <N> failure(s), <N> warning(s).
[hint pointing at the most likely cause]
```

---

## CI integration (optional follow-up)

A new `studio-prod-verify` GitHub Action job MAY run
`pnpm run verify:prod` against the production deploy after every
release. NOT in scope for feature 014 (verification is on-demand
post-deploy); listed here so a future PR can wire it without
re-specifying the script's contract.
