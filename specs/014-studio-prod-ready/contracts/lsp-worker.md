# Contract — LSP Worker (apps/lsp-worker)

**Surface**:
- `POST   https://www.daikonic.dev/rune-studio/api/lsp/session`
- `GET    https://www.daikonic.dev/rune-studio/api/lsp/health`
- `WS     wss://www.daikonic.dev/rune-studio/api/lsp/ws/<sessionToken>`

**Spec hooks**: FR-013, FR-014, FR-015, FR-018, US3, SC-005.

---

## Auth + origin posture

Every request enforces `Origin === env.ALLOWED_ORIGIN` (default
`https://www.daikonic.dev`). Cross-origin POST → `403`,
no body action. The LSP worker NEVER persists user data beyond the
DO-bound session state in §3 of `data-model.md`.

---

## POST /api/lsp/session — mint a session token

```http
POST /rune-studio/api/lsp/session
Content-Type: application/json
Origin: https://www.daikonic.dev

{ "workspaceId": "01J7M…ULID" }
```

**Body** (Zod-validated, closed schema):

```ts
const SessionRequest = z.object({
  workspaceId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/) // ULID
}).strict();
```

**Responses**:

| Status | Body | Meaning |
|---|---|---|
| `200` | `{ token, expiresAt }` (token = base64url HMAC-signed JSON; see data-model §2) | Token minted |
| `400` | `{ error: "schema_violation", details }` | Body failed validation |
| `403` | `{ error: "origin_not_allowed" }` | Origin not in allowlist |
| `429` | `{ error: "rate_limited", retry_after_s }` | More than 30 token mints / minute / IP |

---

## GET /api/lsp/health — reachability + langium-load probe

No auth, no origin check (it's a smoke probe).

```http
GET /rune-studio/api/lsp/health
```

**Response 200**:

```json
{
  "ok": true,
  "version": "0.1.0",
  "langium_loaded": true,
  "uptime_seconds": 1234
}
```

`langium_loaded: false` indicates the worker is up but the langium
import failed at runtime (e.g. a Vite-bundle-rolled-up-the-wrong-file
regression — exactly the failure mode the production verification
agent flagged for the Studio bundle).

---

## WS /api/lsp/ws/&lt;sessionToken&gt; — language-services channel

Standard JSON-RPC 2.0 LSP wire format over WebSocket. The Worker
upgrades the connection and forwards to the per-session DO; the DO
holds langium services + open-document state.

**Upgrade request**:

```http
GET /rune-studio/api/lsp/ws/<sessionToken> HTTP/1.1
Host: www.daikonic.dev
Connection: Upgrade
Upgrade: websocket
Origin: https://www.daikonic.dev
Sec-WebSocket-Version: 13
Sec-WebSocket-Key: <client-nonce>
```

**Token validation** — the Worker verifies before upgrading:
1. Token signature with `SESSION_SIGNING_KEY` secret.
2. `token.exp > now`.
3. `token.origin === request.headers.Origin`.
4. `token.nonce` not in the LSP worker's per-isolate consumed-nonce ring (replay protection).

**Failures**:

| Status | Reason |
|---|---|
| `401 invalid_session` | Token sig / exp / origin mismatch. Client should mint a fresh one. |
| `403 origin_not_allowed` | Origin header outside allowlist. |
| `409 nonce_replay` | Token's nonce already seen within 24h on this isolate. |
| `426 upgrade_required` | Non-WebSocket request to the WS path. |

**On success**: HTTP `101 Switching Protocols`. The DO calls `acceptWebSocket()` so subsequent client messages fire the DO's `webSocketMessage(ws, msg)` handler with hibernation enabled.

---

## LSP messages handled

The DO terminates the LSP server side. Supported JSON-RPC methods:

| Method | Direction | Behaviour |
|---|---|---|
| `initialize` | client → server | Returns `serverCapabilities` (textDocumentSync.full, hoverProvider, completionProvider, definitionProvider, diagnosticProvider). |
| `initialized` | client → server | No-op ack. |
| `textDocument/didOpen` | client → server | Adds the URI to `state.storage.docs:<uri>`; triggers parse. |
| `textDocument/didChange` | client → server | Replaces document content; debounced 200ms before re-parse. |
| `textDocument/didClose` | client → server | Removes the URI from storage. |
| `textDocument/publishDiagnostics` | server → client | Emitted after each parse pass with all current diagnostics. |
| `textDocument/hover` | client ↔ server | Synchronous response; ≤1s budget per SC-005. |
| `textDocument/completion` | client ↔ server | Synchronous response; ≤1s budget per SC-005. |
| `textDocument/definition` | client ↔ server | Synchronous response. |
| `shutdown` | client → server | Server-initiated DO storage flush; client SHOULD then `exit`. |
| `exit` | client → server | DO terminates the WS; goes hibernating. |

Unsupported methods return `methodNotFound` per JSON-RPC 2.0.

---

## Idle / hibernation lifecycle

- **Active**: WS attached, `langium` services held in memory.
- **Hibernating**: 30s of WS inactivity → CF auto-hibernates the DO. Client's WS connection survives via CF's hibernation API; the next message rebuilds in-memory state by hydrating `state.storage.docs:*`.
- **Reaped**: 30 min of no message + WS hibernated → DO storage is GC-eligible. Next connect from this `(workspaceId, token)` pair gets a fresh DO.

---

## Telemetry hooks

The LSP Worker emits the existing `workspace_open_*` events to the
telemetry worker on a successful session creation, AND a new
`lsp_session_opened` / `lsp_session_failed` pair (closed-schema
addition, FR-005). Field set:

```ts
z.object({
  event: z.literal('lsp_session_opened' | 'lsp_session_failed'),
  studio_version: z.string().max(32),
  ua_class: z.string().max(64),
  // failed only:
  errorCategory: z.enum(['origin_blocked', 'token_expired', 'nonce_replay', 'upstream_unhealthy', 'unknown']).optional()
}).strict()
```

Adding these requires a one-line update to `apps/telemetry-worker`'s
discriminated union.

---

## Privacy invariants (carried + new)

- IP-hashing identical to the telemetry worker (daily-rotating salt held in the same `TelemetryAggregator` DO under `salt:<UTC-day>`).
- Session token signature key (`SESSION_SIGNING_KEY`) NEVER leaves the worker; rotated on a per-feature-release cadence.
- WS message bodies (LSP payloads) NEVER appear in logs. Pino's redact set extends with `params.contentChanges`, `params.text`, `result.contents` — anything carrying source code.
- Source code stored in DO `state.storage.docs:<uri>` is bound to the DO's lifetime; `shutdown` clears it.
