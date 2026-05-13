// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * RuneLspSession Durable Object (T041).
 *
 * Per `specs/014-studio-prod-ready/data-model.md` §1 + `contracts/lsp-worker.md`
 * "LSP messages handled". One DO per workspaceId; holds the connected
 * client's WebSocket, the langium service container, and the per-document
 * source state. Hibernates after 30s WS idle (CF-managed); on wake the
 * `acceptWebSocket()` path rehydrates `state.storage.docs:*` into the
 * langium index before processing the next message.
 *
 * Lifecycle:
 *   1. Worker forwards the WS upgrade Request to the DO via stub.fetch().
 *   2. DO calls `state.acceptWebSocket(server)` — CF-Worker-side
 *      hibernation API; `webSocketMessage(ws, msg)` fires for each frame.
 *   3. JSON-RPC 2.0 LSP messages dispatch via {@link handleLspMessage}.
 *   4. `shutdown` flushes storage; `exit` closes the WS.
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
// LSP server imports are LAZY (inside ensureLangium) so the heavy langium
// bundle is fetched only when the first message arrives — keeps the DO
// cold-start fast for clients that connect but never send LSP traffic.
import type { RuneLspServer, DurableObjectWebSocketTransport as TransportType } from '@rune-langium/lsp-server';

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
interface JsonRpcResult {
  jsonrpc: '2.0';
  id: number | string;
  result: unknown;
}
interface JsonRpcError {
  jsonrpc: '2.0';
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
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
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INTERNAL = -32603;

// LSP capabilities are no longer hand-rolled here — once the langium
// `RuneLspServer` is bound to the DO's transport (see ensureLangium), it
// answers `initialize` with the full capability set wired by
// `startLanguageServer(shared)` in @rune-langium/lsp-server: hover,
// completion, definition, references, document symbols, diagnostics, etc.
//
// Debouncing of didChange is also handled inside langium's
// DocumentBuilder — we don't need a hand-rolled debounce here.

// ────────────────────────────────────────────────────────────────────────────
// RuneLspSession DO
// ────────────────────────────────────────────────────────────────────────────

export class RuneLspSession {
  /**
   * Lazy langium handle — the heavy import + service-container construction
   * is deferred until the first message that needs it.
   */
  private langium: RuneLspServer | null = null;
  private langiumLoadError: string | null = null;

  /** Transport piping CF WebSocket frames into the langium LSP server. */
  private transport: TransportType | null = null;

  /** Promise that resolves once `lsp.listen(transport)` is in flight. */
  private listenPromise: Promise<void> | null = null;

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

    // Lazy-init the langium LSP + transport on the very first message and
    // replay any persisted docs so langium's in-memory workspace mirrors
    // what DO storage holds across hibernation. Subsequent messages skip
    // the init and just forward straight through.
    if (!this.transport) {
      const ok = await this.ensureLangium();
      if (!ok) {
        // Langium failed to load — surface a structured error rather than
        // silently dropping the frame, so wrangler tail captures the cause.
        this.send({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: ERR_INTERNAL,
            message: 'langium_load_failed',
            data: this.langiumLoadError ?? 'unknown'
          }
        });
        return;
      }
    }

    // Storage-mirror side-effect: peek at didOpen/didChange/didClose
    // notifications so DO storage stays in sync with what langium has
    // in memory. Hibernation wake-up will replay these into a fresh
    // langium workspace via the same transport.receive path.
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // The transport will also reject this as a parse error via its
      // onError handler; emitting our own here keeps wire compatibility
      // with the legacy DO contract.
      this.send({
        jsonrpc: '2.0',
        id: null,
        error: { code: ERR_PARSE, message: 'parse_error' }
      });
      return;
    }
    await this.mirrorStorage(parsed);

    // Forward to langium via the transport. Langium responds via the
    // transport's `send` which writes back through `this.ws`.
    this.transport!.receive(text);
  }

  /**
   * CF Worker hibernation API entry — fires when the client disconnects.
   * Clears in-memory state; storage survives until the DO is reaped.
   */
  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.ws = null;
    this.transport?.signalClose();
    // Don't tear down `langium` / `transport` yet — the same DO instance may
    // get re-targeted by another upgrade (rare for sessions keyed off a
    // workspace id, but defensive). They get reset by handleShutdown when
    // the LSP `shutdown` request fires.
  }

  // ── Storage mirror ──────────────────────────────────────────────────────

  /**
   * Mirror didOpen/didChange/didClose into DO storage so a hibernation
   * wake-up can replay the workspace into a fresh langium index. Other
   * messages flow through to langium without touching storage.
   */
  private async mirrorStorage(parsed: unknown): Promise<void> {
    if (!isJsonRpcNotification(parsed)) return;
    const notif = parsed;
    if (notif.method === 'textDocument/didOpen') {
      const p = notif.params as { textDocument?: { uri?: string; text?: string } } | undefined;
      const uri = p?.textDocument?.uri;
      const docText = p?.textDocument?.text ?? '';
      if (typeof uri !== 'string') return;
      await this.state.blockConcurrencyWhile(async () => {
        await this.state.storage.put(`${DOC_PREFIX}${uri}`, docText);
      });
      return;
    }
    if (notif.method === 'textDocument/didChange') {
      const p = notif.params as
        | { textDocument?: { uri?: string }; contentChanges?: Array<{ text?: string }> }
        | undefined;
      const uri = p?.textDocument?.uri;
      const newText = p?.contentChanges?.[0]?.text;
      if (typeof uri !== 'string' || typeof newText !== 'string') return;
      await this.state.blockConcurrencyWhile(async () => {
        await this.state.storage.put(`${DOC_PREFIX}${uri}`, newText);
      });
      return;
    }
    if (notif.method === 'textDocument/didClose') {
      const p = notif.params as { textDocument?: { uri?: string } } | undefined;
      const uri = p?.textDocument?.uri;
      if (typeof uri !== 'string') return;
      await this.state.blockConcurrencyWhile(async () => {
        await this.state.storage.delete(`${DOC_PREFIX}${uri}`);
      });
      return;
    }
    if (notif.method === 'exit') {
      try {
        this.ws?.close(1000, 'exit');
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }

  // ── Lazy init ───────────────────────────────────────────────────────────

  private async ensureLangium(): Promise<boolean> {
    if (this.langium && this.transport) return true;
    if (this.langiumLoadError) return false;

    try {
      const mod = await import('@rune-langium/lsp-server');
      this.langium = mod.createRuneLspServer();

      if (!this.ws) {
        // We only reach ensureLangium from webSocketMessage where
        // `this.ws` is set, but defence-in-depth keeps the type
        // narrowing clean.
        throw new Error('cannot init transport without an active WebSocket');
      }
      this.transport = new mod.DurableObjectWebSocketTransport(this.ws);

      // Start the LSP message pump. `listen()` resolves only when the
      // transport closes; we hold the promise but don't await it so
      // the message handler can continue dispatching frames.
      this.listenPromise = this.langium.listen(this.transport);

      // Replay stored docs as didOpen so langium's in-memory workspace
      // matches what DO storage has on wake-up. The replay goes through
      // the transport so storage observations stay consistent.
      await this.replayStoredDocs();

      return true;
    } catch (err) {
      this.langiumLoadError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  private async replayStoredDocs(): Promise<void> {
    if (!this.transport) return;
    const all = await this.state.storage.list({ prefix: DOC_PREFIX });
    for (const [key, value] of all.entries()) {
      const uri = key.slice(DOC_PREFIX.length);
      const text = typeof value === 'string' ? value : '';
      const didOpen = {
        jsonrpc: '2.0' as const,
        method: 'textDocument/didOpen',
        params: { textDocument: { uri, languageId: 'rune', version: 0, text } }
      };
      // Skip mirrorStorage on replay — we're reading FROM storage.
      this.transport.receive(JSON.stringify(didOpen));
    }
  }

  // Note: LSP `shutdown` is now handled by the langium server's own
  // shutdown handler (registered by startLanguageServer). Storage cleanup
  // happens via the exit notification path or DO eviction; we keep storage
  // around between shutdown and exit so the client can still query state
  // during the brief window after `shutdown` returns.

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
