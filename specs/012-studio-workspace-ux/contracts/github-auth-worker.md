# Contract — GitHub Device-Flow Auth Worker

**Surface**: `https://www.daikonic.dev/rune-studio/api/github-auth/...`
**Spec hooks**: FR-008 (GitHub-as-workspace-backing).

This worker is a thin, stateless mediator for GitHub's OAuth Device Flow.
It holds no per-user state and never persists tokens server-side.

---

## Routes

### `POST /rune-studio/api/github-auth/device-init`

Starts a device-flow grant.

Request body: empty.

Response 200:

```ts
{
  device_code: string;          // forwarded from GitHub, opaque
  user_code: string;            // 8-char code shown to the user
  verification_uri: string;     // https://github.com/login/device
  expires_in: number;           // seconds (typically 900)
  interval: number;             // minimum poll interval, seconds
}
```

Response 503: `{ error: 'github_unavailable' }` — GitHub returned 5xx.

### `POST /rune-studio/api/github-auth/device-poll`

Polls GitHub for token-grant completion.

Request body:

```ts
{ device_code: string }
```

Response 200 (success): `{ access_token: string; scope: string; token_type: 'bearer' }`
Response 202 (pending): `{ status: 'authorization_pending' }`
Response 410 (expired): `{ error: 'expired_token', message }`
Response 400 (bad request): `{ error: 'invalid_device_code' }`

Clients MUST respect the `interval` returned by `device-init` — the worker
rejects requests faster than that with `429`.

The worker NEVER:

- Stores `access_token` server-side.
- Logs `access_token`, `device_code`, or `user_code`.
- Returns the token to any origin other than `www.daikonic.dev`.

---

## Token lifecycle (client-side)

After `device-poll` returns `access_token`, the client:

1. Writes the token to `<workspace-id>/.studio/token` in OPFS.
2. Stores the GitHub login (display name) in `WorkspaceRecord.gitBacking.user`.
3. Treats the token as scoped to that one workspace; deleting the workspace
   deletes the token.

To revoke, the user either:

- Disconnects in Studio (deletes `<workspace-id>/.studio/token`), or
- Revokes the OAuth grant on GitHub (Studio detects 401 on next push and
  prompts the user to reconnect).

---

## CORS / origin

Strictly `https://www.daikonic.dev`. No `*`. The worker mirrors the origin
back to keep the HTTP surface minimal — anything else is `403`.

---

## Privacy

The worker's logs (pino with the same redact set as `apps/codegen-worker`)
do not include device codes, user codes, or access tokens. Only event
counts and error categories.
