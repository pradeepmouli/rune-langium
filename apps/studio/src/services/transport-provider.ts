// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Transport provider with automatic failover (T011 + T044 + 019 Phase 2).
 *
 * Two-tier connection strategy:
 *   1. Direct WebSocket (external dev server — full Langium + OS access)
 *      with retry/backoff up to `maxReconnectAttempts`. Only attempted when
 *      `wsUri` is explicitly configured or the session endpoint is
 *      cross-origin (i.e. the studio cannot rely on the same-origin Pages
 *      Function).
 *   2. **Pages Function LSP** (same-origin) — POST a token mint to
 *      `${config.lspSessionUrl}` (default: `/api/lsp/session`), then open
 *      `WebSocket(\`${cfWsBase}/ws/${token}\`)`. On 401 from the mint we
 *      retry once with a fresh token; on 429 / 5xx we surface "language
 *      services unavailable" with the dev-mode-gated copy from FR-014.
 *
 * The provider exposes a reactive state so UI components can show
 * connection status without polling.
 *
 * Phase 2 removed the in-browser embedded worker transport entirely;
 * `apps/studio/src/workers/lsp-worker.ts` and
 * `apps/studio/src/services/worker-transport.ts` are gone.
 */

import type { Transport } from '@codemirror/lsp-client';
import { config } from '../config.js';
import { createWebSocketTransport, type CloseableTransport } from './ws-transport.js';
import { useOutputStore, fmtLine } from '../store/output-store.js';
import { withInstrumentation, Capture } from './instrumentation/core.js';
import type { InstrumentationNamespace } from './instrumentation/namespace.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type TransportMode = 'disconnected' | 'websocket' | 'pages-function';
export type TransportStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TransportState {
  mode: TransportMode;
  status: TransportStatus;
  error?: Error;
}

export interface TransportProviderOptions {
  /** WebSocket URI for the external LSP server (dev override). */
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
   * WebSocket base for the Pages Function LSP; the token is appended at
   * `\`${cfWsBase}/ws/${token}\``. Defaults to `config.lspWsUrl`.
   */
  cfWsBase?: string;
  /**
   * Opaque workspace identifier sent to the mint endpoint. Tests pass a
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
  /** Force reconnection using the same fallback order. */
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

export const createTransportProvider = withInstrumentation(
  function createTransportProvider(opts?: TransportProviderOptions): TransportProvider {
    const wsUri = opts?.wsUri ?? DEFAULT_WS_URI;
    const connectionTimeout = opts?.connectionTimeout ?? DEFAULT_TIMEOUT;
    const maxReconnectAttempts = opts?.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT;
    const backoffBase = opts?.backoffBase ?? DEFAULT_BACKOFF_BASE;
    const sessionUrl = opts?.sessionUrl ?? config.lspSessionUrl;
    const cfWsBase = opts?.cfWsBase ?? config.lspWsUrl;
    const workspaceId = opts?.workspaceId ?? DEFAULT_WORKSPACE_ID;
    const preferDirectWebSocket = opts?.wsUri !== undefined || !isSameOriginSessionEndpoint(sessionUrl);

    let state: TransportState = { mode: 'disconnected', status: 'disconnected' };
    let currentTransport: CloseableTransport | undefined;
    const listeners: ((state: TransportState) => void)[] = [];

    function setState(next: TransportState): void {
      state = next;
      // eslint-disable-next-line unicorn/no-useless-spread
      for (const l of [...listeners]) l(state);
    }

    /** Pause for `ms` milliseconds. */
    function delay(ms: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /** Attempt a direct WebSocket connection with retries. */
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
    const mintSessionToken = withInstrumentation(
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
      },
      {
        // `namespace: 'lsp'` is what makes this call survive the production
        // build's IS_PROD short-circuit in withInstrumentation (an
        // un-namespaced wrap is skipped entirely in prod) — without it this
        // phase would be invisible to the Activity sink / telemetry-shipper
        // in exactly the environment this exists to diagnose. Neither the
        // token nor workspaceId is captured (default capture: 0) — a mint
        // response's `token` is a bearer credential. The HTTP status code
        // IS captured via sanitizeError — it's what distinguishes a
        // signing-key rotation (401), rate limiting (429), and a genuine
        // 5xx outage, none of which carry any user/model content. `toast:
        // false` keeps this out of the Toast UI — it fires on every
        // reconnect, and the pre-existing LSP-unavailable toast (fired by
        // createPagesFunctionUnavailableError's caller) already covers the
        // user-facing failure signal; this is background diagnostic data.
        op: 'mintSessionToken',
        namespace: 'lsp' satisfies InstrumentationNamespace,
        toast: false,
        sanitizeError: (err) => {
          const status = (err as { status?: number }).status;
          return {
            signature: err instanceof Error ? `${err.name}:${status ?? 'network'}` : 'Error:unspecified',
            context: status !== undefined ? { status } : undefined
          };
        }
      }
    );

    /**
     * Open a token-gated WS to the Pages Function LSP. Returns a real
     * Transport via `createWebSocketTransport`; surfaces the underlying WS
     * error untouched so the caller's retry logic can branch.
     */
    const openPagesFunctionWs = withInstrumentation(
      async function openPagesFunctionWs(token: string): Promise<CloseableTransport> {
        const wsUrl = `${cfWsBase.replace(/\/$/, '')}/ws/${encodeURIComponent(token)}`;
        return createWebSocketTransport(wsUrl, connectionTimeout);
      },
      {
        // Same rationale as mintSessionToken above, including `toast:
        // false`. `token` is never captured (default capture: 0) — it's
        // the bearer credential this call consumes.
        op: 'openPagesFunctionWs',
        namespace: 'lsp' satisfies InstrumentationNamespace,
        toast: false
      }
    );

    /**
     * Pages Function LSP via session token. On 401 from the mint, refreshes
     * the token once and retries; on 429 / 5xx surfaces the documented
     * "language services unavailable" copy from FR-014 and falls through
     * to the disconnected error state.
     */
    const tryPagesFunction = withInstrumentation(
      async function tryPagesFunction(): Promise<Transport> {
        setState({ mode: 'pages-function', status: 'connecting' });
        let token: string;
        try {
          token = await mintSessionToken();
        } catch (err) {
          const status = (err as { status?: number }).status;
          if (status === 401) {
            // Per the contract, a 401 from the mint is a stale/missing
            // signing-key on the server side OR a rotated key that
            // invalidated the cached token; one retry buys us the happy-path
            // on a fresh session.
            try {
              token = await mintSessionToken();
            } catch (err2) {
              throw createPagesFunctionUnavailableError(err2);
            }
          } else {
            throw createPagesFunctionUnavailableError(err);
          }
        }
        try {
          const transport = await openPagesFunctionWs(token);
          setState({ mode: 'pages-function', status: 'connected' });
          currentTransport = transport;
          return transport;
        } catch (err) {
          // The WS open MAY itself fail with 401 (server rotated the signing
          // key between mint and connect) — handle that with one retry,
          // matching the documented state-machine.
          try {
            token = await mintSessionToken();
            const transport = await openPagesFunctionWs(token);
            setState({ mode: 'pages-function', status: 'connected' });
            currentTransport = transport;
            return transport;
          } catch (err2) {
            throw createPagesFunctionUnavailableError(err2 ?? err);
          }
        }
      },
      {
        // The end-to-end connection-establish phase (mint + WS upgrade,
        // including any 401 retry) — the phase this repo's [DIAG] hover-
        // timing instrumentation on rune-lsp-worker's session.ts does NOT
        // cover, since that only starts timing once a WebSocket message
        // arrives on an already-open connection. A slow or failing connect
        // here is exactly what would make the client's hover/completion
        // request time out before the DO ever sees the message. `toast:
        // false` for the same reason as mintSessionToken/openPagesFunctionWs
        // above — this fires on every reconnect and would otherwise stack a
        // toast on top of the pre-existing LSP-unavailable toast on failure.
        op: 'connectPagesFunctionLsp',
        namespace: 'lsp' satisfies InstrumentationNamespace,
        toast: false
      }
    );

    /**
     * Surface the "language services unavailable" terminal state and reject
     * transport acquisition so the LSP client stays disconnected instead of
     * timing out on a no-op channel.
     */
    function createPagesFunctionUnavailableError(cause: unknown): Error {
      // e2e-batch fix #7: prefer `window.location.origin + /api/lsp/session` over
      // `config.lspSessionUrl` in the error message. If VITE_DEV_MODE leaks into
      // a prod build, `config.lspSessionUrl` can be the dev default (containing
      // `localhost:5173`) even though the actual fetch happened at the prod
      // origin via the relative URL fallback. Showing the actual origin keeps
      // the message accurate when env detection misfires.
      const actualUrl =
        typeof window !== 'undefined' ? `${window.location.origin}/api/lsp/session` : config.lspSessionUrl;
      const errorMessage = config.devMode
        ? `Pages Function LSP unreachable (${describeCause(cause)}) — verify ${actualUrl} is reachable from ${typeof window !== 'undefined' ? window.location.origin : 'this origin'}`
        : 'Editor running offline — language services unavailable';
      if (config.devMode) {
        console.warn('[TransportProvider] Pages Function LSP step failed:', cause);
        useOutputStore
          .getState()
          .addLine(
            fmtLine('lsp', 'Pages Function step failed', cause instanceof Error ? cause.message : String(cause)),
            'warn'
          );
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

    /** Main connection flow: direct WS if explicitly preferred, otherwise Pages Function. */
    async function connect(): Promise<Transport> {
      if (!preferDirectWebSocket) {
        return tryPagesFunction();
      }
      try {
        return await tryWebSocket();
      } catch {
        return tryPagesFunction();
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
        // Close the old WebSocket before discarding it — under per-
        // connection Durable Object keying, every reconnect mints a fresh
        // DO, and the OLD one only purges its storage on a real close.
        // The transport is never otherwise observed to close (no `onclose`
        // handling in ws-transport.ts): a bare reassignment here abandons
        // the old socket AND its server-side DO+documents for the life of
        // the tab.
        currentTransport?.close();
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
        // Same reasoning as reconnect() — close before discarding, or
        // unmounting LspProvider leaks the same way.
        currentTransport?.close();
        currentTransport = undefined;
        listeners.length = 0;
        setState({ mode: 'disconnected', status: 'disconnected' });
      }
    };
    // `opts` is app/LSP-infra config (endpoint URLs, timeouts, an opaque
    // workspace id) — never model/user content — safe to capture. The
    // returned TransportProvider is a function-bearing object, skipped.
  },
  {
    op: 'createTransportProvider',
    capture: Capture.Input,
    sanitize: (value, which) => {
      if (which !== 'input') return undefined;
      const [opts] = value as [TransportProviderOptions | undefined];
      return opts
        ? {
            wsUri: opts.wsUri,
            connectionTimeout: opts.connectionTimeout,
            maxReconnectAttempts: opts.maxReconnectAttempts,
            sessionUrl: opts.sessionUrl,
            cfWsBase: opts.cfWsBase
          }
        : undefined;
    }
  }
);

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
