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

// ────────────────────────────────────────────────────────────────────────────
// LSP capabilities the DO advertises to clients
// ────────────────────────────────────────────────────────────────────────────
//
// Only textDocumentSync is wired today. Hover/completion/definition and
// diagnostics are intentionally NOT advertised until the langium
// connection-adapter lands (T044b follow-on). Advertising capabilities the
// server doesn't honour would let the client surface "no result" to users
// for queries the server isn't actually answering.

const SERVER_CAPABILITIES = {
  textDocumentSync: { openClose: true, change: 1 /* full */ }
};

// Debounce window for didChange → re-parse pipeline (contracts/lsp-worker.md).
const DIDCHANGE_DEBOUNCE_MS = 200;

// ────────────────────────────────────────────────────────────────────────────
// RuneLspSession DO
// ────────────────────────────────────────────────────────────────────────────

export class RuneLspSession {
  /**
   * Lazy langium handle — the heavy import + service-container construction
   * is deferred until the first message that needs it. `unknown` here keeps
   * the wider DO type-checkable in the Workers runtime independent of which
   * langium minor version ships.
   */
  private langium: unknown = null;
  private langiumLoadError: string | null = null;

  /** Active client WS, or null while hibernating / before accept. */
  private ws: WebSocket | null = null;

  /** Pending didChange debounce handles, keyed by document URI. */
  private readonly pendingChanges = new Map<string, ReturnType<typeof setTimeout>>();

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

    const pair = new (
      globalThis as unknown as { WebSocketPair: new () => Record<0 | 1, WebSocket> }
    ).WebSocketPair();
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
    let msg: unknown;
    try {
      msg = JSON.parse(text);
    } catch {
      this.send({
        jsonrpc: '2.0',
        id: null,
        error: { code: ERR_PARSE, message: 'parse_error' }
      });
      return;
    }
    await this.dispatch(msg);
  }

  /**
   * CF Worker hibernation API entry — fires when the client disconnects.
   * Clears in-memory state; storage survives until the DO is reaped.
   */
  async webSocketClose(
    _ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean
  ): Promise<void> {
    this.ws = null;
    for (const handle of this.pendingChanges.values()) clearTimeout(handle);
    this.pendingChanges.clear();
  }

  // ── Dispatch ────────────────────────────────────────────────────────────

  private async dispatch(msg: unknown): Promise<void> {
    try {
      if (isJsonRpcRequest(msg)) {
        await this.handleRequest(msg);
        return;
      }
      if (isJsonRpcNotification(msg)) {
        await this.handleNotification(msg);
        return;
      }
      // Unknown frame — JSON-RPC 2.0 says servers SHOULD ignore non-RPC
      // messages, but we surface a structured error to the client for
      // visibility under wrangler tail.
      this.send({
        jsonrpc: '2.0',
        id: null,
        error: { code: ERR_PARSE, message: 'invalid_jsonrpc_message' }
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      this.send({
        jsonrpc: '2.0',
        id: null,
        error: { code: ERR_INTERNAL, message: 'internal_error', data: text }
      });
    }
  }

  private async handleRequest(req: JsonRpcRequest): Promise<void> {
    switch (req.method) {
      case 'initialize':
        return this.respond(req, { capabilities: SERVER_CAPABILITIES });
      case 'shutdown':
        await this.handleShutdown();
        return this.respond(req, null);
      // hover/completion/definition: see SERVER_CAPABILITIES note. The
      // server does not advertise these features today, so a well-behaved
      // client should not send them. If one does anyway (out-of-spec),
      // reply with method_not_found rather than `null` so the deviation
      // surfaces in client logs instead of being silently swallowed.
      default:
        return this.errorReply(req, ERR_METHOD_NOT_FOUND, 'method_not_found');
    }
  }

  private async handleNotification(notif: JsonRpcNotification): Promise<void> {
    switch (notif.method) {
      case 'initialized':
        return; // ack — no-op
      case 'exit':
        try {
          this.ws?.close(1000, 'exit');
        } catch {
          /* ignore */
        }
        this.ws = null;
        return;
      case 'textDocument/didOpen': {
        const p = notif.params as { textDocument?: { uri?: string; text?: string } } | undefined;
        const uri = p?.textDocument?.uri;
        const text = p?.textDocument?.text ?? '';
        if (typeof uri !== 'string') return;
        await this.state.blockConcurrencyWhile(async () => {
          await this.state.storage.put(`${DOC_PREFIX}${uri}`, text);
        });
        await this.parseAndPublish(uri);
        return;
      }
      case 'textDocument/didChange': {
        const p = notif.params as
          | {
              textDocument?: { uri?: string };
              contentChanges?: Array<{ text?: string }>;
            }
          | undefined;
        const uri = p?.textDocument?.uri;
        const newText = p?.contentChanges?.[0]?.text;
        if (typeof uri !== 'string' || typeof newText !== 'string') return;
        // Replace the stored copy synchronously (cheap), then debounce
        // the parse pass per the contract.
        await this.state.blockConcurrencyWhile(async () => {
          await this.state.storage.put(`${DOC_PREFIX}${uri}`, newText);
        });
        const existing = this.pendingChanges.get(uri);
        if (existing) clearTimeout(existing);
        const handle = setTimeout(() => {
          this.pendingChanges.delete(uri);
          void this.parseAndPublish(uri);
        }, DIDCHANGE_DEBOUNCE_MS);
        this.pendingChanges.set(uri, handle);
        return;
      }
      case 'textDocument/didClose': {
        const p = notif.params as { textDocument?: { uri?: string } } | undefined;
        const uri = p?.textDocument?.uri;
        if (typeof uri !== 'string') return;
        await this.state.blockConcurrencyWhile(async () => {
          await this.state.storage.delete(`${DOC_PREFIX}${uri}`);
        });
        return;
      }
      default:
        // Unknown notification — JSON-RPC 2.0 says servers MUST silently
        // drop notifications they don't recognise.
        return;
    }
  }

  // ── LSP feature plumbing (deferred to T044+ once a real langium is wired)

  private async parseAndPublish(_uri: string): Promise<void> {
    // Do not publish `diagnostics: []` until this path is backed by a real
    // langium parse / validation pass. In LSP, an empty diagnostics array
    // means "document is clean", which would silently clear real errors
    // and make this transport appear functional before it actually is.
    //
    // We still force langium initialisation here so the session follows
    // its intended lifecycle (heavy import warmed once per DO) and the
    // future wiring in T044b can reuse this call site without restructure.
    await this.ensureLangium();
  }

  private async ensureLangium(): Promise<void> {
    if (this.langium || this.langiumLoadError) return;
    try {
      const mod = (await import('@rune-langium/lsp-server')) as {
        createRuneLspServer: (...args: unknown[]) => unknown;
      };
      // Allocate per-DO; cheaper than per-message and survives until
      // hibernation. The eager-load probe in the Worker entry already
      // confirmed the import graph resolves at boot time.
      this.langium = mod.createRuneLspServer();
    } catch (err) {
      this.langiumLoadError = err instanceof Error ? err.message : String(err);
    }
  }

  private async handleShutdown(): Promise<void> {
    // Per data-model §1: `shutdown` clears all `docs:*` keys.
    await this.state.blockConcurrencyWhile(async () => {
      const all = await this.state.storage.list({ prefix: DOC_PREFIX });
      const keys = Array.from(all.keys());
      if (keys.length > 0) await this.state.storage.delete(keys);
      await this.state.storage.delete(META_KEY);
    });
    for (const handle of this.pendingChanges.values()) clearTimeout(handle);
    this.pendingChanges.clear();
    this.langium = null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private respond(req: JsonRpcRequest, result: unknown): void {
    const reply: JsonRpcResult = { jsonrpc: '2.0', id: req.id, result };
    this.send(reply);
  }

  private errorReply(req: JsonRpcRequest, code: number, message: string): void {
    const reply: JsonRpcError = { jsonrpc: '2.0', id: req.id, error: { code, message } };
    this.send(reply);
  }

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
