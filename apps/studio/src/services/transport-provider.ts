// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * LSP transport with reactive connection state and WebSocket failover.
 * Defaults to session-token minting followed by a token-gated WebSocket.
 * An explicit `wsUri` tries direct WebSocket first, with token-gated fallback.
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
  /** Session mint endpoint. Defaults to `config.lspSessionUrl`. */
  sessionUrl?: string;
  /**
   * WebSocket base for the Pages Function LSP; the token is appended at
   * `\`${cfWsBase}/ws/${token}\``. Defaults to `config.lspWsUrl`.
   */
  cfWsBase?: string;
  /** Opaque workspace identifier sent to the mint endpoint. */
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

/** LSP host base URL, configured by VITE_LSP_WS_URL. */
const DEFAULT_WS_URI = config.lspWsUrl;
const DEFAULT_TIMEOUT = 2000;
const DEFAULT_MAX_RECONNECT = 3;
const DEFAULT_BACKOFF_BASE = 500;
/** Fallback identifier when the caller omits workspaceId. */
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
    // Cross-origin session endpoints still require token-gated WebSocket;
    // the hosted LSP has no unauthenticated upgrade route.
    const preferDirectWebSocket = opts?.wsUri !== undefined;

    let state: TransportState = { mode: 'disconnected', status: 'disconnected' };
    let currentTransport: CloseableTransport | undefined;
    const listeners: ((state: TransportState) => void)[] = [];

    function setState(next: TransportState): void {
      state = next;
      // eslint-disable-next-line unicorn/no-useless-spread
      for (const l of [...listeners]) l(state);
    }

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

    /** Mint a token; attach HTTP status to errors for retry handling. */
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
        // The namespace enables production instrumentation. Keep token and
        // workspace data out of captures; record only the failure status.
        // LspProvider owns the user-facing error toast.
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

    const openPagesFunctionWs = withInstrumentation(
      async function openPagesFunctionWs(token: string): Promise<CloseableTransport> {
        const wsUrl = `${cfWsBase.replace(/\/$/, '')}/ws/${encodeURIComponent(token)}`;
        return createWebSocketTransport(wsUrl, connectionTimeout);
      },
      {
        // Leave capture disabled: the input is a bearer token.
        op: 'openPagesFunctionWs',
        namespace: 'lsp' satisfies InstrumentationNamespace,
        toast: false
      }
    );

    const tryPagesFunction = withInstrumentation(
      async function tryPagesFunction(): Promise<Transport> {
        setState({ mode: 'pages-function', status: 'connecting' });
        let token: string;
        try {
          token = await mintSessionToken();
        } catch (err) {
          const status = (err as { status?: number }).status;
          if (status === 401) {
            // Retry once to tolerate signing-key rotation.
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
          // The signing key can rotate between minting and connecting.
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
        // Include minting and retries, which server-side request timing excludes.
        op: 'connectPagesFunctionLsp',
        namespace: 'lsp' satisfies InstrumentationNamespace,
        toast: false
      }
    );

    function createPagesFunctionUnavailableError(cause: unknown): Error {
      // Local and preview builds can mint against a different origin.
      const actualUrl = sessionUrl;
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
        // Closing the socket lets the previous Durable Object release its documents.
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
        currentTransport?.close();
        currentTransport = undefined;
        listeners.length = 0;
        setState({ mode: 'disconnected', status: 'disconnected' });
      }
    };
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
