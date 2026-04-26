# Contract — Telemetry Event

**Surface**: `POST https://www.daikonic.dev/rune-studio/api/telemetry/v1/event`
**Spec hooks**: FR-T01–T05, SC-009.

---

## Request

```http
POST /rune-studio/api/telemetry/v1/event HTTP/1.1
Content-Type: application/json
```

Body — Zod-validated server-side; any extra field is rejected with `400`:

```ts
const TelemetryEventBody = z.discriminatedUnion('event', [
  z.object({
    event: z.literal('curated_load_attempt'),
    modelId: z.enum(['cdm', 'fpml', 'rune-dsl']),
    studio_version: z.string().max(32),
    ua_class: z.string().max(64)
  }),
  z.object({
    event: z.literal('curated_load_success'),
    modelId: z.enum(['cdm', 'fpml', 'rune-dsl']),
    durationMs: z.number().int().nonnegative().max(600_000),
    studio_version: z.string().max(32),
    ua_class: z.string().max(64)
  }),
  z.object({
    event: z.literal('curated_load_failure'),
    modelId: z.enum(['cdm', 'fpml', 'rune-dsl']),
    errorCategory: z.enum([
      'network', 'archive_not_found', 'archive_decode',
      'storage_quota', 'permission_denied', 'cancelled', 'unknown'
    ]),
    studio_version: z.string().max(32),
    ua_class: z.string().max(64)
  }),
  z.object({
    event: z.enum([
      'workspace_open_success', 'workspace_open_failure',
      'workspace_restore_success', 'workspace_restore_failure'
    ]),
    studio_version: z.string().max(32),
    ua_class: z.string().max(64)
  })
]);
```

The server stamps `occurred_at` itself; clients MUST NOT send a timestamp.
The server-side `cf-connecting-ip` is hashed with the daily-rotating salt
and used only to deduplicate rapid-fire repeats from one client; it is
never persisted in raw form.

---

## Responses

| Status | Body | Meaning |
|---|---|---|
| `204` | empty | Accepted. No data returned. |
| `400` | `{ error: 'schema_violation', details: <Zod error> }` | Body did not validate. |
| `429` | `{ error: 'rate_limited', retry_after_s }` | Per-IP throttle (10 events / minute, ample for any honest client). |

Clients MUST NOT block the user on a telemetry response. A `429` or `5xx`
is dropped silently — the Studio client (`apps/studio/src/services/telemetry.ts`)
posts once with `keepalive: true` and swallows any failure. Servers MUST
tolerate occasional missed events; the budget for SC-009 (≥95% reported
success rate) accounts for this best-effort delivery.

---

## Aggregation

The receiving worker forwards each event to a Durable Object keyed by
`<event-name>:<UTC-day>`. The DO holds a single counter per `errorCategory`
(or `null` for non-erroring events) and persists it via `storage.put` after
each increment. This satisfies SC-009 (≥95% success rate verifiable via
`success / (success + failure)` per modelId per day).

`GET /rune-studio/api/telemetry/v1/stats` returns the rolling window. It is
gated by CF Access (admin email allowlist); end users cannot read the
aggregate either.

---

## Privacy posture (FR-T02 explicit)

The body schema cannot carry:

- File contents, file paths, or file names.
- Repository URLs, branch names, or git commit SHAs.
- The user's IP address (server hashes; never persists raw).
- Any persistent client identifier (no `clientId`, no `sessionId`).
- Free-form text fields (the schema is closed enums + bounded strings).

Studio's settings page links to a privacy note that names every field above
and quotes this contract.

---

## Disabled-by-default-in-dev

`http://localhost:*` clients silently no-op all telemetry. The check is
client-side: if `window.location.hostname` is `localhost`, `127.0.0.1`, or
`0.0.0.0`, no fetch is issued. This way developers don't pollute prod
counters, and tests don't need to mock the endpoint.
