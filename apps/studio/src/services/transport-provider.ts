/**
 * Transport provider with automatic failover (T011).
 *
 * Connection strategy:
 *   1. Try WebSocket (external server — full Langium + OS access).
 *   2. On failure, retry up to `maxReconnectAttempts` with exponential backoff.
 *   3. Fall back to embedded Worker transport (in-browser Langium).
 *
 * The provider exposes a reactive state so UI components can show
 * connection status without polling.
 */

import type { Transport } from '@codemirror/lsp-client';
import { createWebSocketTransport } from './ws-transport.js';
import { createWorkerTransport } from './worker-transport.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type TransportMode = 'disconnected' | 'websocket' | 'embedded';
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

const DEFAULT_WS_URI = 'ws://localhost:3001';
const DEFAULT_TIMEOUT = 2000;
const DEFAULT_MAX_RECONNECT = 3;
const DEFAULT_BACKOFF_BASE = 500;

export function createTransportProvider(opts?: TransportProviderOptions): TransportProvider {
  const wsUri = opts?.wsUri ?? DEFAULT_WS_URI;
  const connectionTimeout = opts?.connectionTimeout ?? DEFAULT_TIMEOUT;
  const maxReconnectAttempts = opts?.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT;
  const backoffBase = opts?.backoffBase ?? DEFAULT_BACKOFF_BASE;

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

  /** Fall back to the embedded Worker transport. */
  function tryWorker(): Transport {
    const transport = createWorkerTransport();
    setState({ mode: 'embedded', status: 'connected' });
    currentTransport = transport;
    return transport;
  }

  /** Main connection flow: WS first → Worker fallback. */
  async function connect(): Promise<Transport> {
    try {
      return await tryWebSocket();
    } catch {
      return tryWorker();
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
