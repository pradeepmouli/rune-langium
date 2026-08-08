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

    if (!this.transport) {
      const ok = await this.ensureLangium(ws);
      if (!ok) {
        this.send({
          jsonrpc: '2.0',
          id: null,
          error: { code: ERR_INTERNAL, message: 'langium_load_failed', data: this.langiumLoadError ?? 'unknown' }
        });
        return;
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.send({ jsonrpc: '2.0', id: null, error: { code: ERR_PARSE, message: 'parse_error' } });
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
      await this.state.blockConcurrencyWhile(async () => {
        const docs = await this.state.storage.list({ prefix: DOC_PREFIX });
        const keys = Array.from(docs.keys());
        if (keys.length > 0) await this.state.storage.delete(keys);
        await this.state.storage.delete(INIT_PARAMS_KEY);
        await this.state.storage.delete(META_KEY);
      });
    }

    this.transport!.receive(text);
  }

  /**
   * CF Worker hibernation API entry — fires when the client disconnects.
   * Clears in-memory state; storage survives until the DO is reaped.
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
  }

  // ── Lazy init ───────────────────────────────────────────────────────────

  private async ensureLangium(ws: WebSocket): Promise<boolean> {
    if (this.langium && this.transport) return true;
    if (this.langiumLoadError) return false;
    try {
      this.langium = createRuneLspServer();
      this.transport = new DurableObjectWebSocketTransport(
        ws as unknown as { readyState: number; send(data: string): void; close?(code?: number, reason?: string): void }
      );
      // Does not await — listen() only resolves when the transport closes.
      void this.langium.listen(this.transport);
      this.registerStorageMirror();
      await this.replayIfColdWake();
      return true;
    } catch (err) {
      this.langiumLoadError = err instanceof Error ? err.message : String(err);
      return false;
    }
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
      void this.state.blockConcurrencyWhile(async () => {
        for (const doc of builtDocs) {
          await this.state.storage.put(`${DOC_PREFIX}${doc.uri.toString()}`, doc.textDocument.getText());
        }
      });
    });
    DocumentBuilder.onUpdate((_changed, deleted) => {
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
  private async replayIfColdWake(): Promise<void> {
    if (!this.transport) return;
    const initParams = await this.state.storage.get<unknown>(INIT_PARAMS_KEY);
    if (initParams === undefined) return; // brand-new connection — nothing to replay

    const SENTINEL_ID = '__replay_initialize__';
    this.transport.receive(
      JSON.stringify({ jsonrpc: '2.0', id: SENTINEL_ID, method: 'initialize', params: initParams })
    );
    // registerInitializeHandler's composite handler is async (state
    // transition + delegating to Langium's own onInitialize chain); receive()
    // dispatches to it fire-and-forget, so forwarding real traffic
    // immediately after would race the state transition out of `Created`.
    // Yield past the pending microtask/macrotask chain before continuing.
    await new Promise((resolve) => setTimeout(resolve, 20));
    this.transport.receive(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }));

    const stored = await this.state.storage.list({ prefix: DOC_PREFIX });
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
