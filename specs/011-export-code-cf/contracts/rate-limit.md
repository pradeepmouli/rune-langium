# Contract: Rate-limit Durable Object

**Purpose**: Enforce per-IP rate limits (10/hr, 100/day per FR-005) with strong consistency across CF edge PoPs.

## DO Namespace

Bound in `wrangler.toml` as `RATE_LIMITER`. Instance key = `cf-connecting-ip` of the request.

```toml
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"
```

## RPC methods (via `fetch` on the DO stub)

### `POST /check`

Called by the Worker on every generation request (after Turnstile + before container dispatch).

**Request body**: `{}`  (no parameters; IP is the DO instance key)

**Response**:

```json
{
  "allowed": true,
  "remaining_hour": 8,
  "remaining_day": 97,
  "retry_after_s": 0,
  "scope_tripped": null
}
```

When rejected:

```json
{
  "allowed": false,
  "remaining_hour": 0,
  "remaining_day": 37,
  "retry_after_s": 2400,
  "scope_tripped": "hour"
}
```

**Side effect**: on `allowed: true`, the DO atomically increments both the hour and day counters.

### `POST /check-health`

Called by the `/api/generate/health` endpoint. Uses a separate, looser budget (60/hr/IP) to avoid burning the generation budget on a health probe.

**Request body**: `{}`

**Response**: same shape as `/check`, but counters and caps are separate storage keys (`hh:<bucket>`, `hd:<bucket>`).

### `GET /diag` *(debug-only)*

Returns current counter state for the instance's IP without incrementing. Gated behind a Worker-only internal token so it's not publicly reachable.

```json
{
  "hour_bucket": 480303,
  "hour_count": 8,
  "hour_cap": 10,
  "day_bucket": 20013,
  "day_count": 97,
  "day_cap": 100
}
```

## Invariants

- Counter writes happen inside the DO's single-threaded handler — no external race conditions.
- `retry_after_s` is computed as `seconds_until_next_bucket_boundary` for the tripped scope.
- Counter keys expire naturally by being read-only for old buckets; storage growth is O(unique IPs × 2) worst case. For <10k unique IPs/day, storage stays under 1 MB per DO instance.
- The DO MUST NOT store the raw IP in its state — the IP is implicit in the instance key and never serialized.

## Testability

Miniflare's DO test harness can drive these methods directly:

```typescript
const stub = env.RATE_LIMITER.get(env.RATE_LIMITER.idFromName('203.0.113.5'));
for (let i = 0; i < 11; i++) {
  const response = await stub.fetch(new Request('http://do/check', { method: 'POST' }));
  const body = await response.json();
  if (i < 10) expect(body.allowed).toBe(true);
  else expect(body.allowed).toBe(false);
}
```

This runs entirely in-process — no CF account needed, deterministic, and fits the Constitution II (deterministic fixtures) requirement.
