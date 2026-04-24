# Data Model: Hosted codegen service

**Feature**: `011-export-code-cf`
**Date**: 2026-04-24

The hosted service is largely stateless. Persistent state is limited to per-IP rate-limit counters in a Durable Object. Everything else is request-scoped.

## Entities

### `CodeGenerationRequest` *(reused, unchanged)*

Already defined in `@rune-langium/codegen`. The Worker forwards it verbatim to the container.

| Field | Type | Notes |
|---|---|---|
| `language` | `string` | e.g. `"java"`, `"typescript"`, `"json-schema"`. Matches a name returned by `codegen-cli --list-languages`. |
| `files` | `{ path: string; content: string }[]` | `.rosetta` source files. User-authored content only — reference models (CDM, etc.) are NOT sent. |
| `config` | `Record<string, unknown>` *(optional)* | Generator-specific options passed through unchanged. |

### `CodeGenerationResult` *(reused, unchanged)*

Already defined in `@rune-langium/codegen`. The Worker forwards the container's response verbatim.

| Field | Type | Notes |
|---|---|---|
| `language` | `string` | Echo of request. |
| `files` | `GeneratedFile[]` | `{ path, content, size }`. Empty on error. |
| `errors` | `GenerationError[]` | `{ sourceFile, construct, message }`. Empty on success. |

### `TurnstileSession`

Ephemeral session marker issued by the Worker after a successful Turnstile verification. Not persisted server-side — encoded as a signed cookie.

| Field | Type | Notes |
|---|---|---|
| `iat` (issued-at) | `number` | Unix seconds. |
| `exp` (expires) | `number` | `iat + 3600`. |
| `turnstile_action` | `string` | Fixed value `"export-code"` for observability. |
| `ip_hash` | `string` | SHA-256 of (request IP + daily salt). Invalidates the cookie if the client's IP rotates, forcing a re-challenge. |

Signing: HMAC-SHA256 with a secret stored in `env.SESSION_SIGNING_KEY` (Worker secret). Encoded as a compact JWT.

### `RateLimitCounter`

Persisted in the Durable Object. One DO instance per IP (derived from `cf-connecting-ip`). Two integer counters per instance, keyed on the current hour and day.

| Field | Type | Notes |
|---|---|---|
| `hour_bucket` | `number` | `Math.floor(Date.now() / 3_600_000)`. Keyed storage: `h:<bucket>` → count. |
| `day_bucket` | `number` | `Math.floor(Date.now() / 86_400_000)`. Keyed storage: `d:<bucket>` → count. |
| `hour_count` | `number` | Current value at the `h:<bucket>` key. Max 10 (FR-005). |
| `day_count` | `number` | Current value at the `d:<bucket>` key. Max 100 (FR-005). |

**State transitions**:

- On each request: DO reads both counters, compares to caps, either increments + allows, or returns `allowed=false` with the smallest `retry_after_s` of the two buckets.
- **No GC**: old buckets are simply never read again. The DO's storage stays small because IP ranges churn naturally; a single DO instance holds a handful of stale integers.

**Invariants**:

- `hour_count <= 10` and `day_count <= 100` at all times (enforced by the DO itself; no external caller increments directly).
- Counter writes are atomic within the DO (single-threaded execution guarantee).

### `WorkerLogEntry` *(log-only, not stored in application state)*

Emitted to Cloudflare Tail for each request. Consumable by CF's Logpush / Tail / Analytics.

| Field | Type | Notes |
|---|---|---|
| `ts` | `number` | Unix ms. |
| `ip_hash` | `string` | Same hash as `TurnstileSession.ip_hash`. Never the raw IP. |
| `language` | `string` | Generator selected. |
| `bytes_out` | `number` | Total size of generated files (for observability / cost correlation). |
| `duration_ms` | `number` | End-to-end from Worker entry to response flush. |
| `status` | `200 \| 422 \| 429 \| 5xx` | HTTP status returned to the client. |
| `cold_start` | `boolean` | `true` if the container was newly warmed. Informs cold-start metrics for SC-002. |

**Explicitly excluded** (FR-008): `files` array of request or response, user model content, any stack trace containing source fragments.

## Relationships

```
Browser session
  │
  └─> TurnstileSession (cookie)
         │
         │ every generation request carries this cookie
         ▼
  Worker (edge)
         │
         ├──► RateLimitCounter (DO by IP)   ─── allow/deny
         │
         └──► Container binding              ─── forward CodeGenerationRequest,
                                                  receive CodeGenerationResult
```

No entity persists user-submitted source. The Durable Object holds only integer counters; the cookie holds only session metadata; logs hold only dimensions, never bodies.
