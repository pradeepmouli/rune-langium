# HTTP Contract: `GET /api/generate/health`

**Public URL (deployed)**: `https://www.daikonic.dev/rune-studio/api/generate/health`
**Local dev equivalent**: `http://localhost:8377/api/generate/health`

## Request

```http
GET /api/generate/health HTTP/1.1
Host: www.daikonic.dev
```

No body, no auth, no Turnstile. Rate-limited at a separate cheap bucket (60/hr/IP) to prevent trivial abuse.

## Responses

### `200 OK` — container warm and reachable

```json
{
  "status": "ok",
  "cold_start_likely": false,
  "languages": ["java", "typescript", "json-schema", "zod", "python"]
}
```

`languages` MUST match `codegen-cli --list-languages` running inside the container. **FR-001** uses this endpoint to populate the language picker on the deployed site.

### `200 OK` — container responded but may be cold

```json
{
  "status": "ok",
  "cold_start_likely": true,
  "languages": ["java", "typescript", "json-schema", "zod", "python"]
}
```

The Worker sets `cold_start_likely: true` when the container binding took >3s to respond. The dialog uses this to show a "warming up..." indicator on the first Generate click.

### `5xx` — container unreachable

```json
{
  "status": "unavailable",
  "message": "The code generation service is temporarily unavailable."
}
```

Client falls back to disabling the Generate button with a clear message per FR-011.

## Performance contract

- **FR-002**: Client MUST receive a 200 response within 2 seconds on the deployed site. If the Worker cannot reach the container in that window, it returns a **200 with `cold_start_likely: true`** using a cached language list from the previous successful health check (stored in Worker KV), rather than making the client wait.
- The Worker MUST cache the last successful `languages` list in KV with a 1-hour TTL so cold health checks still return a populated language picker.
