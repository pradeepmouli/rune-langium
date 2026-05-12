# Studio Workers → Pages Functions — Design Spec

**Feature Branch**: `019-studio-workers-pages-functions`
**Status**: Draft — design review
**Created**: 2026-05-12
**Author**: Pradeep Mouli (with brainstorming via Claude Code)
**Predecessor**: [`2026-05-12-codegen-additional-targets-design.md`](2026-05-12-codegen-additional-targets-design.md) (spec 018 — introduced `apps/studio/functions/` and the Pages Functions pattern)

## 1. Goal

Add a same-origin Cloudflare Pages Function fallback for the studio's browser-only `parseWorkspace`, **and** retire the in-browser LSP server entirely in favor of a same-origin Pages Function LSP migrated from `apps/lsp-worker/`. After this spec ships, the studio's browser bundle no longer contains the langium engine; LSP services are network-only, served from the same origin as the studio.

Codegen-worker / preview-gen is **out of scope**: its heavy path (whole-model Download) is already server-side in spec 018, and its remaining browser-side work (per-namespace preview generation) is small and benefits from in-browser execution.

## 2. Architecture overview

### 2.1 Directory layout

```
apps/studio/
├── functions/                              # Pages Functions root (introduced in spec 018)
│   ├── api/
│   │   ├── codegen.ts                      # FROM spec 018 — POST /api/codegen
│   │   ├── parse.ts                        # NEW (this spec) — POST /api/parse
│   │   └── lsp/
│   │       ├── session.ts                  # MIGRATED — POST /api/lsp/session (token mint)
│   │       ├── health.ts                   # MIGRATED — GET  /api/lsp/health
│   │       └── ws.ts                       # MIGRATED — GET  /api/lsp/ws/{token} (WS upgrade)
│   ├── lib/                                # NEW — shared modules (not exposed as routes)
│   │   ├── lsp-auth.ts                     # MIGRATED from apps/lsp-worker/src/auth.ts
│   │   ├── lsp-session-do.ts               # MIGRATED from apps/lsp-worker/src/session.ts (DO class)
│   │   └── lsp-log.ts                      # MIGRATED from apps/lsp-worker/src/log.ts
│   └── _middleware.ts                      # (optional) error → JSON envelope
├── wrangler.toml                           # FROM spec 018 — extended with DO binding
└── src/
    ├── workers/
    │   ├── parser-worker.ts                # KEEPS its browser role; gains `hydrate` handler
    │   ├── codegen-worker.ts               # UNCHANGED
    │   └── lsp-worker.ts                   # DELETED in Phase 2 (~700 lines)
    └── services/
        ├── transport-provider.ts           # SIMPLIFIED to 2 tiers (pages-function + dev websocket)
        ├── worker-transport.ts             # DELETED in Phase 2 (MessagePort transport for the removed lsp-worker)
        └── workspace.ts                    # NEW routing layer: parseWorkspace → /api/parse, others → browser worker
```

After this spec, **`apps/lsp-worker/` is retired** (the package directory is deleted and the standalone Cloudflare Worker deploy is shut down in Phase 3).

### 2.2 What lives where (before vs after)

| Concern | Today | After this spec |
|---------|-------|-----------------|
| `parse` (single file) — every keystroke | Browser parse-worker | Browser parse-worker (unchanged) |
| `parseWorkspace` (full workspace, initial parse) | Browser parse-worker | **Pages Function `/api/parse`** with browser-worker fallback on failure |
| `linkDocument` (after lazy-load) | Browser parse-worker | Browser parse-worker (state hydrated from prior `/api/parse` response) |
| LSP server | In-browser worker primary (`embedded`) + CF Worker fallback (`cf-worker`, deployed at `apps/lsp-worker/`) | **Pages Function `/api/lsp/*` is the only LSP server**, served same-origin |
| LSP client | CodeMirror + `@codemirror/lsp-client` in the studio | Unchanged |
| Codegen Download | Pages Function `/api/codegen` (spec 018) | Unchanged |
| Codegen Preview | Browser codegen-worker | Unchanged |

### 2.3 LSP server vs client clarification

The term "lsp-worker" appears in two places today and means different things:

- `apps/studio/src/workers/lsp-worker.ts` — a **browser Web Worker** that hosts the LSP **server** in-page (deleted in Phase 2).
- `apps/lsp-worker/` — a **Cloudflare Worker** package that hosts the LSP **server** on the edge (retired in Phase 3).

Both consume `createRuneLspServer` from `packages/lsp-server/`. After this spec, the LSP server runs **only** in `apps/studio/functions/api/lsp/`, hosted as a same-origin Pages Function. The studio's CodeMirror editor remains the LSP **client**.

## 3. User Story 1 — `parseWorkspace` routes to server (P1)

A developer opens the studio and loads a workspace containing 50+ Rune files plus an imported curated CDM corpus. Today the browser parse-worker chews on this for several seconds — parsing all files, building the langium index, resolving cross-references. After this spec, the studio's workspace service routes the workspace-wide parse to `/api/parse`. The Pages Function does the work server-side with more memory headroom and a pre-loaded curated corpus, returns a hydration blob, and the browser parse-worker re-builds its in-process state from the blob without re-parsing. Subsequent `linkDocument` requests (e.g., when the user adds a new file or imports a new namespace) continue to work in-browser exactly as before.

### 3.1 Endpoint contract

**Route**: `POST /api/parse` (Pages Function at `apps/studio/functions/api/parse.ts`).

**Request**:

```ts
type ParseRequest = {
  files: Array<{ name: string; content: string }>;
  // Optional: which curated documents the workspace imports. The server
  // pre-loads these. Empty array means use server defaults.
  curated?: Array<{ namespace: string; modelJson: CuratedSerializedDocument['modelJson'] }>;
};
```

**Successful response**:

```ts
type ParseResponse = {
  ok: true;
  models: RosettaModel[];                       // top-level models keyed by namespace
  parsedModels: Array<{ filePath: string; model: RosettaModel }>;
  exports: Array<{ filePath: string; namespace: string; exports: Array<{ type: string; name: string }> }>;
  errors: string[];                             // parse errors (non-fatal)
  hydrationState: HydrationBlob;                // see below
};

type HydrationBlob = {
  documents: Array<{
    uri: string;
    content: string;
    serializedModel: CuratedSerializedDocument['modelJson'];
  }>;
  exportsByNamespace: Record<string, Array<{ type: string; name: string; path: string }>>;
};
```

**Error response** (JSON envelope, same shape as `/api/codegen`):

```ts
type ParseError = {
  ok: false;
  error: string;
  diagnostics?: GeneratorDiagnostic[];
};
```

### 3.2 Browser routing layer

In `apps/studio/src/services/workspace.ts`, the existing `workerRequest()` helper is wrapped:

```ts
async function workerRequest(msg: WorkerRequest): Promise<WorkerResponse> {
  if (msg.type === 'parseWorkspace') {
    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: msg.files })
      });
      if (response.ok) {
        const data = (await response.json()) as ParseResponse;
        // Hydrate the browser worker so subsequent linkDocument requests work.
        await postToBrowserWorker({ type: 'hydrate', id: msg.id, ...data.hydrationState });
        return {
          type: 'parseWorkspaceResult',
          id: msg.id,
          models: data.models,
          parsedModels: data.parsedModels,
          exports: data.exports,
          errors: data.errors
        };
      }
      // Server returned non-2xx — fall through to browser worker.
    } catch {
      // Network failure — fall through to browser worker.
    }
  }
  // Default: route to browser worker (parse, linkDocument, OR parseWorkspace failure-fallback).
  return postToBrowserWorker(msg);
}
```

### 3.3 Browser worker — `hydrate` handler (NEW)

`apps/studio/src/workers/parser-worker.ts` grows one new request type:

```ts
export interface HydrateRequest {
  type: 'hydrate';
  id: string;
  documents: Array<{ uri: string; content: string; serializedModel: CuratedSerializedDocument['modelJson'] }>;
  exportsByNamespace: Record<string, Array<{ type: string; name: string; path: string }>>;
}

// Handler:
case 'hydrate': {
  // Hydration reuses the existing primitives:
  //   - DeferredModelProvider for lazy-loading curated/serialized models (today's curated-corpus path)
  //   - RuneDslIndexManager.registerExports(uri, descriptions) for the symbol index
  for (const doc of msg.documents) {
    // Build a langium document URI and register the deferred model with the existing provider.
    // This is the same code path the curated corpus uses; we extend it to user-authored files.
    const uri = URI.parse(doc.uri);
    deferredModelProvider.register(uri, doc.serializedModel);
  }
  for (const [namespace, exports] of Object.entries(msg.exportsByNamespace)) {
    const uri = URI.parse(`file:///${namespace.replace(/\./g, '/')}.rune`);
    const descriptions = exports.map((e) => /* build AstNodeDescription per existing pattern */ ({
      name: e.name, type: e.type, path: e.path
    } as unknown as AstNodeDescription));
    indexManager.registerExports(uri, descriptions);
  }
  postMessage({ type: 'hydrateResult', id: msg.id, ok: true });
  break;
}
```

The hydration mechanism reuses the existing `DeferredModelProvider` (from `packages/core/src/services/rune-dsl-linker.ts`) and `RuneDslIndexManager.registerExports` (from `packages/core/src/services/rune-dsl-index-manager.ts`). The plan may add a small convenience helper if the per-document registration loop proves cumbersome, but no new core API is strictly required.

### 3.4 Failure modes

| Scenario | Behavior |
|---------|----------|
| `/api/parse` returns 5xx | Studio falls through to browser worker; in dev mode, a console warning is logged; no user-visible toast |
| `/api/parse` returns 400 (malformed request) | Studio raises the error to the workspace store; toast in dev mode only |
| Network unreachable | Same as 5xx — fall through to browser worker |
| `/api/parse` returns 200 but `hydrate` postMessage to browser worker fails | Studio discards the server response and retries via the browser worker |
| Hydration succeeds but later `linkDocument` request fails | Standard error path — surfaced through existing parse-store diagnostics |

### 3.5 Acceptance scenarios

1. **Given** a workspace with 50 files, **When** `parseWorkspace` is invoked, **Then** the studio issues `POST /api/parse` (visible in DevTools Network), the response shape matches `ParseResponse`, and the studio UI shows parsed types as today.
2. **Given** the Pages Function returns 500, **When** the studio retries `parseWorkspace`, **Then** the request transparently falls back to the browser worker and the user sees no error.
3. **Given** a successful `/api/parse` round-trip, **When** the user adds a new file and the studio calls `linkDocument`, **Then** `linkDocument` goes to the browser worker and resolves correctly (the worker's state was hydrated from the server's response).
4. **Given** a single-file `parse` request, **When** the studio invokes it, **Then** the request goes to the browser worker; **`/api/parse` is never called for single-file parses**.
5. **Given** an offline browser, **When** the studio attempts `parseWorkspace`, **Then** the request fails to reach the server, the studio falls through to the browser worker, and the workspace loads as today (perhaps more slowly).

## 4. User Story 2 — LSP migration to Pages Function, retire in-browser LSP (P1)

A developer opens the studio. The studio establishes an LSP session via `POST /api/lsp/session` (same-origin), receives an HMAC-signed token, opens `wss://<studio-origin>/api/lsp/ws/{token}` to the same-origin Pages Function, and uses the LSP server for diagnostics, completions, hovers, and find-references for the entire editing session. **No LSP code runs in the browser.** When the network is unavailable, the editor still loads, edits still save, and syntactic highlighting still works — but semantic LSP features are unavailable and the user sees a clear "Language services unavailable" badge in the editor footer.

### 4.1 What moves where

| From `apps/lsp-worker/` | To `apps/studio/functions/` | Notes |
|-------------------------|------------------------------|-------|
| `src/index.ts` (worker entry, routes) | Split into `api/lsp/session.ts`, `api/lsp/health.ts`, `api/lsp/ws.ts` | Each Pages Function exports `onRequest{Post,Get}` for its route |
| `src/auth.ts` (HMAC, nonce, allowlist, rate-limit) | `lib/lsp-auth.ts` | Imported by the route handlers |
| `src/session.ts` (Durable Object class) | `lib/lsp-session-do.ts` | Re-exported from a Pages Function module so wrangler can bind it |
| `src/log.ts` (Pino logger) | `lib/lsp-log.ts` | Imported by the route handlers |
| `wrangler.toml` DO binding + migrations | Appended to `apps/studio/wrangler.toml` | See 4.2 |

### 4.2 `apps/studio/wrangler.toml` additions

```toml
# Existing from spec 018:
name = "rune-studio"
compatibility_date = "2025-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "./dist"

# NEW for LSP migration:
[[durable_objects.bindings]]
name = "LSP_SESSION"
class_name = "RuneLspSession"
script_name = "rune-studio"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RuneLspSession"]
```

The DO class `RuneLspSession` is exported from a Pages Function module (typically `api/lsp/ws.ts` re-exports it) so wrangler resolves the class name at bind time. Pages Functions support Durable Object bindings the same way standalone Workers do.

### 4.3 Studio side — retire the in-browser LSP

**Files deleted in Phase 2**:

| Path | Approx. LOC |
|------|------------|
| `apps/studio/src/workers/lsp-worker.ts` | ~700 |
| `apps/studio/src/services/worker-transport.ts` | ~150 |
| `apps/studio/test/workers/lsp-worker.test.ts` (if exists) | varies |
| `apps/studio/test/services/worker-transport.test.ts` (if exists) | varies |

**`apps/studio/src/services/transport-provider.ts` simplifies**:

| Before — 3 tiers | After — 2 tiers |
|-----------------|----------------|
| `embedded` (in-browser) → `websocket` (dev override) → `cf-worker` (external CF deploy) | `pages-function` (production, same-origin) → `websocket` (dev override) |

The `pages-function` tier replaces `cf-worker`; the only material difference is the URL (`/api/lsp/*` same-origin instead of `www.daikonic.dev/rune-studio/api/lsp/*` external). All existing token-mint + WS-open + 401-retry logic is preserved verbatim.

The `embedded` tier is removed entirely. `createWorkerTransport` (the MessagePort transport) is deleted along with `worker-transport.ts`.

### 4.4 Connection-state UI

`apps/studio/src/components/EditorFooter.tsx` (or equivalent existing component) gains a connection-state badge derived from `transport-provider.getState()`:

| State | Badge | Behavior |
|-------|-------|----------|
| `connected` | None (silent green dot in dev mode only) | Normal operation |
| `connecting` | "Connecting…" (yellow, animated) | Visible during initial connect + reconnect attempts |
| `error` | "Language services unavailable" (red, with retry button) | Editor still loads; CodeMirror syntactic features only; user can manually retry via `transport-provider.reconnect()` |

No fake fallback: when the WS is unreachable, **we don't silently stub the LSP**. The editor degrades to syntactic-only and the user sees the truth.

### 4.5 Configuration URL changes

`apps/studio/src/config.ts` defaults shift from external host to same-origin:

```ts
const DEFAULT_LSP_SESSION_URL = '/api/lsp/session';
const DEFAULT_LSP_WS_URL = typeof window !== 'undefined'
  ? window.location.origin.replace(/^http/, 'ws') + '/api/lsp/ws'
  : 'wss://localhost:8788/api/lsp/ws';
```

In production with `CF_PAGES=1`, these resolve to:
- `lspSessionUrl` = `https://www.daikonic.dev/rune-studio/studio/api/lsp/session`
- `lspWsUrl` = `wss://www.daikonic.dev/rune-studio/studio/api/lsp/ws`

Per-environment overrides via `VITE_LSP_SESSION_URL` and `VITE_LSP_WS_URL` remain supported for dev workflows (e.g., pointing at a locally-running LSP server during `pnpm dev`).

### 4.6 Auth surface preserved

All four protections move bit-for-bit from `apps/lsp-worker/src/auth.ts`:

- **HMAC-signed session tokens** — same signing key (KV-backed), same payload shape
- **Origin allowlist** — extended to include the studio's same-origin URL (production + staging)
- **Nonce ring** — replay protection on the WS upgrade
- **Per-IP mint rate limit** — KV-backed sliding window

No simplification in this spec. Removing or simplifying auth is reversible later if abuse hasn't materialized; for v1 we ship what's already proven.

### 4.7 Acceptance scenarios

1. **Given** the studio loads, **When** the editor mounts, **Then** the transport-provider's `pages-function` tier mints a session via `POST /api/lsp/session`, opens `wss://<origin>/api/lsp/ws/{token}`, and the connection-state badge shows `connected`.
2. **Given** an active LSP session, **When** the user edits a file, **Then** diagnostics, completions, and hovers all work identically to the previous deployment (no user-visible difference in LSP features).
3. **Given** the network is unreachable on page load, **When** the studio mounts, **Then** the connection-state badge shows `Language services unavailable`, the editor loads with syntactic CodeMirror highlighting only, the user sees a Retry button, and clicking Retry invokes `transport-provider.reconnect()`.
4. **Given** an active LSP session that experiences a temporary network drop, **When** the WS closes unexpectedly, **Then** the transport-provider attempts reconnect with exponential backoff up to `maxReconnectAttempts`, the badge shows `Connecting…` during retries, and on success returns to `connected`.
5. **Given** WebSocket Hibernation kicks in after idle, **When** the user resumes editing, **Then** the connection wakes correctly and the session resumes (same behavior as today's `apps/lsp-worker/`; DO + hibernation moved with the code).
6. **Given** the studio's browser bundle, **When** measured after Phase 2, **Then** the bundle is **smaller** than the pre-migration baseline by an amount proportional to `langium` + `@rune-langium/lsp-server` + the curated corpus loader (exact size in the implementation plan).

## 5. Phasing

| Phase | Scope | Gate to next |
|-------|-------|--------------|
| 0 | **Parse-worker fallback.** New `/api/parse` Pages Function + `hydrate` handler in the browser parse-worker + studio routing layer in `workspace.ts`. Connection failure-fallback verified. No LSP changes. | `parseWorkspace` round-trips server-side; `linkDocument` continues working in browser after hydration; failure-fallback returns to browser worker on 5xx. |
| 1 | **LSP code migration (server-side only).** Move files from `apps/lsp-worker/` into `apps/studio/functions/api/lsp/` and `apps/studio/functions/lib/`. Extend `apps/studio/wrangler.toml` with the DO binding. Deploy in parallel — both old `apps/lsp-worker/` (external host) and new same-origin endpoint run simultaneously. Studio still points at the old URL via env defaults. | Existing `apps/lsp-worker/test/` suites pass against the new endpoint (same auth, same DO, same WS hibernation). |
| 2 | **Studio cutover + in-browser LSP retirement.** Change `apps/studio/src/config.ts` defaults to same-origin URLs. Delete `apps/studio/src/workers/lsp-worker.ts` and `apps/studio/src/services/worker-transport.ts`. Simplify `transport-provider.ts` from 3 tiers to 2. Add connection-state UI to the editor footer. Ship a bundle-size regression test that asserts the new bundle is at least N KB smaller. | All studio Playwright LSP tests green against same-origin URLs; "Language services unavailable" UI renders correctly when WS is unreachable; bundle-size assertion passes. |
| 3 | **Retire `apps/lsp-worker/`.** Remove the standalone Cloudflare Worker deploy. Delete `apps/lsp-worker/` directory. Update root `pnpm-workspace.yaml` and `package.json` to drop the workspace. Add a one-release-cycle redirect from `www.daikonic.dev/rune-studio/api/lsp/*` to the same-origin path. | No callers reference `apps/lsp-worker/`; CI green; redirect tested. |

## 6. Out of scope (explicit)

- **codegen-worker / preview-gen fallback.** The heavy path (Download) is already server-side from spec 018. Per-namespace preview generation is small and stays in the browser.
- **`parse` (single-file) routing to server.** Every keystroke parse stays in the browser worker. Network RTT to the editor loop is a trap we explicitly avoid.
- **`linkDocument` routing to server.** Stays in the browser, hydrated from prior `/api/parse` response.
- **Server-side state for `linkDocument`.** A per-session parser state (DO-backed) is a possible follow-up if hydration proves insufficient at the workspace scales we hit. v1 ships stateless `/api/parse` only.
- **Auth simplification for the new LSP.** Existing HMAC + nonce + rate-limit machinery moves bit-for-bit. No changes.
- **Resurrected in-browser LSP for offline mode.** If user demand materializes for an offline-capable LSP (e.g., desktop deployments), the in-browser LSP can be brought back from git in a follow-up spec — the code isn't lost, just retired from the bundle.
- **Multi-region LSP DO placement.** Cloudflare Durable Objects default to a single region per workspace ID. If specific user segments report latency, multi-region placement is a follow-up. Out of v1.

## 7. Risks

| Risk | Mitigation |
|------|-----------|
| Hydration blob may not capture all langium state needed for downstream `linkDocument` requests. | Phase 0 includes a Playwright test that exercises `parseWorkspace server-side → add new file → linkDocument browser-side` against the CDM corpus. |
| Pages Functions WebSocket Hibernation may behave differently from the standalone CF Worker. | Phase 1 runs `apps/lsp-worker/test/*` suites against the new endpoint. Hibernation is a Workers-runtime feature; should be identical, but we verify rather than assume. |
| Network unavailability fully disables LSP. | Phase 2 ships the `Language services unavailable` UI state. Editor still loads, edits still save, basic CodeMirror highlighting works. We don't lose user data or productivity — only semantic LSP features. |
| Same-origin Pages Function LSP becomes a single point of failure. | Cloudflare Pages 99.99% SLA. WebSocket Hibernation reduces idle cost. Operational monitoring via Cloudflare Analytics. The in-browser LSP code remains in git; if reliability becomes a real concern, resurrection is a follow-up spec, not a code rewrite. |
| RTT-sensitive LSP operations (e.g., signature help while typing function calls) may feel sluggish. | Cloudflare edge RTT typically <50ms; signature help debounces don't blow this budget. If a specific segment reports lag, multi-region DO placement is a follow-up. |
| WebSocket reconnect storms during Cloudflare incidents. | Existing exponential backoff in transport-provider. Phase 2 adds a max-retries-per-minute cap and a `Retry now` button so users aren't stuck in infinite backoff. |
| Bundle-size win from dropping in-browser LSP may be offset by `packages/lsp-server/` being browser-tested or imported elsewhere. | Phase 2 includes a bundle-size assertion (`pnpm --filter @rune-langium/studio build` → measure `dist/assets/*.js` total). Test fails if the post-migration bundle isn't measurably smaller. |
| Existing consumers of the old LSP endpoint (`www.daikonic.dev/rune-studio/api/lsp/*`) break on retirement. | Phase 3 ships a one-release-cycle redirect from the old path to same-origin. Hard-removal only after the next release. |
| Hydration may need helper methods on `packages/core/` if the per-document registration loop is too verbose. | Existing API (`DeferredModelProvider.register`, `RuneDslIndexManager.registerExports`) is sufficient for the v1 hydration. The plan may add a `hydrate(blob)` convenience method if it simplifies the worker handler. No breaking API changes either way. |

## 8. License boundaries

- `apps/studio/functions/api/parse.ts`, `apps/studio/functions/api/lsp/*` — under `apps/studio/`, inherit **FSL-1.1-ALv2**. Functions import MIT `@rune-langium/lsp-server` and `@rune-langium/core` — FSL consuming MIT is permitted.
- `packages/lsp-server/` — remains **MIT**.
- `apps/lsp-worker/` — was **FSL-1.1-ALv2**; the directory is deleted in Phase 3, so the license question moot.

## 9. References

- Predecessor spec: [`2026-05-12-codegen-additional-targets-design.md`](2026-05-12-codegen-additional-targets-design.md)
- Existing browser parse-worker: `apps/studio/src/workers/parser-worker.ts`
- Existing in-browser LSP worker (deleted in Phase 2): `apps/studio/src/workers/lsp-worker.ts`
- Existing CF Worker LSP (retired in Phase 3): `apps/lsp-worker/`
- Existing transport provider: `apps/studio/src/services/transport-provider.ts`
- Shared LSP server library: `packages/lsp-server/`
- Cloudflare Pages Functions: <https://developers.cloudflare.com/pages/functions/>
- Cloudflare Durable Objects in Pages: <https://developers.cloudflare.com/pages/functions/bindings/#durable-object-bindings>
- WebSocket Hibernation: <https://developers.cloudflare.com/durable-objects/best-practices/websockets/#websocket-hibernation-api>
