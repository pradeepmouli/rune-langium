# Contract — Curated Mirror HTTP

**Surface**: `https://www.daikonic.dev/curated/<modelId>/...`
**Backed by**: CF R2 bucket `rune-curated-mirror`, fronted by a worker route.
**Spec hooks**: FR-001, FR-002, FR-005a, FR-005b, FR-006.

---

## Routes

### `GET /curated/<modelId>/manifest.json`

Returns the freshest [`CuratedManifest`](../data-model.md#3-r2-layout-curated-mirror).

| Status | Meaning |
|---|---|
| 200 | OK; body is a `CuratedManifest`. `Cache-Control: public, max-age=300`. ETag set. |
| 304 | Conditional fetch matched (`If-None-Match`). Body empty. |
| 404 | Unknown `modelId`. Body: `{ error: 'unknown_model_id', modelId }`. |

Clients SHOULD send `If-None-Match: <etag>` with the cached etag so freshness
checks (FR-005b) cost almost nothing on the wire.

### `GET /curated/<modelId>/latest.tar.gz`

Returns the bytes of the most recent archive. Streamed; do not require the
full body in memory on either end.

| Status | Meaning |
|---|---|
| 200 | OK; body is `application/gzip`. `Cache-Control: public, max-age=86400, immutable`. |
| 404 | Unknown `modelId` OR no archive yet uploaded for this `modelId`. |

`Content-Length` MUST be present so clients can show progress (FR-002).

### `GET /curated/<modelId>/archives/<version>.tar.gz`

Same as `latest.tar.gz` but for a specific historical version. 404 if outside
the 14-archive retention window (data-model §3).

---

## Failure modes the client distinguishes

These map to FR-002's "distinct error message" requirement:

| Scenario | Surface |
|---|---|
| Network failure (offline, DNS, TLS) | `network` |
| `manifest.json` 404 | `unknown_model_id` |
| `latest.tar.gz` 404 with `manifest.json` 200 | `archive_not_found` (mirror inconsistency, alarm-worthy) |
| 5xx | `network` (retried twice with backoff before surfacing) |
| Body smaller than `Content-Length` | `archive_decode` |
| sha256 mismatch | `archive_decode` |
| `pako` / tar-parser error | `archive_decode` |

Telemetry: every load attempt emits `curated_load_attempt`; every terminal
state emits `curated_load_success` or `curated_load_failure` with the
matching `errorCategory`.

---

## CORS

Same-origin in production (`www.daikonic.dev/curated/...`). The CF Worker
route MUST set:

```
Access-Control-Allow-Origin: https://www.daikonic.dev
```

…on every response, even for non-`OPTIONS` (so devtools shows the header).
No `*` — we don't want third-party origins fetching our mirror.

---

## Security / abuse posture

The R2 bucket holds public open-source content. Read traffic is unauthenticated.
The mirror is not a CDN we promise to anyone else; if it's hot-linked from
elsewhere, we reserve the right to add a CF Workers route guard that gates
on `Origin`.

The Cron Trigger that *populates* the bucket runs in CF and uses a service
account scoped to write-only against this bucket; no client ever writes.

---

## Backwards compatibility

Adding new `modelId`s is non-breaking. Adding new fields to `CuratedManifest`
is non-breaking (clients tolerate unknown fields per FR-025-style policy).
Removing or renaming a field bumps `CuratedManifest.schemaVersion`.
