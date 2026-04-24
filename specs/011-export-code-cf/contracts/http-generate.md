# HTTP Contract: `POST /api/generate`

**Public URL (deployed)**: `https://www.daikonic.dev/rune-studio/api/generate`
**Local dev equivalent**: `http://localhost:8377/api/generate`

## Request

```http
POST /api/generate HTTP/1.1
Host: www.daikonic.dev
Content-Type: application/json
Cookie: hcsession=<jwt>                    # present if Turnstile already passed this session
X-Turnstile-Token: <token>                 # present on the first request per session; omitted on subsequent requests
```

Body:

```json
{
  "language": "typescript",
  "files": [
    { "path": "demo.rosetta", "content": "namespace demo\n\ntype Foo:\n  bar string (1..1)\n" }
  ],
  "config": {}
}
```

Schema: identical to `CodeGenerationRequest` from `@rune-langium/codegen`. **FR-009** guarantees the Worker does not rewrite or validate-past-structure.

## Responses

### `200 OK` — generation succeeded

```json
{
  "language": "typescript",
  "files": [
    { "path": "Foo.ts", "content": "export interface Foo { bar: string }\n", "size": 42 }
  ],
  "errors": []
}
```

Sets `Set-Cookie: hcsession=<jwt>; Path=/rune-studio/api; HttpOnly; Secure; SameSite=Strict; Max-Age=3600` if this request included a valid `X-Turnstile-Token` (i.e. first gen in the session).

### `422 Unprocessable Entity` — parse errors in the input model

```json
{
  "language": "typescript",
  "files": [],
  "errors": [
    { "sourceFile": "demo.rosetta", "construct": "type Foo", "message": "Unknown type 'Bar'" }
  ]
}
```

No cookie mutation. Client surfaces errors in the dialog per FR-011.

### `401 Unauthorized` — missing/invalid Turnstile token on first request

```json
{ "error": "turnstile_required", "message": "Please complete the verification challenge." }
```

Client re-renders the Turnstile widget and retries with the new token.

### `429 Too Many Requests` — rate limit exceeded

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 2400
Content-Type: application/json
```

```json
{
  "error": "rate_limited",
  "scope": "hour",
  "limit": 10,
  "remaining_hour": 0,
  "remaining_day": 37,
  "retry_after_s": 2400,
  "message": "You've hit the free-tier limit (10/hour). Try again in 40 minutes, or run Studio locally for unlimited generation."
}
```

`scope` is `"hour"` or `"day"` depending on which cap tripped. Smallest `retry_after_s` wins.

### `5xx` — container cold-start failure, container crash, or timeout

```json
{
  "error": "upstream_failure",
  "message": "The code generation service is temporarily unavailable. Please try again in a minute.",
  "retryable": true
}
```

The Worker retries the container binding once (with exponential backoff) before returning 5xx. Clients surface a specific error per FR-011 and offer a "run Studio locally" fallback.

## Invariants

- The Worker MUST NOT mutate `request.files[].content` before forwarding.
- The Worker MUST NOT include `request.files[].content` in any log line.
- `Retry-After` MUST always be a positive integer when status is 429.
- `Set-Cookie` MUST only issue on 200 responses that consumed a `X-Turnstile-Token`.
