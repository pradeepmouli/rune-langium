# Contract: Turnstile verification flow

**Purpose**: Gate the first generation per session behind a CF Turnstile challenge. Subsequent generations in the same session skip the challenge.

## Client → Worker handshake

```
[1] User clicks "Generate" for the first time in the session.
[2] ExportDialog mounts <Turnstile siteKey={VITE_TURNSTILE_SITE_KEY} onSuccess={(token) => ...} />.
[3] Widget completes (invisible for most users), delivers a token to the dialog.
[4] Dialog POSTs /api/generate with `X-Turnstile-Token: <token>`.
[5] Worker verifies token against https://challenges.cloudflare.com/turnstile/v0/siteverify
    with secret from env.TURNSTILE_SECRET.
[6a] If valid: Worker processes the generation, returns 200 + Set-Cookie hcsession=...
[6b] If invalid: Worker returns 401 turnstile_required.
[7] Dialog stores the cookie automatically; subsequent requests carry it and omit the token.
```

## Worker-side verification request

```http
POST https://challenges.cloudflare.com/turnstile/v0/siteverify HTTP/1.1
Content-Type: application/x-www-form-urlencoded

secret=<TURNSTILE_SECRET>&response=<token>&remoteip=<cf-connecting-ip>
```

Expected response:

```json
{
  "success": true,
  "challenge_ts": "2026-04-24T12:34:56.000Z",
  "hostname": "www.daikonic.dev",
  "action": "export-code",
  "cdata": ""
}
```

## Invariants

- **The secret key MUST NEVER appear in the Studio bundle.** Only the site key ships to the browser.
- Verification MUST NOT proceed if `hostname` in the response doesn't match the expected origin (`www.daikonic.dev`) — guards against token replay from a different site.
- A single token MUST only be usable once. Turnstile enforces this server-side; the Worker does not need to dedupe.
- On any verification failure, the Worker returns 401 and does NOT log the token itself (treat as sensitive).

## Session cookie format

```
hcsession=<jwt>; Path=/rune-studio/api; HttpOnly; Secure; SameSite=Strict; Max-Age=3600
```

`<jwt>` is a compact JWT with:

```
{
  "alg": "HS256",
  "typ": "JWT"
}
.
{
  "iat": 1735080000,
  "exp": 1735083600,
  "action": "export-code",
  "iph": "sha256(cf-connecting-ip + daily-salt)"
}
.
<signature>
```

Signed with `env.SESSION_SIGNING_KEY`. On each subsequent request:

- Worker validates signature + expiry + `iph` matches the current request's IP hash.
- If valid: skip Turnstile verification; still subject to rate-limit.
- If invalid / expired / IP changed: challenge again (return 401 with `X-Turnstile-Challenge: required` header).

## Testability

- In tests (Miniflare), use Turnstile's published **dummy keys**:
  - Site key: `1x00000000000000000000AA` (always passes)
  - Secret: `1x0000000000000000000000000000000AA` (always validates)
- This lets vitest + Playwright assert the full handshake without hitting live Turnstile.
