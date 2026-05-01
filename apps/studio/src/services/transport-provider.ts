// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Transport provider with automatic failover (T011 + T044).
 *
 * Connection strategy:
 *   1. Try WebSocket (external dev server — full Langium + OS access).
 *   2. On failure, retry up to `maxReconnectAttempts` with exponential backoff.
 *   3. Fall back to the **CF Worker LSP** (T044) — POST a same-origin token
 *      mint to `${config.lspSessionUrl}`, then open
 *      `WebSocket(\`${config.lspWsUrl}/ws/${token}\`)`. On 401 from the mint
 *      we retry once with a fresh token; on 429 / 5xx we surface
 *      "language services unavailable" with the dev-mode-gated copy from FR-014.
 *
 * The provider exposes a reactive state so UI components can show
 * connection status without polling.
 */

import type { Transport } from '@codemirror/lsp-client';
import { config } from '../config.js';
import { createWebSocketTransport } from './ws-transport.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type TransportMode = 'disconnected' | 'websocket' | 'cf-worker' | 'embedded';
export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TransportState {
  mode: TransportMode;
  status: TransportStatus;
  error?: Error;
}

export interface TransportProviderOptions {
  /** WebSocket URI for the external LSP server. */
  wsUri?: string;
  /** Connection timeout in ms (default: 2000). */
  connectionTimeout?: number;
  /** Max WebSocket reconnect attempts before fallback (default: 3). */
  maxReconnectAttempts?: number;
  /** Base backoff delay in ms (default: 500). */
  backoffBase?: number;
  /**
   * HTTP endpoint for `POST /api/lsp/session` (T044). Defaults to
   * `config.lspSessionUrl`. Override for tests.
   */
  sessionUrl?: string;
  /**
   * WebSocket base for the CF LSP worker; the token is appended at
   * `\`${cfWsBase}/ws/${token}\``. Defaults to `config.lspWsUrl`.
   */
  cfWsBase?: string;
  /**
   * Opaque workspace identifier sent to the CF mint endpoint. Tests pass a
   * fixed ULID; production callers will pull this from the active
   * workspace record.
   */
  workspaceId?: string;
}

export interface TransportProvider {
  /** Get or establish the transport connection. */
  getTransport(): Promise<Transport>;
  /** Current connection state. */
  getState(): TransportState;
  /** Force reconnection (tries WebSocket first). */
  reconnect(): Promise<Transport>;
  /** Subscribe to state changes. Returns unsubscribe function. */
  onStateChange(listener: (state: TransportState) => void): () => void;
  /** Clean up resources. */
  dispose(): void;
}

// ────────────────────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────────────────────

/** LSP host base URL, env-configurable via VITE_LSP_WS_URL (T012/FR-021). */
const DEFAULT_WS_URI = config.lspWsUrl;
const DEFAULT_TIMEOUT = 2000;
const DEFAULT_MAX_RECONNECT = 3;
const DEFAULT_BACKOFF_BASE = 500;
/** Default workspaceId for the session mint until the active workspace is wired in. */
const DEFAULT_WORKSPACE_ID = '01J7M8AAAAAAAAAAAAAAAAAAAA';

export function createTransportProvider(opts?: TransportProviderOptions): TransportProvider {
  const wsUri = opts?.wsUri ?? DEFAULT_WS_URI;
  const connectionTimeout = opts?.connectionTimeout ?? DEFAULT_TIMEOUT;
  const maxReconnectAttempts = opts?.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT;
  const backoffBase = opts?.backoffBase ?? DEFAULT_BACKOFF_BASE;
  const sessionUrl = opts?.sessionUrl ?? config.lspSessionUrl;
  const cfWsBase = opts?.cfWsBase ?? config.lspWsUrl;
  const workspaceId = opts?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const preferDirectWebSocket =
    opts?.wsUri !== undefined || !isSameOriginSessionEndpoint(sessionUrl);

  let state: TransportState = { mode: 'disconnected', status: 'disconnected' };
  let currentTransport: Transport | undefined;
  const listeners: ((state: TransportState) => void)[] = [];

  function setState(next: TransportState): void {
    state = next;
    for (const l of [...listeners]) l(state);
  }

  /** Pause for `ms` milliseconds. */
  function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Attempt a WebSocket connection with retries. */
  async function tryWebSocket(): Promise<Transport> {
    setState({ mode: 'disconnected', status: 'connecting' });

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxReconnectAttempts; attempt++) {
      if (attempt > 0) {
        await delay(backoffBase * 2 ** (attempt - 1));
      }
      try {
        const transport = await createWebSocketTransport(wsUri, connectionTimeout);
        setState({ mode: 'websocket', status: 'connected' });
        currentTransport = transport;
        return transport;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error('WebSocket connection failed');
  }

  /**
   * Mint a session token via `POST ${sessionUrl}` and return the parsed
   * 200 body. Throws an Error tagged with the HTTP status when the mint
   * is rejected so the caller can branch on 401 / 429 / 5xx.
   */
  async function mintSessionToken(): Promise<string> {
    const res = await fetch(sessionUrl, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId })
    });
    if (!res.ok) {
      const err = new Error(`session_mint_failed:${res.status}`) as Error & {
        status: number;
      };
      err.status = res.status;
      throw err;
    }
    const body = (await res.json()) as { token: string; expiresAt: number };
    if (!body || typeof body.token !== 'string') {
      throw new Error('session_mint_invalid_response');
    }
    return body.token;
  }

  /**
   * Open a token-gated WS to the CF LSP worker. Returns a real Transport
   * via `createWebSocketTransport`; surfaces the underlying WS error
   * untouched so the caller's retry logic can branch.
   */
  async function openCfWorkerWs(token: string): Promise<Transport> {
    const wsUrl = `${cfWsBase.replace(/\/$/, '')}/ws/${encodeURIComponent(token)}`;
    return createWebSocketTransport(wsUrl, connectionTimeout);
  }

  /**
   * Step 3 — CF Worker LSP via session token. Replaces the legacy
   * embedded-Worker fallback. On 401 from the mint, refreshes the token
   * once and retries; on 429 / 5xx surfaces the documented "language
   * services unavailable" copy from FR-014 and falls through to the
   * disconnected error state.
   */
  async function tryCfWorker(): Promise<Transport> {
    setState({ mode: 'cf-worker', status: 'connecting' });
    let token: string;
    try {
      token = await mintSessionToken();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 401) {
        // Per the contract, a 401 from the mint is a stale/missing
        // signing-key on the CF side OR a rotated key that invalidated
        // the cached token; one retry buys us the happy-path on a fresh
        // session.
        try {
          token = await mintSessionToken();
        } catch (err2) {
          throw createCfWorkerUnavailableError(err2);
        }
      } else {
        throw createCfWorkerUnavailableError(err);
      }
    }
    try {
      const transport = await openCfWorkerWs(token);
      setState({ mode: 'cf-worker', status: 'connected' });
      currentTransport = transport;
      return transport;
    } catch (err) {
      // The WS open MAY itself fail with 401 (server rotated the signing
      // key between mint and connect) — handle that with one retry,
      // matching the documented state-machine.
      try {
        token = await mintSessionToken();
        const transport = await openCfWorkerWs(token);
        setState({ mode: 'cf-worker', status: 'connected' });
        currentTransport = transport;
        return transport;
      } catch (err2) {
        throw createCfWorkerUnavailableError(err2 ?? err);
      }
    }
  }

  /**
   * Surface the "language services unavailable" terminal state and reject
   * transport acquisition so the LSP client stays disconnected instead of
   * timing out on a no-op channel.
   */
  function createCfWorkerUnavailableError(cause: unknown): Error {
    const errorMessage = config.devMode
      ? `CF LSP worker unreachable (${describeCause(cause)}) — verify ${config.lspSessionUrl} is deployed and CORS allows ${typeof window !== 'undefined' ? window.location.origin : 'this origin'}`
      : 'Editor running offline — language services unavailable';
    if (config.devMode) {
      console.warn('[TransportProvider] CF LSP worker step failed:', cause);
    }
    const error = new Error(errorMessage);
    setState({
      mode: 'disconnected',
      status: 'error',
      error
    });
    return error;
  }

  function describeCause(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  /** Main connection flow: WS first → CF Worker fallback. */
  async function connect(): Promise<Transport> {
    if (!preferDirectWebSocket) {
      return tryCfWorker();
    }
    try {
      return await tryWebSocket();
    } catch {
      return tryCfWorker();
    }
  }

  return {
    async getTransport(): Promise<Transport> {
      if (currentTransport) return currentTransport;
      return connect();
    },

    getState(): TransportState {
      return state;
    },

    async reconnect(): Promise<Transport> {
      currentTransport = undefined;
      return connect();
    },

    onStateChange(listener: (s: TransportState) => void): () => void {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },

    dispose(): void {
      currentTransport = undefined;
      listeners.length = 0;
      setState({ mode: 'disconnected', status: 'disconnected' });
    }
  };
}

function isSameOriginSessionEndpoint(sessionUrl: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return new URL(sessionUrl, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}
