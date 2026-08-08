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
import { URI, DocumentState } from 'langium';
import { RuneLspSession } from '../src/session.js';

// Matches the private keys in session.ts — the test needs them to assert on
// storage keys without importing a private symbol.
const INIT_PARAMS_KEY_FOR_TEST = 'meta:initializeParams';
const META_KEY_FOR_TEST = 'meta';

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
    },
    // No real hibernation lifecycle to protect in tests — just accept the
    // promise the way the real DurableObjectState's waitUntil does.
    waitUntil(promise: Promise<unknown>): void {
      void promise;
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

  it('registers a pending response with state.waitUntil for a real request', async () => {
    // receive() dispatches to Langium's async handlers without awaiting
    // them — on a real hibernatable DO, the runtime may evict the isolate
    // as soon as webSocketMessage's own promise resolves. state.waitUntil
    // is how the DO tells the runtime real work is still outstanding.
    const waitUntilCalls: Array<Promise<unknown>> = [];
    const baseState = makeState();
    const state = {
      ...baseState,
      waitUntil: (p: Promise<unknown>) => {
        waitUntilCalls.push(p);
      }
    } as unknown as import('@cloudflare/workers-types').DurableObjectState;
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

    expect(waitUntilCalls.length).toBeGreaterThan(0);
    // The registered work must actually correlate with the real response —
    // awaiting it should not resolve before the response has been sent.
    await Promise.all(waitUntilCalls);
    expect(ws.sent.some((m: any) => m.id === 1)).toBe(true);
  });

  it('registers in-flight document-build work with state.waitUntil for a didOpen notification', async () => {
    const backing = new Map<string, unknown>();
    const waitUntilCalls: Array<Promise<unknown>> = [];
    const baseState = makeState(backing);
    const state = {
      ...baseState,
      waitUntil: (p: Promise<unknown>) => {
        waitUntilCalls.push(p);
      }
    } as unknown as import('@cloudflare/workers-types').DurableObjectState;
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
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 1)).toBe(true));
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })
    );

    waitUntilCalls.length = 0; // only care about the registration below

    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///i.rosetta', languageId: 'rosetta', version: 0, text: 'namespace ns' } }
      })
    );

    expect(waitUntilCalls.length).toBeGreaterThan(0);
    // By the time the registered work resolves, the build has genuinely
    // reached the Parsed phase and the storage mirror reflects it — proving
    // this isn't a premature/spurious resolve.
    await Promise.all(waitUntilCalls);
    expect(backing.get('docs:file:///i.rosetta')).toBe('namespace ns');
  });

  it('bounds the document-build wait so closing the only open document cannot hang state.waitUntil forever', async () => {
    // A didClose that empties the rebuild set is a real Langium edge
    // case (confirmed by reading document-builder.js): runCancelable
    // still advances DocumentBuilder's internal currentState to
    // Validated for an empty batch, but notifyBuildPhase explicitly
    // skips firing onBuildPhase listeners when that batch is empty — so
    // an unbounded wait registered here could hang on an event that
    // never comes. This is the normal Studio case now that only the
    // active editor document is synchronized (Task 6).
    const waitUntilCalls: Array<Promise<unknown>> = [];
    const baseState = makeState();
    const state = {
      ...baseState,
      waitUntil: (p: Promise<unknown>) => {
        waitUntilCalls.push(p);
      }
    } as unknown as import('@cloudflare/workers-types').DurableObjectState;
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
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 1)).toBe(true));
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })
    );
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///j.rosetta', languageId: 'rosetta', version: 0, text: 'namespace ns' } }
      })
    );

    waitUntilCalls.length = 0; // only care about the didClose registration below

    // Closes the ONLY open document — a delete-only update whose rebuild
    // set is empty.
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didClose',
        params: { textDocument: { uri: 'file:///j.rosetta' } }
      })
    );

    expect(waitUntilCalls.length).toBeGreaterThan(0);
    // Must resolve at all — proves the timeout bound actually releases
    // the registration instead of hanging forever.
    await Promise.all(waitUntilCalls);
  }, 7000);

  it('replays initialize + didOpen on a cold wake after simulated hibernation eviction', async () => {
    const backing = new Map<string, unknown>();
    const state1 = makeState(backing);
    const session1 = new RuneLspSession(state1);
    const ws1 = makeFakeWs();

    // Real client handshake, first "instance" of the DO.
    await session1.webSocketMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { processId: null, rootUri: null, capabilities: {} }
      })
    );
    await vi.waitFor(() => expect(ws1.sent.some((m: any) => m.id === 1)).toBe(true));
    await session1.webSocketMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })
    );
    await session1.webSocketMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///a.rosetta', languageId: 'rosetta', version: 0, text: 'namespace ns' } }
      })
    );
    // Let Langium's async build settle before we "evict".
    await new Promise((r) => setTimeout(r, 20));

    // Simulate hibernation eviction: a FRESH RuneLspSession instance (fresh
    // constructor, fresh in-memory state) sharing the SAME storage backing —
    // exactly what a real wake after eviction looks like.
    const state2 = makeState(backing);
    const session2 = new RuneLspSession(state2);
    const ws2 = makeFakeWs();

    await session2.webSocketMessage(
      ws2 as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'textDocument/hover',
        params: { textDocument: { uri: 'file:///a.rosetta' }, position: { line: 0, character: 2 } }
      })
    );

    await vi.waitFor(() => expect(ws2.sent.some((m: any) => m.id === 2)).toBe(true));
    const hoverResult = ws2.sent.find((m: any) => m.id === 2) as any;
    // The point isn't the hover content — it's that the request did NOT
    // come back as a ServerNotInitialized error, proving the replay ran.
    expect(hoverResult.error?.message ?? '').not.toMatch(/not.*initialized/i);
  });

  it('persists the current full document text on every real content change, and removes it on close', async () => {
    const backing = new Map<string, unknown>();
    const state = makeState(backing);
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
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 1)).toBe(true));
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })
    );
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///b.rosetta', languageId: 'rosetta', version: 0, text: 'namespace a' } }
      })
    );

    // A real editor-style INCREMENTAL didChange — a range replace, not a
    // full-text replace. This is exactly the shape that corrupted the old
    // hand-rolled mirror (it took contentChanges[0].text as the WHOLE doc).
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didChange',
        params: {
          textDocument: { uri: 'file:///b.rosetta', version: 1 },
          contentChanges: [{ range: { start: { line: 0, character: 10 }, end: { line: 0, character: 11 } }, text: 'b' }]
        }
      })
    );

    await vi.waitFor(() => expect(backing.get('docs:file:///b.rosetta')).toBe('namespace b'));

    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didClose',
        params: { textDocument: { uri: 'file:///b.rosetta' } }
      })
    );

    await vi.waitFor(() => expect(backing.has('docs:file:///b.rosetta')).toBe(false));
  });

  it('purges all docs:* storage on a real shutdown request', async () => {
    const backing = new Map<string, unknown>();
    const state = makeState(backing);
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
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 1)).toBe(true));
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })
    );
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///c.rosetta', languageId: 'rosetta', version: 0, text: 'namespace c' } }
      })
    );
    await vi.waitFor(() => expect(backing.get('docs:file:///c.rosetta')).toBe('namespace c'));
    expect(backing.has(INIT_PARAMS_KEY_FOR_TEST)).toBe(true);

    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shutdown', params: null })
    );
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 2)).toBe(true));

    const remainingDocKeys = Array.from(backing.keys()).filter((k) => k.startsWith('docs:'));
    expect(remainingDocKeys).toHaveLength(0);
  });

  it('clears the transport on webSocketClose so it is never reused after close', async () => {
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
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 1)).toBe(true));

    await session.webSocketClose(ws as unknown as WebSocket, 1000, 'normal', true);

    // Internal field — cast to access it for this white-box assertion.
    expect((session as unknown as { transport: unknown }).transport).toBeNull();
  });

  it('purges docs:*, init params, and meta storage on a real close — not just a graceful shutdown request', async () => {
    // Per-connection DO keying (index.ts's handleWsUpgrade) mints a fresh
    // nonce → fresh DO id on every reconnect, so a real disconnect (tab
    // closed, crash, network loss) without a prior `shutdown` request
    // leaves this exact instance permanently unreachable. Its storage must
    // not be left behind to accumulate forever.
    const backing = new Map<string, unknown>();
    const state = makeState(backing);
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
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 1)).toBe(true));
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })
    );
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///d.rosetta', languageId: 'rosetta', version: 0, text: 'namespace d' } }
      })
    );
    await vi.waitFor(() => expect(backing.get('docs:file:///d.rosetta')).toBe('namespace d'));
    expect(backing.has(INIT_PARAMS_KEY_FOR_TEST)).toBe(true);
    // touchMeta() only runs from fetch()'s WS-upgrade path, which this test
    // bypasses (it drives webSocketMessage directly, matching the file's
    // existing convention) — seed it directly to prove the purge itself
    // covers META_KEY, not just that it was never set.
    backing.set(META_KEY_FOR_TEST, { workspaceId: 'test-do-id', createdAt: 0, lastActiveAt: 0 });

    // No `shutdown` request was ever sent — this is a real close only.
    await session.webSocketClose(ws as unknown as WebSocket, 1000, 'normal', true);

    const remainingDocKeys = Array.from(backing.keys()).filter((k) => k.startsWith('docs:'));
    expect(remainingDocKeys).toHaveLength(0);
    expect(backing.has(INIT_PARAMS_KEY_FOR_TEST)).toBe(false);
    expect(backing.has(META_KEY_FOR_TEST)).toBe(false);
  });

  it('waits for the actual initialize response before replaying initialized/didOpen, rather than a fixed delay', async () => {
    // White-box: exercises the response-ack mechanism `replayIfColdWake`
    // relies on directly. The real bug this guards against is timing-
    // dependent (a slower-than-usual real `initialize` racing a fixed
    // sleep), which isn't reliably reproducible by making Langium's actual
    // init handler run slowly — so this proves the mechanism itself is
    // genuinely response-driven, not a fixed-delay guess: it stays pending
    // until the matching response arrives, however long that takes.
    const state = makeState();
    const session = new RuneLspSession(state) as unknown as {
      waitForResponse(id: string, timeoutMs: number): Promise<void>;
      notifyResponseWaiters(raw: string): void;
    };

    let resolved = false;
    const ack = session.waitForResponse('probe-id', 200).then(() => {
      resolved = true;
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(resolved).toBe(false); // still genuinely waiting — no fixed-delay shortcut

    session.notifyResponseWaiters(JSON.stringify({ jsonrpc: '2.0', id: 'probe-id', result: {} }));
    await ack;
    expect(resolved).toBe(true);
  });

  it('the response-ack wait has a bounded safety-net timeout so a never-answered id cannot hang the DO', async () => {
    const state = makeState();
    const session = new RuneLspSession(state) as unknown as {
      waitForResponse(id: string, timeoutMs: number): Promise<void>;
    };

    const startedAt = Date.now();
    await session.waitForResponse('never-answered', 30);
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(25);
  });

  it('waits for replayed documents to finish building before forwarding the triggering request', async () => {
    const backing = new Map<string, unknown>();
    const state1 = makeState(backing);
    const session1 = new RuneLspSession(state1);
    const ws1 = makeFakeWs();

    await session1.webSocketMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { processId: null, rootUri: null, capabilities: {} }
      })
    );
    await vi.waitFor(() => expect(ws1.sent.some((m: any) => m.id === 1)).toBe(true));
    await session1.webSocketMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })
    );
    await session1.webSocketMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///e.rosetta', languageId: 'rosetta', version: 0, text: 'namespace ns' } }
      })
    );
    await new Promise((r) => setTimeout(r, 20));

    const state2 = makeState(backing);
    const session2 = new RuneLspSession(state2);
    const ws2 = makeFakeWs();

    // The very first message after a cold wake drives ensureLangium +
    // replayIfColdWake to completion within this SAME await — by the time
    // it resolves, the replayed document must already be Linked (not just
    // Parsed), or a query running immediately after could see an
    // unresolved/empty index.
    await session2.webSocketMessage(
      ws2 as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'textDocument/hover',
        params: { textDocument: { uri: 'file:///e.rosetta' }, position: { line: 0, character: 2 } }
      })
    );

    // White-box: read the replayed document's actual build state off the
    // real Langium instance this session constructed.
    const langium = (
      session2 as unknown as {
        langium: {
          shared: { workspace: { LangiumDocuments: { getDocument(uri: URI): { state: DocumentState } | undefined } } };
        };
      }
    ).langium;
    const doc = langium.shared.workspace.LangiumDocuments.getDocument(URI.parse('file:///e.rosetta'));
    expect(doc?.state).toBeGreaterThanOrEqual(DocumentState.Linked);
  });

  it('gates every concurrent frame on the in-flight cold-wake replay, not just the first', async () => {
    const backing = new Map<string, unknown>();
    const state1 = makeState(backing);
    const session1 = new RuneLspSession(state1);
    const ws1 = makeFakeWs();

    await session1.webSocketMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { processId: null, rootUri: null, capabilities: {} }
      })
    );
    await vi.waitFor(() => expect(ws1.sent.some((m: any) => m.id === 1)).toBe(true));
    await session1.webSocketMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })
    );
    await session1.webSocketMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///f.rosetta', languageId: 'rosetta', version: 0, text: 'namespace ns' } }
      })
    );
    await new Promise((r) => setTimeout(r, 20));

    const state2 = makeState(backing);
    const session2 = new RuneLspSession(state2);
    const ws2 = makeFakeWs();

    // Two frames land back-to-back — neither is awaited before the other
    // starts, simulating two nearly-simultaneous client messages hitting
    // the DO while it is still replaying. Pre-fix, the second frame would
    // see `this.transport` already set by the first and forward straight
    // through, racing ahead of the still-in-flight replay.
    await Promise.all([
      session2.webSocketMessage(
        ws2 as unknown as WebSocket,
        JSON.stringify({
          jsonrpc: '2.0',
          id: 10,
          method: 'textDocument/hover',
          params: { textDocument: { uri: 'file:///f.rosetta' }, position: { line: 0, character: 2 } }
        })
      ),
      session2.webSocketMessage(
        ws2 as unknown as WebSocket,
        JSON.stringify({
          jsonrpc: '2.0',
          id: 11,
          method: 'textDocument/hover',
          params: { textDocument: { uri: 'file:///f.rosetta' }, position: { line: 0, character: 2 } }
        })
      )
    ]);

    await vi.waitFor(() => {
      expect(ws2.sent.some((m: any) => m.id === 10)).toBe(true);
      expect(ws2.sent.some((m: any) => m.id === 11)).toBe(true);
    });

    const res10 = ws2.sent.find((m: any) => m.id === 10) as any;
    const res11 = ws2.sent.find((m: any) => m.id === 11) as any;
    // Neither concurrent frame should see the server still Initializing —
    // both must have waited on the SAME in-flight replay to finish.
    expect(res10.error?.message ?? '').not.toMatch(/not.*initialized/i);
    expect(res11.error?.message ?? '').not.toMatch(/not.*initialized/i);
  });

  it('does not let an in-flight build resurrect storage after a real close purges it', async () => {
    const backing = new Map<string, unknown>();
    const state = makeState(backing);
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
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 1)).toBe(true));
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })
    );
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///g.rosetta', languageId: 'rosetta', version: 0, text: 'namespace a' } }
      })
    );
    await vi.waitFor(() => expect(backing.get('docs:file:///g.rosetta')).toBe('namespace a'));

    // Fire a didChange but do NOT wait for its async build to settle
    // before closing — this simulates a real disconnect racing an
    // in-flight build triggered just before the socket closed.
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didChange',
        params: {
          textDocument: { uri: 'file:///g.rosetta', version: 1 },
          contentChanges: [{ range: { start: { line: 0, character: 10 }, end: { line: 0, character: 11 } }, text: 'z' }]
        }
      })
    );
    await session.webSocketClose(ws as unknown as WebSocket, 1000, 'normal', true);

    // Give the in-flight build (kicked off by the didChange above,
    // fire-and-forget) time to actually finish and reach its
    // onBuildPhase callback — pre-fix, this would re-write the doc that
    // was just purged.
    await new Promise((r) => setTimeout(r, 50));

    expect(backing.has('docs:file:///g.rosetta')).toBe(false);
  });

  it('does not let an in-flight build resurrect storage after a graceful shutdown purges it', async () => {
    // Same race as the real-close case above, but via the OTHER path that
    // calls purgeStorage: a graceful `shutdown` request. A client that
    // sends `shutdown` and then goes quiet without ever sending `exit`
    // must not leave source text behind either.
    const backing = new Map<string, unknown>();
    const state = makeState(backing);
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
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 1)).toBe(true));
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })
    );
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didOpen',
        params: { textDocument: { uri: 'file:///h.rosetta', languageId: 'rosetta', version: 0, text: 'namespace a' } }
      })
    );
    await vi.waitFor(() => expect(backing.get('docs:file:///h.rosetta')).toBe('namespace a'));

    // Fire a didChange but do NOT wait for its async build to settle
    // before the client sends `shutdown` — the build is still in flight
    // when purgeStorage runs.
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({
        jsonrpc: '2.0',
        method: 'textDocument/didChange',
        params: {
          textDocument: { uri: 'file:///h.rosetta', version: 1 },
          contentChanges: [{ range: { start: { line: 0, character: 10 }, end: { line: 0, character: 11 } }, text: 'z' }]
        }
      })
    );
    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'shutdown', params: null })
    );
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 2)).toBe(true));

    // Give the in-flight build time to actually finish and reach its
    // onBuildPhase callback — pre-fix, this would re-write the doc that
    // shutdown's purge just deleted.
    await new Promise((r) => setTimeout(r, 50));

    expect(backing.has('docs:file:///h.rosetta')).toBe(false);
  });
});
