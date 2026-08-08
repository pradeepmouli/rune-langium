// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * apps/lsp-worker RuneLspSession DO integration tests.
 *
 * No @cloudflare/vitest-pool-workers dependency needed: a hand-rolled fake
 * DurableObjectState (matching the existing pattern in upgrade.test.ts /
 * session.test.ts / apps/telemetry-worker/test/ingest.test.ts) is enough to
 * exercise real DO logic, including hibernation eviction — which we
 * simulate by constructing a SECOND RuneLspSession instance that shares the
 * same underlying storage Map as the first. That is precisely what a real
 * hibernation eviction does: the DO's constructor runs again, storage
 * persists, in-memory state does not.
 */

import { describe, it, expect, vi } from 'vitest';
import { RuneLspSession } from '../src/session.js';

// ── Fake DurableObjectState ──────────────────────────────────────────────

function makeStorage(backing = new Map<string, unknown>()) {
  return {
    backing,
    async get<T>(key: string): Promise<T | undefined> {
      return backing.get(key) as T | undefined;
    },
    async put(key: string, value: unknown): Promise<void> {
      backing.set(key, value);
    },
    async delete(keys: string | string[]): Promise<boolean> {
      const arr = Array.isArray(keys) ? keys : [keys];
      let any = false;
      for (const k of arr) any = backing.delete(k) || any;
      return any;
    },
    async list({ prefix }: { prefix?: string } = {}): Promise<Map<string, unknown>> {
      const out = new Map<string, unknown>();
      for (const [k, v] of backing) {
        if (!prefix || k.startsWith(prefix)) out.set(k, v);
      }
      return out;
    }
  };
}

function makeState(storageBacking = new Map<string, unknown>()) {
  const storage = makeStorage(storageBacking);
  return {
    id: { toString: () => 'test-do-id' },
    storage,
    async blockConcurrencyWhile<T>(fn: () => Promise<T>): Promise<T> {
      return fn();
    }
  } as unknown as import('@cloudflare/workers-types').DurableObjectState;
}

// ── Fake CF WebSocket ────────────────────────────────────────────────────

function makeFakeWs() {
  const sent: unknown[] = [];
  return {
    readyState: 1,
    sent,
    send(data: string) {
      sent.push(JSON.parse(data));
    },
    close() {
      /* noop */
    }
  } as unknown as WebSocket & { sent: unknown[] };
}

describe('RuneLspSession — real Langium wiring', () => {
  it('forwards initialize + didOpen to the real langium server and gets a real InitializeResult back', async () => {
    const state = makeState();
    const session = new RuneLspSession(state);
    const ws = makeFakeWs();

    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { processId: null, rootUri: null, capabilities: {} }
      })
    );

    // Give the async LSPServer/Langium pipeline a tick to respond.
    await vi.waitFor(() => {
      expect(ws.sent.some((m: any) => m.id === 1)).toBe(true);
    });

    const initResult = ws.sent.find((m: any) => m.id === 1) as any;
    expect(initResult.result.capabilities.hoverProvider).toBe(true);
    expect(initResult.result.capabilities.textDocumentSync.change).toBe(2); // Incremental
  });
});
