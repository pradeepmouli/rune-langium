# Contract — `verify-production.sh` (extended)

**Spec hooks**: FR-016, SC-003, US6.

The script `scripts/verify-production.sh` already exists from the
012 review pass. This contract describes its **full** wire shape
after Phase 4 lands (LSP probe added). Everything below is currently
implemented EXCEPT the LSP-health check.

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

## Probe inventory (post-Phase-4)

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
| **7** **(NEW)** | **`GET <BASE>/api/lsp/health`** | **200 with `{ok: true, langium_loaded: true}`** | 404 = LSP worker unrouted; 200 with `langium_loaded: false` = worker up but langium import failed at runtime |

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
