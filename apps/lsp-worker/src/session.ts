// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * RuneLspSession Durable Object (T041).
 *
 * Per `specs/014-studio-prod-ready/data-model.md` §1 + `contracts/lsp-worker.md`
 * "LSP messages handled". One DO per connection (see `apps/lsp-worker/src/index.ts`'s
 * `handleWsUpgrade`); holds the connected client's WebSocket, the real Langium
 * LSP server, and a `docs:*` storage mirror derived from Langium's own
 * post-build document text. Hibernates after CF-managed WS idle; on wake the
 * `webSocketMessage` path replays the client's original `initialize` handshake
 * plus stored documents into a freshly-constructed Langium server before
 * forwarding real traffic — see `ensureLangium`/`replayIfColdWake`.
 *
 * Lifecycle:
 *   1. Worker forwards the WS upgrade Request to the DO via stub.fetch().
 *   2. DO calls `state.acceptWebSocket(server)` — CF-Worker-side
 *      hibernation API; `webSocketMessage(ws, msg)` fires for each frame.
 *   3. Every message forwards to the real Langium server via
 *      `DurableObjectWebSocketTransport.receive()` — see
 *      `docs/superpowers/specs/2026-05-13-lsp-server-feature-parity-design.md`.
 *   4. `shutdown` purges `docs:*`/meta storage; `webSocketClose` clears the
 *      in-memory transport.
 *
 * Two load-bearing patterns folded in from the T035 spike (per
 * `specs/014-studio-prod-ready/spike-result.md`):
 *
 *   1. `nodejs_compat` flag (configured in wrangler.toml, NOT here) is
 *      required for langium's transitive Buffer / util.inspect deps.
 *   2. After accepting the WS, we synthesise an 'open' Event so
 *      `@lspeasy/core`'s `WebSocketTransport` flips its `connected` flag.
 *      Without this the transport silently buffers messages.
 */

import type { DurableObjectState } from '@cloudflare/workers-types';
import { createRuneLspServer, DurableObjectWebSocketTransport, type RuneLspServer } from '@rune-langium/lsp-server';
import { DocumentState } from 'langium';
import { logger } from './log.js';

// ────────────────────────────────────────────────────────────────────────────
// Storage shape (data-model §1)
// ────────────────────────────────────────────────────────────────────────────

interface MetaRecord {
  workspaceId: string;
  createdAt: number;
  lastActiveAt: number;
  /** sha256-hex of (origin + daily salt). Mismatch → 403 from the Worker. */
  originHash?: string;
}

const DOC_PREFIX = 'docs:';
const META_KEY = 'meta';
/** Persisted verbatim client `initialize` params — replayed on a cold DO wake. */
const INIT_PARAMS_KEY = 'meta:initializeParams';
/** Dummy id on the replayed `initialize` — never seen by the real client. */
const SENTINEL_INITIALIZE_ID = '__replay_initialize__';
/**
 * Safety-net ceiling used in three places: {@link RuneLspSession.waitForResponse}
 * while awaiting the replayed `initialize`'s real ack; a real request's
 * `state.waitUntil` response-ack registration in
 * {@link RuneLspSession.webSocketMessage}; and that same method's
 * document-build-settle wait, which bounds a delete-only rebuild round
 * that never fires the event it would otherwise wait on. Generous on
 * purpose: it only fires if something is genuinely wrong (a bug, a hung
 * handler, or — for the build wait — an empty rebuild set), in which case
 * letting the event end anyway is better than hanging the DO forever, but
 * 20ms-style short guesses are exactly what raced a slower real init in
 * production.
 */
const RESPONSE_ACK_TIMEOUT_MS = 5000;
/**
 * TEMPORARY diagnostic instrumentation (see top of file) — how long a
 * {@link RuneLspSession.diagRequestStarts} entry is retained waiting for a
 * response that may still legitimately arrive late (see
 * {@link RuneLspSession.waitForResponse}'s "still pending" checkpoint at
 * `RESPONSE_ACK_TIMEOUT_MS`), before being treated as abandoned and
 * cleaned up. Long enough that no real — if very slow — response should
 * ever hit it, but bounded so a genuinely stuck request (no response at
 * all) doesn't retain a diagnostic-only record for the rest of a
 * sustained, actively-warm DO instance's lifetime.
 */
const DIAG_ABANDON_TIMEOUT_MS = 60_000;

/** Minimal CF WebSocket surface `DurableObjectWebSocketTransport` needs. */
interface CfSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close?(code?: number, reason?: string): void;
}

// ────────────────────────────────────────────────────────────────────────────
// JSON-RPC 2.0 framing helpers
// ────────────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: unknown;
}
interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

function isJsonRpcRequest(msg: unknown): msg is JsonRpcRequest {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['jsonrpc'] === '2.0' && typeof m['method'] === 'string' && 'id' in m;
}
function isJsonRpcNotification(msg: unknown): msg is JsonRpcNotification {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  return m['jsonrpc'] === '2.0' && typeof m['method'] === 'string' && !('id' in m);
}

// JSON-RPC 2.0 standard error codes
const ERR_PARSE = -32700;
const ERR_INTERNAL = -32603;

/**
 * Notification methods that kick off an async Langium document build.
 * `webSocketMessage` only registers a `DocumentBuilder.waitUntil` wait with
 * `state.waitUntil` for these — calling it unconditionally would hang: with
 * no pending build (e.g. right after a bare `initialize`, before any
 * document is open), `DocumentBuilder`'s internal state never reaches
 * `Validated` and its `waitUntil` promise never resolves, since nothing
 * ever fires the build-phase event it's listening for.
 */
const DOCUMENT_MUTATING_METHODS = new Set(['textDocument/didOpen', 'textDocument/didChange', 'textDocument/didClose']);

// ────────────────────────────────────────────────────────────────────────────
// TEMPORARY diagnostic instrumentation — investigating production hover/
// completion requests timing out client-side (@codemirror/lsp-client's
// default 3000ms request timeout). Buckets each request's server-side
// receive-to-response-sent latency and whether it landed on a cold DO wake.
// Routed through `./log.ts`'s shared `logger` (the same pino instance
// `logRequest` uses for this Worker's HTTP-entry logging) rather than raw
// `console.log`, so these lines carry the fleet's existing redact rules
// and format — one structured object per line, fields `diagEvent`,
// `method`, `coldWake`, `elapsedBucket`, `elapsedMs` independently
// queryable/groupable via the Cloudflare Workers Observability API.
// Remove once the timeout root cause is confirmed — see
// specs/014-studio-prod-ready.
// ────────────────────────────────────────────────────────────────────────────

const DIAG_ELAPSED_BUCKETS: ReadonlyArray<readonly [number, string]> = [
  [500, '0-500ms'],
  [1000, '500-1000ms'],
  [2000, '1000-2000ms'],
  [3000, '2000-3000ms'],
  [5000, '3000-5000ms'],
  [Infinity, '5000ms+']
];

function diagBucket(elapsedMs: number): string {
  for (const [ceiling, label] of DIAG_ELAPSED_BUCKETS) {
    if (elapsedMs < ceiling) return label;
  }
  return '5000ms+';
}

// ────────────────────────────────────────────────────────────────────────────
// RuneLspSession DO
// ────────────────────────────────────────────────────────────────────────────

export class RuneLspSession {
  /** Fresh per DO instance — constructed exactly once per wake. */
  private langium: RuneLspServer | null = null;
  private langiumLoadError: string | null = null;

  /** Transport piping CF WebSocket frames into the real Langium LSP server. */
  private transport: DurableObjectWebSocketTransport | null = null;

  /** Active client WS, or null while hibernating / before accept. */
  private ws: WebSocket | null = null;

  /** Resolvers for {@link waitForResponse}, keyed by the awaited response id. */
  private readonly pendingResponseWaiters = new Map<string, () => void>();

  /**
   * TEMPORARY diagnostic instrumentation (see top of file) — receive time,
   * method, and cold-wake status for each in-flight client request, keyed
   * the same as {@link pendingResponseWaiters}. Consumed and logged in
   * {@link notifyResponseWaiters} once the matching response is sent.
   */
  private readonly diagRequestStarts = new Map<string, { method: string; startedAt: number; coldWake: boolean }>();

  /**
   * TEMPORARY diagnostic instrumentation (see top of file) — set by
   * {@link ensureLangium} from {@link replayIfColdWake}'s own return value:
   * `true` only when this DO instance actually replayed persisted state
   * (a genuine post-hibernation cold wake), `false` for a brand-new
   * connection's first-ever construction, which does no replay I/O and has
   * a very different latency profile despite also being this instance's
   * first {@link ensureLangium} call.
   */
  private diagDidReplay = false;

  /**
   * TEMPORARY diagnostic instrumentation (see top of file) — true only
   * while the FIRST {@link ensureLangium} call for this DO instance is
   * still in flight (construction + cold-wake replay). Per-REQUEST, unlike
   * {@link diagDidReplay}: a request reads this BEFORE awaiting, so it
   * reflects whether THIS request personally waited through construction —
   * not whether the instance ever replayed at any point in its lifetime.
   */
  private diagConstructionInFlight = false;

  /**
   * True only for the exact window {@link replayIfColdWake} is awaiting the
   * sentinel `initialize`'s response — NOT derived from
   * `pendingResponseWaiters.has(SENTINEL_INITIALIZE_ID)`, because that map
   * is shared with the per-request `state.waitUntil` response-ack
   * registration in `webSocketMessage`: a real client request whose OWN id
   * happens to equal the sentinel id would register itself under that same
   * key for that unrelated reason, making the map's presence alone an
   * unreliable signal for "a replay is genuinely in flight."
   */
  private awaitingSentinelInitializeReply = false;

  /**
   * Caches the in-flight/completed {@link ensureLangium} call so every frame
   * that arrives while a cold-wake replay is still running awaits the SAME
   * promise instead of racing ahead. `ensureLangium` sets `this.transport`
   * synchronously before its own `await`s (construction, then replay) — a
   * naive `if (!this.transport)` re-check from a second concurrent frame
   * would see it already set and skip straight to forwarding, jumping the
   * queue ahead of the replay it depends on.
   */
  private ensureLangiumPromise: Promise<boolean> | null = null;

  /**
   * Set by {@link purgeStorage} (real close OR graceful shutdown) — storage-
   * mirror writes queued from an in-flight build must not resurrect data
   * that purge already deleted.
   */
  private closed = false;

  constructor(private readonly state: DurableObjectState) {}

  // ── Worker entry: forwarded WS upgrade ─────────────────────────────────

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      // The Worker entry already gates this path — defence-in-depth here.
      return new Response(JSON.stringify({ error: 'upgrade_required' }), {
        status: 426,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const pair = new (globalThis as unknown as { WebSocketPair: new () => Record<0 | 1, WebSocket> }).WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernation API — `webSocketMessage`/`webSocketClose` fire on this DO
    // for the lifetime of the connection, even across CF auto-hibernation.
    // Falls through to in-memory `accept()` if `acceptWebSocket` is not
    // available (older runtimes or local node tests).
    const stateAny = this.state as unknown as {
      acceptWebSocket?: (ws: WebSocket) => void;
    };
    if (typeof stateAny.acceptWebSocket === 'function') {
      stateAny.acceptWebSocket(server);
    } else {
      (server as unknown as { accept: () => void }).accept?.();
      // In non-hibernation mode wire a regular listener so messages flow.
      server.addEventListener('message', (e: MessageEvent) => {
        void this.webSocketMessage(server, typeof e.data === 'string' ? e.data : String(e.data));
      });
      server.addEventListener('close', () => {
        void this.webSocketClose(server, 1000, 'normal', true);
      });
    }
    this.ws = server;

    await this.touchMeta();

    return new Response(null, { status: 101, webSocket: client } as ResponseInit & {
      webSocket: WebSocket;
    });
  }

  // ── Hibernation-API entry points ───────────────────────────────────────

  /**
   * CF Worker hibernation API entry. Fires for each WS frame the client
   * sends after the upgrade. Re-hydrates the in-memory `ws` reference if
   * we just woke from hibernation.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.ws = ws;
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);

    // [DIAG] temporary — see top-of-file note. Captured on arrival, before
    // any cold-wake wait, so elapsed time in the `[DIAG] response` log
    // below covers the SAME span the client's own request timeout is
    // measuring — including any cold-wake reconstruction this request has
    // to wait through, not just its own processing time afterward.
    const diagArrivedAt = Date.now();

    // Parsed BEFORE ensureLangium so a load failure can echo the
    // triggering request's real id back — without it, the JSON-RPC client
    // can never correlate the error with its outstanding request and just
    // sits waiting for its own client-side timeout instead of learning
    // about the failure immediately.
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.send({ jsonrpc: '2.0', id: null, error: { code: ERR_PARSE, message: 'parse_error' } });
      return;
    }

    // Every frame — not just the first — awaits the SAME cached promise, so
    // a frame arriving while `ensureLangium` (construction + cold-wake
    // replay) is still in flight blocks until it fully finishes, instead of
    // seeing `this.transport` already set and forwarding ahead of the
    // replay it depends on.
    // [DIAG] temporary — see top-of-file note. `diagIsConstructor` is true
    // only for the ONE request that triggers `ensureLangium()`. Two
    // DIFFERENT signals combine into a request's final `coldWake` tag,
    // deliberately kept separate:
    //  - `diagAwaitedInFlight` (per REQUEST, captured before awaiting): did
    //    THIS request personally wait through a still-unresolved
    //    `ensureLangiumPromise`? True for the constructor and any request
    //    arriving while that same construction is still in flight — false
    //    for every later request on an already-warm instance, which
    //    incurs none of that latency no matter how the instance was
    //    originally constructed.
    //  - `this.diagDidReplay` (per INSTANCE, read after awaiting, stable
    //    for the instance's whole lifetime): did construction do genuine
    //    post-hibernation replay I/O, vs. a brand-new connection's first
    //    construction (also `!this.ensureLangiumPromise`, but no replay
    //    I/O and a very different latency profile)?
    // Both must be true for `coldWake=true` — a request that merely landed
    // on an instance that replayed *at some point in the past* did not
    // itself experience that delay.
    const diagIsConstructor = !this.ensureLangiumPromise;
    const diagAwaitedInFlight = diagIsConstructor || this.diagConstructionInFlight;
    if (diagIsConstructor) {
      this.diagConstructionInFlight = true;
      this.ensureLangiumPromise = this.ensureLangium(ws);
    }
    const ok = await this.ensureLangiumPromise;
    if (diagIsConstructor) {
      this.diagConstructionInFlight = false;
      logger.info(
        {
          ts: Date.now(),
          diagEvent: 'coldWake',
          ok,
          replayed: this.diagDidReplay,
          elapsedMs: Date.now() - diagArrivedAt
        },
        'lsp-worker.diag'
      );
    }
    const diagExperiencedColdWake = diagAwaitedInFlight && this.diagDidReplay;
    if (!ok) {
      // Notifications have no id to correlate a response to — a failed
      // notification isn't itself answerable, so nothing is sent for one.
      if (isJsonRpcRequest(parsed)) {
        this.send({
          jsonrpc: '2.0',
          id: parsed.id,
          error: { code: ERR_INTERNAL, message: 'langium_load_failed', data: this.langiumLoadError ?? 'unknown' }
        });
      }
      return;
    }

    // Persist the client's ORIGINAL initialize params verbatim, before
    // forwarding, so a future cold wake can replay this exact handshake.
    // LSPServer only accepts one `initialize` per instance lifetime
    // (connection-adapter.ts's registerInitializeHandler throws "Server
    // already initialized" on a second one) — the real client sends exactly
    // one per WS connection, matching this write happening exactly once per
    // DO instance too.
    if (isJsonRpcRequest(parsed) && parsed.method === 'initialize') {
      await this.state.blockConcurrencyWhile(async () => {
        await this.state.storage.put(INIT_PARAMS_KEY, parsed.params ?? {});
      });
    }

    // Langium's own shutdown handler (via startLanguageServer) correctly
    // transitions server state, but has no knowledge of DO storage — purge
    // it here as a side effect, then still forward the request so the real
    // server also answers it. Privacy invariant per contracts/lsp-worker.md
    // and data-model.md §1.
    if (isJsonRpcRequest(parsed) && parsed.method === 'shutdown') {
      await this.purgeStorage();
    }

    // [DIAG] temporary — see top-of-file note. The abandon timer is
    // independent of waitForResponse's own RESPONSE_ACK_TIMEOUT_MS timer
    // (a different purpose — state.waitUntil bookkeeping, not diagnostic
    // retention) and of notifyResponseWaiters (which still wins and
    // reports the real response normally if it arrives before this
    // fires). A bare setTimeout is sufficient here: it's best-effort
    // bookkeeping for a temporary diagnostic, not something whose failure
    // would affect real behavior, and a DO instance that hibernates
    // before this fires drops the whole in-memory diagRequestStarts map
    // anyway.
    if (isJsonRpcRequest(parsed)) {
      const diagKey = String(parsed.id);
      this.diagRequestStarts.set(diagKey, {
        method: parsed.method,
        startedAt: diagArrivedAt,
        coldWake: diagExperiencedColdWake
      });
      setTimeout(() => {
        const diag = this.diagRequestStarts.get(diagKey);
        if (diag) {
          this.diagRequestStarts.delete(diagKey);
          logger.info(
            {
              ts: Date.now(),
              diagEvent: 'response',
              method: diag.method,
              coldWake: diag.coldWake,
              elapsedBucket: 'ABANDONED',
              elapsedMs: Date.now() - diag.startedAt
            },
            'lsp-worker.diag'
          );
        }
      }, DIAG_ABANDON_TIMEOUT_MS);
    }

    this.transport!.receive(text);

    // receive() dispatches synchronously but the real work — computing a
    // response, running Langium's async build/validate pipeline, sending
    // diagnostics — continues via handlers this function never awaits.
    // Cloudflare's hibernation API may end this event, and evict the DO's
    // in-memory state, as soon as this function's own promise resolves;
    // `state.waitUntil` is the documented way to tell the runtime real work
    // is still outstanding so it keeps the event alive until it settles.
    const pending: Array<Promise<unknown>> = [];
    if (isJsonRpcRequest(parsed)) {
      // waitForResponse has its own safety-net timeout, so this can never
      // hang the event indefinitely even on a genuinely stuck request.
      pending.push(this.waitForResponse(String(parsed.id), RESPONSE_ACK_TIMEOUT_MS));
    }
    if (this.langium && isJsonRpcNotification(parsed) && DOCUMENT_MUTATING_METHODS.has(parsed.method)) {
      pending.push(this.waitForDocumentUpdateSettle(RESPONSE_ACK_TIMEOUT_MS));
    }
    if (pending.length > 0) {
      this.state.waitUntil(Promise.all(pending));
    }
  }

  /**
   * CF Worker hibernation API entry — fires when the client disconnects.
   * A real close (tab shut, crash, network loss) is NOT the same thing as a
   * hibernation eviction — hibernation never calls this hook (that's the
   * whole reason `replayIfColdWake` exists), so purging storage here can
   * never discard state a legitimate cold wake still needs.
   *
   * Under this DO's per-connection keying (`index.ts`'s `handleWsUpgrade`:
   * every reconnect mints a fresh nonce → a fresh DO id), a real close also
   * means THIS instance is now permanently unreachable — nothing will ever
   * replay from its storage again. Without purging here, a client that
   * disconnects without sending a graceful `shutdown` (the common case:
   * closing a tab, a crash, losing network) leaves its `docs:*` source text
   * behind forever, accumulating across every reconnect.
   */
  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.ws = null;
    // Defensive — under this DO's per-connection keying (each reconnect
    // mints a fresh nonce → fresh DO id), a second fetch() on this exact
    // instance should never happen, but clearing eagerly means a stale,
    // permanently-closed transport is never reused if that assumption is
    // ever violated.
    this.transport?.signalClose();
    this.transport = null;
    await this.purgeStorage();
  }

  /**
   * Deletes all `docs:*` source text plus the persisted handshake/meta
   * records — used by BOTH a real close and a graceful `shutdown` request,
   * so `closed` is set here rather than at each call site: an in-flight
   * build kicked off by a message just before either path (e.g. a
   * didChange right as the tab shut, or racing a client that sends
   * `shutdown` then goes quiet without `exit`) can still reach
   * `registerStorageMirror`'s write callback after this point. Setting the
   * flag here — not at the call sites — means no future caller of
   * `purgeStorage` can forget it.
   */
  private async purgeStorage(): Promise<void> {
    this.closed = true;
    await this.state.blockConcurrencyWhile(async () => {
      const docs = await this.state.storage.list({ prefix: DOC_PREFIX });
      const keys = Array.from(docs.keys());
      if (keys.length > 0) await this.state.storage.delete(keys);
      await this.state.storage.delete(INIT_PARAMS_KEY);
      await this.state.storage.delete(META_KEY);
    });
  }

  // ── Lazy init ───────────────────────────────────────────────────────────

  private async ensureLangium(ws: WebSocket): Promise<boolean> {
    // No fast-path/failure-cache checks here: `webSocketMessage` caches this
    // method's own promise in `ensureLangiumPromise` and calls it exactly
    // once per DO instance, so a second invocation can't happen.
    try {
      this.langium = createRuneLspServer();
      this.transport = new DurableObjectWebSocketTransport(
        this.wrapSocketForAckDetection(ws as unknown as CfSocketLike)
      );
      // Does not await — listen() only resolves when the transport closes.
      void this.langium.listen(this.transport);
      this.registerStorageMirror();
      // [DIAG] temporary — see top-of-file note re: diagDidReplay.
      this.diagDidReplay = await this.replayIfColdWake();
      return true;
    } catch (err) {
      this.langiumLoadError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * Wraps the real CF socket so outbound JSON-RPC responses are inspected
   * for a matching {@link waitForResponse} id before being forwarded
   * unchanged to the client. This is how `replayIfColdWake` learns the
   * replayed `initialize` has actually finished — `@lspeasy/server` only
   * sends that response once `registerInitializeHandler` (connection-adapter.ts)
   * has already flipped its internal state to Initialized, so observing the
   * response IS observing the state transition, not an approximation of it.
   */
  private wrapSocketForAckDetection(socket: CfSocketLike): CfSocketLike {
    return {
      get readyState() {
        return socket.readyState;
      },
      send: (data: string) => {
        // Gated on the dedicated `awaitingSentinelInitializeReply` flag —
        // not on the id string alone — so suppression is narrowed to
        // exactly the window a genuine sentinel-replay handshake is
        // outstanding, not the transport's entire lifetime. A real client
        // response can never collide with this window regardless of what
        // id it uses: `webSocketMessage` gates every frame on
        // `ensureLangiumPromise` (which includes this replay), so no real
        // client message is forwarded to Langium until the sentinel
        // response has already been consumed and the flag cleared.
        const isPendingSentinelReply = this.awaitingSentinelInitializeReply && this.isSentinelInitializeResponse(data);
        this.notifyResponseWaiters(data);
        if (isPendingSentinelReply) return;
        socket.send(data);
      },
      close: socket.close?.bind(socket)
    };
  }

  private isSentinelInitializeResponse(raw: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return false;
    }
    if (typeof parsed !== 'object' || parsed === null) return false;
    return (parsed as Record<string, unknown>).id === SENTINEL_INITIALIZE_ID;
  }

  private notifyResponseWaiters(raw: string): void {
    if (this.pendingResponseWaiters.size === 0 && this.diagRequestStarts.size === 0) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) return;
    const record = parsed as Record<string, unknown>;
    // A genuine JSON-RPC response never carries `method` — only requests
    // and notifications do. The server itself can send OUTBOUND requests
    // (e.g. `workspace/configuration`, `workspace/applyEdit` —
    // connection-adapter.ts) through this same `send()` path, in a
    // namespace independent of the client's own request ids; without this
    // check, one of those coincidentally reusing an id a client request is
    // still waiting on would be mistaken for that request's response.
    if ('method' in record) return;
    const id = record.id;
    if (typeof id !== 'string' && typeof id !== 'number') return;
    const key = String(id);

    // [DIAG] temporary — see top-of-file note.
    const diag = this.diagRequestStarts.get(key);
    if (diag) {
      this.diagRequestStarts.delete(key);
      const elapsedMs = Date.now() - diag.startedAt;
      logger.info(
        {
          ts: Date.now(),
          diagEvent: 'response',
          method: diag.method,
          coldWake: diag.coldWake,
          elapsedBucket: diagBucket(elapsedMs),
          elapsedMs
        },
        'lsp-worker.diag'
      );
    }

    const resolve = this.pendingResponseWaiters.get(key);
    if (resolve) {
      this.pendingResponseWaiters.delete(key);
      resolve();
    }
  }

  /**
   * Resolves once a JSON-RPC response carrying `id` has actually been sent
   * to the client, or after `timeoutMs` as a safety net so a malformed or
   * never-answered request can't hang the DO forever.
   */
  private waitForResponse(id: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingResponseWaiters.delete(id);
        // [DIAG] temporary — see top-of-file note. Do NOT delete the
        // diagRequestStarts entry here, and do NOT log this as
        // "never sent" — this timer is only this method's own
        // state.waitUntil bookkeeping safety net (RESPONSE_ACK_TIMEOUT_MS),
        // completely independent of whether the real request/response
        // machinery is still working. A genuinely slow-but-successful
        // response can still arrive after this fires; deleting the entry
        // here would make notifyResponseWaiters find nothing when it does,
        // permanently misclassifying a real (if slow) response as a
        // server that never answered at all, and making the 5000ms+
        // bucket unreachable. Log a still-pending checkpoint instead —
        // notifyResponseWaiters remains the ONLY place that consumes and
        // finally logs a request's diag entry, however late.
        const diag = this.diagRequestStarts.get(id);
        if (diag) {
          logger.info(
            {
              ts: Date.now(),
              diagEvent: 'responseStillPending',
              method: diag.method,
              coldWake: diag.coldWake,
              elapsedMs: Date.now() - diag.startedAt
            },
            'lsp-worker.diag'
          );
        }
        resolve();
      }, timeoutMs);
      this.pendingResponseWaiters.set(id, () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /**
   * Resolves once the DocumentBuilder update THIS specific notification
   * triggers reaches Validated — not a snapshot check of the builder's
   * current global state.
   *
   * `DocumentBuilder.waitUntil(Validated)` alone is unreliable for this:
   * `workspaceLock.write()` (langium's workspace-lock.js) defers the actual
   * update by at least one microtask via `Promise.resolve().then(...)`, so
   * if the document was ALREADY Validated from a prior build — the
   * ordinary "type more after the file is already open" case — a
   * `waitUntil(Validated)` called synchronously right after dispatching
   * hits the fast-path check against that STALE prior state and resolves
   * before the queued update for THIS notification has even started.
   *
   * Registers `onUpdate` (fires when this notification's update starts,
   * before the rebuild) and `onBuildPhase(Validated)` (fires after it
   * completes) BEFORE the deferred update can run, so it observes the
   * transition genuinely caused by this notification rather than a stale
   * snapshot. Bounded by the same safety-net timeout as `waitForResponse`:
   * a delete-only update that empties the rebuild set never fires
   * `onBuildPhase` at all (`notifyBuildPhase` skips notifying an empty
   * batch), and a write superseded by a newer one in quick succession
   * (`workspaceLock.write` cancels the previous pending write) may never
   * reach Validated on its own attempt either.
   */
  private waitForDocumentUpdateSettle(timeoutMs: number): Promise<void> {
    if (!this.langium) return Promise.resolve();
    const { DocumentBuilder } = this.langium.shared.workspace;
    return new Promise<void>((resolve) => {
      let updateStarted = false;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        updateDisposable.dispose();
        phaseDisposable.dispose();
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      const updateDisposable = DocumentBuilder.onUpdate(() => {
        updateStarted = true;
      });
      const phaseDisposable = DocumentBuilder.onBuildPhase(DocumentState.Validated, () => {
        if (updateStarted) finish();
      });
    });
  }

  /**
   * Mirror docs:* storage from Langium's own post-build document text, not
   * from raw wire deltas — sidesteps the incremental-sync corruption bug
   * entirely (a hand-rolled mirror that treats `contentChanges[0].text` as
   * the whole document is wrong once the client sends range-scoped deltas)
   * and stays hibernation-safe (fires on every real content change, not
   * just at close/shutdown, which would lose edits made just before an
   * eviction — `webSocketClose` never fires on a hibernation eviction).
   *
   * Two separate hooks, deliberately: `DocumentBuilder.onUpdate` fires
   * BEFORE the rebuild runs (it's the "here's what's about to change"
   * signal `emitUpdate` sends ahead of `buildDocuments`), so reading
   * `doc.textDocument.getText()` there returns stale/empty text — only
   * good for the DELETE half, which doesn't need to wait on a rebuild.
   * `DocumentBuilder.onBuildPhase(DocumentState.Parsed, ...)` fires AFTER
   * each document has actually been re-parsed, which is when its text is
   * trustworthy.
   */
  private registerStorageMirror(): void {
    if (!this.langium) return;
    const { DocumentBuilder } = this.langium.shared.workspace;
    DocumentBuilder.onBuildPhase(DocumentState.Parsed, (builtDocs) => {
      // A build queued just before a real close can still reach this
      // callback after `webSocketClose` has already purged storage —
      // `this.closed` is read fresh inside the callback (not captured at
      // registration time), so it correctly reflects a close that happened
      // in between, and skips writing content back that was just deleted.
      if (this.closed) return;
      void this.state.blockConcurrencyWhile(async () => {
        for (const doc of builtDocs) {
          await this.state.storage.put(`${DOC_PREFIX}${doc.uri.toString()}`, doc.textDocument.getText());
        }
      });
    });
    DocumentBuilder.onUpdate((_changed, deleted) => {
      if (this.closed) return; // storage is already purged — nothing to delete
      void this.state.blockConcurrencyWhile(async () => {
        for (const uri of deleted) {
          await this.state.storage.delete(`${DOC_PREFIX}${uri.toString()}`);
        }
      });
    });
  }

  /**
   * On a fresh DO construction that already has a persisted `initialize`
   * handshake (i.e. this is a cold wake after hibernation, not a brand-new
   * connection), replay initialize → initialized → one didOpen per stored
   * document — all with sentinel/dummy ids so the client never sees them —
   * before any real traffic is forwarded. Without this, a freshly-
   * reconstructed LSPServer instance stays in the Created state forever
   * (ServerNotInitialized on every request) and Langium's DocumentBuilder
   * never fires (no diagnostics), both silently.
   */
  // [DIAG] temporary — return type widened from `void` to `boolean` (see
  // top-of-file note re: diagDidReplay) so callers can tell a genuine
  // replay apart from a brand-new connection's no-op early return.
  private async replayIfColdWake(): Promise<boolean> {
    if (!this.transport) return false;
    const initParams = await this.state.storage.get<unknown>(INIT_PARAMS_KEY);
    if (initParams === undefined) return false; // brand-new connection — nothing to replay

    // registerInitializeHandler's composite handler is async (state
    // transition + delegating to Langium's own onInitialize chain); receive()
    // dispatches to it fire-and-forget, so forwarding real traffic
    // immediately after would race the state transition out of `Created`.
    // Wait for the actual response instead of guessing a fixed delay — a
    // slower-than-expected real init (more documents, cold module init)
    // would otherwise send `initialized`/`didOpen` while the server is
    // still `Initializing`, risking a rejected request or a lost edit.
    this.awaitingSentinelInitializeReply = true;
    const initializeAck = this.waitForResponse(SENTINEL_INITIALIZE_ID, RESPONSE_ACK_TIMEOUT_MS);
    this.transport.receive(
      JSON.stringify({ jsonrpc: '2.0', id: SENTINEL_INITIALIZE_ID, method: 'initialize', params: initParams })
    );
    await initializeAck;
    this.awaitingSentinelInitializeReply = false;
    this.transport.receive(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }));

    const stored = await this.state.storage.list({ prefix: DOC_PREFIX });
    // A real replay happened above (the initialize/initialized handshake,
    // including the awaited round-trip) even with zero stored documents —
    // only the earlier `initParams === undefined` branch means no replay.
    if (stored.size === 0) return true;

    for (const [key, value] of stored) {
      const uri = key.slice(DOC_PREFIX.length);
      const text = typeof value === 'string' ? value : '';
      this.transport.receive(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'textDocument/didOpen',
          params: { textDocument: { uri, languageId: 'rosetta', version: 0, text } }
        })
      );
    }

    // Each didOpen dispatches into Langium's DocumentUpdateHandler → an
    // async DocumentBuilder.update() — receive() itself is fire-and-forget,
    // so without this, the request that triggered this cold wake (hover,
    // completion, definition) would be forwarded and can run against an
    // empty or not-yet-linked index, returning an empty/stale result.
    // `waitUntil` with no uri waits for the whole workspace — correct here
    // since this DO's Langium instance holds only this connection's docs.
    if (this.langium) {
      await this.langium.shared.workspace.DocumentBuilder.waitUntil(DocumentState.Linked);
    }
    return true;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private send(msg: unknown): void {
    if (!this.ws) return;
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      /* ignore — client may have just disconnected */
    }
  }

  private async touchMeta(): Promise<void> {
    const now = Date.now();
    const existing = (await this.state.storage.get<MetaRecord>(META_KEY)) ?? null;
    // The DO id encodes the workspace identity (Worker derives it from
    // the session token's `workspaceId` claim). Stamping it here keeps
    // stored metadata self-describing for `wrangler tail` debugging and
    // future cross-DO metrics — the alternative empty-string sentinel
    // was a placeholder.
    const next: MetaRecord = existing
      ? { ...existing, lastActiveAt: now }
      : { workspaceId: this.state.id.toString(), createdAt: now, lastActiveAt: now };
    await this.state.storage.put(META_KEY, next);
  }
}
