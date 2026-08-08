<!-- SPDX-License-Identifier: FSL-1.1-ALv2 -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Wire the real Langium LSP server into the production Durable Object — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/lsp-worker/src/session.ts` (the production `RuneLspSession` Durable Object) actually forward LSP traffic to the real, already-built Langium server (`createRuneLspServer()`), so diagnostics/hover/completion/go-to-definition work in production instead of the current no-op stub — while surviving Cloudflare's Hibernation API correctly and staying within its per-isolate memory ceiling.

**Architecture:** Replace the DO's hand-rolled JSON-RPC router with a thin pass-through into `DurableObjectWebSocketTransport` (already built, `packages/lsp-server`), persist the client's `initialize` handshake so a fresh DO instance (post-hibernation-eviction) can replay it before forwarding real traffic, derive the DO's storage snapshot from Langium's own document text (not raw wire deltas) via a `DocumentBuilder.onUpdate` hook, and scope what the studio ever syncs into the DO down to the single active editor document.

**Tech Stack:** Cloudflare Durable Objects (Hibernation API, SQLite-backed storage), `@lspeasy/server`/`@lspeasy/core`, Langium 4.3.1 (`langium/lsp`), `@rune-langium/lsp-server`, `@codemirror/lsp-client` (studio side), Vitest (plain `node` pool — no Miniflare/`@cloudflare/vitest-pool-workers` needed, see Task 7).

## Global Constraints

- Source spec: `docs/superpowers/specs/2026-05-13-lsp-server-feature-parity-design.md` (revised 2026-08-08, all four open decisions resolved) — every task below traces to a numbered task in that spec's §6; deviations from the spec's literal wording are called out explicitly with rationale in the relevant task.
- DRY is the #1 correctness rule in this repo (`CLAUDE.md`). Do not reimplement `TextDocument` incremental-range application, LSP capability negotiation, or document-close bookkeeping that Langium/`@lspeasy/server` already do correctly — every task below reads Langium's own post-processed state rather than re-deriving it from raw wire messages.
- No feature flag for rollout (spec §6 T4.1, decided 2026-08-08) — ship directly.
- The DO is keyed per connection, not per `workspaceId` (spec §7, T2.4) — reuses the session token's existing `nonce` field; zero client-side changes needed.
- `apps/lsp-worker` deploys via `wrangler deploy` as its own Worker (`rune-lsp-worker`), **not** via the studio's Cloudflare Pages git-integration deploy (`reference_cloudflare_pages_deploy_mechanism` memory) — Task 8 calls this out as a manual step.
- `apps/lsp-worker/functions/**` licensing: FSL-1.1-ALv2 (studio-adjacent infra); `packages/lsp-server/**` is MIT. Keep the existing SPDX headers on every file touched or created.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/lsp-worker/src/session.ts` | The whole DO rewrite: transport wiring, replay, per-instance lifecycle. Modified in Tasks 2–5. |
| `apps/lsp-worker/src/index.ts` | Per-connection DO keying (`handleWsUpgrade`). Modified in Task 4. |
| `packages/lsp-server/src/document-update-handler.ts` | **New.** `RuneDocumentUpdateHandler` — the one real Langium-behavior gap this plan fixes upstream (didClose never evicted a document from the workspace index in any consumer, not just the DO). Created in Task 5. |
| `packages/lsp-server/src/rune-dsl-server.ts` | Wires the new handler into `createRuneLspServer()`. Modified in Task 5. |
| `packages/lsp-server/src/index.ts` | Export the new handler for the DO/tests to reference its type. Modified in Task 5. |
| `apps/studio/src/shell/providers/LspProvider.tsx` | Scope `syncWorkspaceFiles` to the active editor document only. Modified in Task 6. |
| `apps/lsp-worker/test/session-lsp.test.ts` | **New.** DO-level integration tests (replay, transport lifecycle, storage-mirror round-trip, shutdown purge). Created in Task 7. |
| `apps/studio/functions/lib/lsp-session-do.ts`, `apps/studio/functions/test/lsp-session-do.test.ts` | **Deleted** in Task 1 — dead code, Cloudflare Pages cannot host the Durable Object class it defines. |
| `apps/studio/functions/api/lsp/ws/[token].ts` | Stale `export { RuneLspSession }` re-export removed in Task 1. |

---

### Task 1: Delete the dead Pages-Function DO copy

**Files:**
- Delete: `apps/studio/functions/lib/lsp-session-do.ts`
- Delete: `apps/studio/functions/test/lsp-session-do.test.ts`
- Modify: `apps/studio/functions/api/lsp/ws/[token].ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing — this task only removes unreachable code so later tasks aren't confused about which `session.ts`-adjacent file is real. Nothing after this task references the deleted files.

Cloudflare Pages Functions cannot host a Durable Object class — DOs are bound from a Worker-owned namespace (`apps/studio/wrangler.toml:11-20` documents this). `apps/studio/functions/lib/lsp-session-do.ts` has never been the live DO in production; the real one is `apps/lsp-worker/src/session.ts`. Do not port logic from the dead file's design as an "already correct" reference for this plan's tasks — Task 3 and Task 5 explain the two real defects it has (no `initialize`/`initialized` hibernation replay; a raw-delta storage mirror that corrupts once incremental sync is negotiated) and design around them instead of copying them.

- [ ] **Step 1: Confirm nothing else imports the dead file**

Run: `rg -l "lsp-session-do" apps/studio/functions apps/studio/src` (or the infigraph `search` equivalent if available). Expected: only `apps/studio/functions/api/lsp/ws/[token].ts` and the dead file's own test.

- [ ] **Step 2: Read `apps/studio/functions/api/lsp/ws/[token].ts` and remove the re-export**

The file currently has (near the top, alongside its real request-handling logic):

```ts
export { RuneLspSession } from '../../../lib/lsp-session-do.js';
```

Delete this line and its import. Nothing else in the file should reference `RuneLspSession` — the actual request handler in this file proxies to the Worker over HTTP/WS, it never constructs the DO class directly (that only happens where `wrangler.toml` binds it, in `apps/lsp-worker`).

- [ ] **Step 3: Delete the two dead files**

```bash
git rm apps/studio/functions/lib/lsp-session-do.ts apps/studio/functions/test/lsp-session-do.test.ts
```

- [ ] **Step 4: Run studio's type-check and test suite to confirm nothing broke**

Run: `pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio run test`
Expected: both green. If type-check fails on `[token].ts`, you missed a reference to the deleted export — search again per Step 1.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/functions/api/lsp/ws/[token].ts
git commit -m "chore(lsp): delete dead Pages-Function DO copy

Cloudflare Pages cannot host a Durable Object — apps/studio/functions/lib/lsp-session-do.ts
has never been the live DO in production (apps/lsp-worker/src/session.ts is). Confirmed via
docs/superpowers/specs/2026-05-13-lsp-server-feature-parity-design.md §1."
```

---

### Task 2: Wire the real Langium server into the DO's message dispatch

**Files:**
- Modify: `apps/lsp-worker/src/session.ts` (full rewrite of the dispatch path; the WebSocket-upgrade `fetch()` method and `touchMeta()` helper are unchanged)

**Interfaces:**
- Consumes: `createRuneLspServer()`, `DurableObjectWebSocketTransport`, and the `RuneLspServer` type — all from `@rune-langium/lsp-server` (already exported per `packages/lsp-server/src/index.ts`).
- Produces: `RuneLspSession` keeps its existing public shape (`fetch`, `webSocketMessage`, `webSocketClose`) so `apps/lsp-worker/src/index.ts` and the existing `apps/lsp-worker/test/upgrade.test.ts` don't need changes from this task alone. Adds two new private fields other tasks build on: `private transport: DurableObjectWebSocketTransport | null` and a persisted storage key `INIT_PARAMS_KEY = 'meta:initializeParams'` that Task 3 reads.

This is the core rewrite. Delete `SERVER_CAPABILITIES` (spec §4 — Langium's `startLanguageServer` computes real capabilities via `buildInitializeResult`; a second hand-maintained list is exactly the drift hazard the current code comment already warns about), delete the `handleRequest`/`handleNotification`/`dispatch` switch entirely, and replace with a straight `transport.receive(text)` forward. Also delete the `parseAndPublish`/`ensureLangium`/`pendingChanges`/`DIDCHANGE_DEBOUNCE_MS` machinery — diagnostics now come from Langium's own async pipeline via `publishDiagnostics` notifications, which the transport forwards to the client automatically.

**On the didChange debounce (spec §5's open coalescing question, T2.8):** this task does **not** add a server-side debounce. The spec's suggestion to "keep a debounce at the transport-forward layer" is unsafe as literally stated: once §4's capability change lands, the client sends `Incremental` (range-scoped) `didChange` deltas, and coalescing multiple incoming deltas down to "just forward the latest one" silently drops intermediate range edits — each delta's range is relative to the document state *after* the previous delta, so skipping one desyncs the document from that point forward. Reimplementing delta-merging locally to coalesce safely would just be another instance of the DRY violation this plan is fixing (T2.5). Instead: forward every `didChange` immediately. `@codemirror/lsp-client`'s own `StudioWorkspace.syncFiles()` (`apps/studio/src/services/lsp-client.ts:96-110`) already batches unsynced edits client-side before sending, and Langium's `WorkspaceLock` (`document-update-handler.js:47`) serializes concurrent builds so rapid succession can't race — between the two, per-keystroke rebuild cost should be bounded in practice. If production measurement after rollout (Task 8) shows otherwise, the safe fix is increasing the *client's* batching interval, not server-side delta coalescing.

- [ ] **Step 1: Write the failing test for the new dispatch shape**

Create `apps/lsp-worker/test/session-lsp.test.ts` (this file grows through Tasks 2, 3, 5, and 7 — start it here):

```ts
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
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
```

- [ ] **Step 2: Run it to confirm it fails against the current stub**

Run: `pnpm --filter @rune-langium/lsp-worker test -- session-lsp`
Expected: FAIL — the current stub's `initialize` handler responds with the hand-rolled `SERVER_CAPABILITIES` (`hoverProvider` absent, `textDocumentSync.change === 1`), not Langium's real capabilities.

- [ ] **Step 3: Rewrite `apps/lsp-worker/src/session.ts`**

Replace the whole file (the doc comment, `MetaRecord`, `touchMeta()`, and `fetch()`'s WebSocket-pairing logic are unchanged from the current file — keep them verbatim). The parts that change:

```ts
import type { DurableObjectState } from '@cloudflare/workers-types';
import { createRuneLspServer, DurableObjectWebSocketTransport, type RuneLspServer } from '@rune-langium/lsp-server';

// ────────────────────────────────────────────────────────────────────────────
// Storage shape
// ────────────────────────────────────────────────────────────────────────────

interface MetaRecord {
  workspaceId: string;
  createdAt: number;
  lastActiveAt: number;
  originHash?: string;
}

const DOC_PREFIX = 'docs:';
const META_KEY = 'meta';
/** Persisted verbatim client `initialize` params — replayed on a cold DO wake. See Task 3. */
const INIT_PARAMS_KEY = 'meta:initializeParams';

// ────────────────────────────────────────────────────────────────────────────
// JSON-RPC 2.0 framing helpers (unchanged from the current file)
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

const ERR_PARSE = -32700;
const ERR_INTERNAL = -32603;

// ────────────────────────────────────────────────────────────────────────────
// RuneLspSession DO
// ────────────────────────────────────────────────────────────────────────────

export class RuneLspSession {
  /** Fresh per DO instance — constructed exactly once per wake (Task 3). */
  private langium: RuneLspServer | null = null;
  private langiumLoadError: string | null = null;
  private transport: DurableObjectWebSocketTransport | null = null;
  private ws: WebSocket | null = null;

  constructor(private readonly state: DurableObjectState) {}

  // ── fetch()/touchMeta(): UNCHANGED from the current file — copy verbatim ──

  async fetch(req: Request): Promise<Response> { /* ...unchanged, see current file... */ }
  private async touchMeta(): Promise<void> { /* ...unchanged, see current file... */ }

  // ── Hibernation-API entry points ───────────────────────────────────────

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
    // forwarding, so a future cold wake (Task 3) can replay this exact
    // handshake. LSPServer only accepts one `initialize` per instance
    // lifetime (connection-adapter.ts's registerInitializeHandler throws
    // "Server already initialized" on a second one) — the real client
    // sends exactly one per WS connection, matching this write happening
    // exactly once per DO instance too.
    if (isJsonRpcRequest(parsed) && parsed.method === 'initialize') {
      await this.state.blockConcurrencyWhile(async () => {
        await this.state.storage.put(INIT_PARAMS_KEY, parsed.params ?? {});
      });
    }

    this.transport!.receive(text);
  }

  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.ws = null;
    // Defensive, per spec §3/§7 T2.4 — under this plan's per-connection DO
    // keying (Task 4), a second fetch() on this exact instance should never
    // happen (each reconnect mints a fresh nonce → fresh DO id), but clearing
    // eagerly means a stale, permanently-closed transport is never reused if
    // that assumption is ever violated.
    this.transport?.signalClose();
    this.transport = null;
  }

  // ── Lazy init ───────────────────────────────────────────────────────────

  private async ensureLangium(ws: WebSocket): Promise<boolean> {
    if (this.langium && this.transport) return true;
    if (this.langiumLoadError) return false;
    try {
      this.langium = createRuneLspServer();
      this.transport = new DurableObjectWebSocketTransport(ws as unknown as { readyState: number; send(data: string): void; close?(code?: number, reason?: string): void });
      // Does not await — listen() only resolves when the transport closes.
      void this.langium.listen(this.transport);
      return true;
    } catch (err) {
      this.langiumLoadError = err instanceof Error ? err.message : String(err);
      return false;
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
}
```

Note what's gone versus the current file: `SERVER_CAPABILITIES`, `DIDCHANGE_DEBOUNCE_MS`, `pendingChanges`, `dispatch`/`handleRequest`/`handleNotification`/`parseAndPublish`/`handleShutdown` are all deleted — `handleShutdown`'s `docs:*` purge behavior is **not lost**, it moves to Task 5 (rebuilt correctly, driven by Langium's own document-close signal rather than a hand-rolled `shutdown` request handler, since `shutdown` now flows straight through `transport.receive()` to Langium/`@lspeasy/server`'s own lifecycle handling).

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `pnpm --filter @rune-langium/lsp-worker test -- session-lsp`
Expected: PASS.

- [ ] **Step 5: Run the full lsp-worker suite to confirm nothing else broke**

Run: `pnpm --filter @rune-langium/lsp-worker test`
Expected: `upgrade.test.ts` and `session.test.ts` still green — they only exercise `index.ts`'s routes with a DO stub, not `RuneLspSession`'s internals, so this rewrite shouldn't affect them. If `upgrade.test.ts`'s `'exports the RuneLspSession DO class for the wrangler binding'` test fails, check the class export path didn't change.

- [ ] **Step 6: Type-check**

Run: `pnpm --filter @rune-langium/lsp-worker run type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/lsp-worker/src/session.ts apps/lsp-worker/test/session-lsp.test.ts
git commit -m "feat(lsp-worker): wire the DO to the real Langium LSP server

Replaces the hand-rolled JSON-RPC router and SERVER_CAPABILITIES stub with a
straight forward into DurableObjectWebSocketTransport + createRuneLspServer().
Capabilities now come from Langium's own buildInitializeResult. No server-side
didChange debounce (see task rationale — coalescing incremental deltas is
unsafe without reimplementing range-apply, which packages/lsp-server/Langium
already do correctly)."
```

---

### Task 3: Cold-wake replay (initialize → initialized → didOpen)

**Files:**
- Modify: `apps/lsp-worker/src/session.ts`
- Modify: `apps/lsp-worker/test/session-lsp.test.ts`

**Interfaces:**
- Consumes: `INIT_PARAMS_KEY` and `DOC_PREFIX` (Task 2), the `RuneLspServer.listen()` contract from `@rune-langium/lsp-server`.
- Produces: `ensureLangium()` gains a replay step other tasks don't need to know about — it's purely internal to this file.

This is the fix for the spec's single most important correction (§3): without replaying `initialize`→`initialized`→`didOpen`×N before forwarding real traffic on a cold DO wake, `@lspeasy/server`'s state machine stays in `Created` forever (every non-lifecycle request → `ServerNotInitialized`) and Langium's `DocumentBuilder` never fires (no diagnostics, ever again) — both silently, with no error surfaced anywhere.

- [ ] **Step 1: Write the failing test — simulated hibernation eviction**

Append to `apps/lsp-worker/test/session-lsp.test.ts`:

```ts
  it('replays initialize + didOpen on a cold wake after simulated hibernation eviction', async () => {
    const backing = new Map<string, unknown>();
    const state1 = makeState(backing);
    const session1 = new RuneLspSession(state1);
    const ws1 = makeFakeWs();

    // Real client handshake, first "instance" of the DO.
    await session1.webSocketMessage(
      ws1 as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } })
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
    expect(hoverResult.error?.message).not.toMatch(/not.*initialized/i);
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @rune-langium/lsp-worker test -- session-lsp`
Expected: FAIL — `session2` never saw `initialize`, so the hover request comes back as a `ServerNotInitialized`-shaped error (or the server silently never responds, timing the `waitFor` out).

- [ ] **Step 3: Add the replay to `ensureLangium()`**

```ts
  private async ensureLangium(ws: WebSocket): Promise<boolean> {
    if (this.langium && this.transport) return true;
    if (this.langiumLoadError) return false;
    try {
      this.langium = createRuneLspServer();
      this.transport = new DurableObjectWebSocketTransport(ws as unknown as { readyState: number; send(data: string): void; close?(code?: number, reason?: string): void });
      void this.langium.listen(this.transport);
      await this.replayIfColdWake();
      return true;
    } catch (err) {
      this.langiumLoadError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  /**
   * On a fresh DO construction that already has a persisted `initialize`
   * handshake (i.e. this is a cold wake after hibernation, not a brand-new
   * connection), replay initialize → initialized → one didOpen per stored
   * document — all with sentinel/dummy ids so the client never sees them —
   * before any real traffic is forwarded. See spec §3 for why this is
   * required and what breaks without it.
   */
  private async replayIfColdWake(): Promise<void> {
    if (!this.transport) return;
    const initParams = await this.state.storage.get<unknown>(INIT_PARAMS_KEY);
    if (initParams === undefined) return; // brand-new connection — nothing to replay

    const SENTINEL_ID = '__replay_initialize__';
    this.transport.receive(JSON.stringify({ jsonrpc: '2.0', id: SENTINEL_ID, method: 'initialize', params: initParams }));
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
```

The sentinel `initialize` response the server sends back for `id: '__replay_initialize__'` reaches `send()` → `this.ws.send(...)` like any other response — it goes out over the wire to a client that never asked for it. That's fine: `@codemirror/lsp-client` only `console.warn`s on an unmatched response id (per the spec's citation of `index.cjs:656`), it doesn't error or disconnect. If this ever needs tightening, filter it in `send()` by id — not needed for correctness today.

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `pnpm --filter @rune-langium/lsp-worker test -- session-lsp`
Expected: PASS.

- [ ] **Step 5: Run the full lsp-worker suite + type-check**

Run: `pnpm --filter @rune-langium/lsp-worker test && pnpm --filter @rune-langium/lsp-worker run type-check`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add apps/lsp-worker/src/session.ts apps/lsp-worker/test/session-lsp.test.ts
git commit -m "fix(lsp-worker): replay initialize/initialized/didOpen on cold DO wake

Without this, a hibernation-evicted DO's fresh LSPServer instance stays in
the Created state forever (ServerNotInitialized on every request) and
Langium's DocumentBuilder never fires (no diagnostics), both silently.
Persisted client initialize params (Task 2) are the source of truth for
the replay. Per spec §3, this is the single most important correction
from the pre-existing dead implementation."
```

---

### Task 4: Per-connection DO keying + transport-lifecycle hygiene

**Files:**
- Modify: `apps/lsp-worker/src/index.ts` (`handleWsUpgrade`, line ~190)
- Modify: `apps/lsp-worker/test/upgrade.test.ts` (extend, don't replace, the existing tests)

**Interfaces:**
- Consumes: `verified.token.workspaceId` and `verified.token.nonce` — both already present on `SessionTokenPayload` (`apps/lsp-worker/src/auth.ts:38`) and already flowing through `verifySessionToken`.
- Produces: nothing new for later tasks — this is a leaf change.

Per the spec's decided §7 resolution: key the DO per connection, not per `workspaceId` alone. This is a one-line change with an already-available identifier — `apps/studio/src/services/transport-provider.ts`'s `mintSessionToken()` calls `POST /api/lsp/session` fresh on every `connect()`/`reconnect()`, and the Worker's `handleSessionMint` (`apps/lsp-worker/src/index.ts:140-151`) already stamps a fresh `nonce` (`newNonceHex()`) into every minted token. Combining `workspaceId` and `nonce` gives a stable-per-connection, unique-per-mint identity with **zero studio-side changes** — matching what `data-model.md §1`'s original intent already described (`<sessionToken>:<workspaceId>`) but the code simplified away.

**Design note — the T3.6 "reconnect without eviction" scenario from the spec doesn't actually reach the transport-lifecycle bug it was written to test.** Under per-connection keying, `TransportProvider.reconnect()` always re-mints a token (new nonce) before opening a new WS (`transport-provider.ts:294-297` → `tryPagesFunction()` → `mintSessionToken()`), so every reconnect — even a same-tab network blip — lands on a brand-new DO id. The scenario the dead file's comment worried about ("the same DO instance may get re-targeted by another upgrade") is provably unreachable under this design. Task 2's `webSocketClose` fix (clear `this.transport`) stays in as defensive hygiene since it's free and correct, but Task 7's test for it is a direct unit test of that clearing behavior, not an end-to-end "reconnect to the same instance" scenario — there's no reachable code path left to drive that scenario through `index.ts`.

- [ ] **Step 1: Write the failing test**

Add to `apps/lsp-worker/test/upgrade.test.ts` (inside the existing `describe` block):

```ts
  it('keys the DO per connection (workspaceId:nonce), not by workspaceId alone', async () => {
    const seenIds: string[] = [];
    const env = makeEnv({
      LSP_SESSION: {
        idFromName: (name: string) => {
          seenIds.push(name);
          return { name, toString: () => name };
        },
        get: () => ({
          fetch: async (req: Request) =>
            req.headers.get('Upgrade') === 'websocket' ? makeFakeUpgradeResponse() : new Response(null, { status: 200 })
        })
      } as unknown as Env['LSP_SESSION']
    });

    const token1 = await signSessionToken(SIGNING_KEY, {
      v: 1,
      workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA',
      issuedAt: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
      origin: 'https://www.daikonic.dev',
      nonce: 'nonce-connection-one'
    });
    const token2 = await signSessionToken(SIGNING_KEY, {
      v: 1,
      workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA', // same workspace
      issuedAt: Date.now(),
      exp: Date.now() + 24 * 60 * 60 * 1000,
      origin: 'https://www.daikonic.dev',
      nonce: 'nonce-connection-two' // different connection
    });

    await worker.fetch(makeWsUpgradeReq(token1), env);
    await worker.fetch(makeWsUpgradeReq(token2), env);

    expect(seenIds).toHaveLength(2);
    expect(seenIds[0]).not.toBe(seenIds[1]);
    expect(seenIds[0]).toContain('nonce-connection-one');
    expect(seenIds[1]).toContain('nonce-connection-two');
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @rune-langium/lsp-worker test -- upgrade`
Expected: FAIL — both calls currently produce the same `idFromName` argument (`workspaceId` alone).

- [ ] **Step 3: Change the keying in `handleWsUpgrade`**

In `apps/lsp-worker/src/index.ts`, replace:

```ts
  // Forward to the per-workspace DO. Identity = `<sessionToken>:<workspaceId>`
  // per data-model §1; using just workspaceId for now keeps multi-tab on
  // the same DO (simpler), and the existing studio multi-tab broadcast
  // arbitrates within. Token is presented downstream as-is.
  const id = env.LSP_SESSION.idFromName(verified.token.workspaceId);
```

with:

```ts
  // Per-connection DO identity (spec 2026-05-13-lsp-server-feature-parity §7,
  // decided 2026-08-08): each session-token mint carries a fresh `nonce`
  // (apps/studio/src/services/transport-provider.ts mints one per connect()/
  // reconnect() call), so combining it with workspaceId gives every tab/
  // reconnect its own DO instance and Langium server — @lspeasy/server's own
  // docs say never to share one LSPServer across multiple transports.
  const id = env.LSP_SESSION.idFromName(`${verified.token.workspaceId}:${verified.token.nonce}`);
```

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `pnpm --filter @rune-langium/lsp-worker test -- upgrade`
Expected: PASS. Also re-check the pre-existing `'101 Switching Protocols on valid token + valid origin'` and `'409 nonce_replay...'` tests still pass unmodified — they don't assert on the exact DO id, only on response status codes.

- [ ] **Step 5: Run the full lsp-worker suite + type-check**

Run: `pnpm --filter @rune-langium/lsp-worker test && pnpm --filter @rune-langium/lsp-worker run type-check`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add apps/lsp-worker/src/index.ts apps/lsp-worker/test/upgrade.test.ts
git commit -m "fix(lsp-worker): key the DO per connection, not per workspaceId

Reuses the session token's existing nonce (already unique per mint) —
zero studio-side changes needed. Fixes the multi-tab fan-out risk from
spec §7: N tabs on one workspace no longer share one DO/one LSPServer,
which @lspeasy/server's own docs say never to do."
```

---

### Task 5: Storage-mirror redesign — derive from Langium's own text, fix didClose cleanup

**Files:**
- Create: `packages/lsp-server/src/document-update-handler.ts`
- Modify: `packages/lsp-server/src/rune-dsl-server.ts`
- Modify: `packages/lsp-server/src/index.ts`
- Modify: `apps/lsp-worker/src/session.ts`
- Test: `packages/lsp-server/test/document-update-handler.test.ts` (new)
- Test: `apps/lsp-worker/test/session-lsp.test.ts` (extend)

**Interfaces:**
- Consumes: `DocumentBuilder.onUpdate(callback: (changed: URI[], deleted: URI[]) => void): Disposable` and `LangiumDocuments.getDocument(uri: URI): LangiumDocument | undefined` (`langium/lib/workspace/document-builder.d.ts:78`, `documents.d.ts:204` — both core Langium APIs, confirmed against the installed `langium@4.3.1` types). `LangiumDocument.textDocument.getText()` for reading current full text.
- Produces: `RuneDocumentUpdateHandler` exported from `@rune-langium/lsp-server` (for the new test file to reference its type); `RuneLspServer.shared.workspace.DocumentBuilder` is now the single source `session.ts` reads from for storage snapshots — no other task depends on new exports beyond this.

**Two real bugs found during this plan's research, both fixed here:**

1. **The spec's suggested design ("flush storage at `webSocketClose`/`shutdown`") does not survive hibernation.** `webSocketClose` never fires on a hibernation-driven eviction — CF's Hibernation API resets the DO's JS heap transparently between messages; there is no "about to be evicted" hook. Any edits made between the last flush and an eviction would be lost, which is *worse* than the current per-message mirror (even though the current one has the incremental-corruption bug). The fix implemented here instead hooks `DocumentBuilder.onUpdate`, which fires synchronously whenever Langium's own build pipeline finishes processing a real content change — this is hibernation-safe (fires on every real edit, not just at close) and reads Langium's authoritative post-apply text, sidestepping the incremental-delta-mirroring bug entirely rather than working around it.

2. **Langium's `DefaultDocumentUpdateHandler` does not implement `didCloseDocument` in this version** (confirmed: no such method exists on the class in `langium@4.3.1`'s `document-update-handler.js`). Closing a document in the client currently does **nothing** to Langium's workspace index — the document stays indexed, and memory-resident, for the life of the server. This is a real, previously-undiscovered gap that undermines half of Task 6's point (scoping studio sync to the active file only prevents the *initial* whole-corpus dump, but without this fix, navigating between files would still leak the old ones into the index forever). `RuneDocumentUpdateHandler` overrides `didCloseDocument` to call `LangiumDocuments.deleteDocument(uri)` + fire a proper rebuild, fixing this for every consumer of `createRuneLspServer()`, not just the DO.

- [ ] **Step 1: Write the failing test for `RuneDocumentUpdateHandler`**

Create `packages/lsp-server/test/document-update-handler.test.ts`:

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { URI } from 'langium';
import { createRuneLspServer } from '../src/rune-dsl-server.js';

describe('RuneDocumentUpdateHandler', () => {
  it('removes a closed document from the workspace index', async () => {
    const lsp = createRuneLspServer();
    const uri = URI.parse('file:///a.rosetta');

    await lsp.shared.workspace.DocumentBuilder.update(
      [],
      [] // no-op update to ensure the workspace is settled before we start
    );

    // Simulate an open + a build, matching what a real didOpen produces.
    // createDocument's synchronous overload registers the document with
    // LangiumDocuments and returns the parsed LangiumDocument immediately.
    lsp.shared.workspace.LangiumDocuments.createDocument(uri, 'namespace a');
    await lsp.shared.workspace.DocumentBuilder.update([uri], []);
    expect(lsp.shared.workspace.LangiumDocuments.getDocument(uri)).toBeDefined();

    // Fire the same event Langium's TextDocuments emits on a real
    // textDocument/didClose — this is what RuneDocumentUpdateHandler hooks.
    const handler = lsp.shared.lsp.DocumentUpdateHandler as unknown as {
      didCloseDocument?(event: { document: { uri: string } }): void;
    };
    handler.didCloseDocument?.({ document: { uri: uri.toString() } });

    expect(lsp.shared.workspace.LangiumDocuments.getDocument(uri)).toBeUndefined();
  });
});
```

`createDocument(uri, text)` (synchronous overload), `getDocument(uri)`, and `deleteDocument(uri)` are all confirmed present on `LangiumDocuments` in the installed `langium@4.3.1` types (`node_modules/.pnpm/langium@4.3.1/node_modules/langium/lib/workspace/documents.d.ts:204,214,221,251`).

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @rune-langium/lsp-server test -- document-update-handler`
Expected: FAIL — `createRuneLspServer()` doesn't override `DocumentUpdateHandler` yet, so `didCloseDocument` is `undefined` on the default handler and the optional call is a no-op; the document stays indexed.

- [ ] **Step 3: Create `packages/lsp-server/src/document-update-handler.ts`**

```ts
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Extends Langium's default document-update handling to actually remove a
 * closed document from the workspace index.
 *
 * @remarks
 * `DefaultDocumentUpdateHandler` (langium/lsp) does not implement
 * `didCloseDocument` — closing a document in the client only clears it from
 * `TextDocuments`' own tracked map (vscode-languageserver's plain text
 * buffer), never from `LangiumDocuments`' workspace index (the cross-file
 * scoping/reference store). Left unfixed, every file a client ever opens —
 * even briefly — stays indexed, and memory-resident, for the life of the
 * server. This override deletes the closed document from the index and
 * fires a proper rebuild pass so anything that referenced it re-resolves
 * correctly instead of holding a stale reference.
 */

import { DefaultDocumentUpdateHandler } from 'langium/lsp';
import type { LangiumSharedServices } from 'langium/lsp';
import type { TextDocumentChangeEvent } from 'vscode-languageserver';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { URI, type LangiumDocuments } from 'langium';

export class RuneDocumentUpdateHandler extends DefaultDocumentUpdateHandler {
  protected readonly langiumDocuments: LangiumDocuments;

  constructor(services: LangiumSharedServices) {
    super(services);
    this.langiumDocuments = services.workspace.LangiumDocuments;
  }

  override didCloseDocument(event: TextDocumentChangeEvent<TextDocument>): void {
    const uri = URI.parse(event.document.uri);
    this.langiumDocuments.deleteDocument(uri);
    // protected on the base class — accessible from this subclass.
    this.fireDocumentUpdate([], [uri]);
  }
}
```

- [ ] **Step 4: Wire it into `createRuneLspServer()`**

In `packages/lsp-server/src/rune-dsl-server.ts`, add the import:

```ts
import { RuneDocumentUpdateHandler } from './document-update-handler.js';
```

And change the `shared` construction (currently `inject(createDefaultSharedModule({ ...EmptyFileSystem, connection }), RuneDslGeneratedSharedModule)`) to layer in the override module last, so it wins:

```ts
  const shared = inject(
    createDefaultSharedModule({ ...EmptyFileSystem, connection }),
    RuneDslGeneratedSharedModule,
    { lsp: { DocumentUpdateHandler: (services: LangiumSharedServices) => new RuneDocumentUpdateHandler(services) } }
  );
```

(`inject()` composes modules left-to-right with later modules overriding earlier bindings — standard Langium DI pattern; confirm this ordering against another multi-module `inject()` call elsewhere in `packages/core` if unsure.)

- [ ] **Step 5: Export the new type from `packages/lsp-server/src/index.ts`**

```ts
// Custom document-update handling — evicts closed documents from the
// workspace index (Langium's default doesn't). Exported so consumers
// (tests, the DO) can reference its type.
export { RuneDocumentUpdateHandler } from './document-update-handler.js';
```

- [ ] **Step 6: Run the test again to confirm it passes**

Run: `pnpm --filter @rune-langium/lsp-server test -- document-update-handler`
Expected: PASS.

- [ ] **Step 7: Run the full lsp-server suite + type-check**

Run: `pnpm --filter @rune-langium/lsp-server test && pnpm --filter @rune-langium/lsp-server run type-check`
Expected: both green — existing hover/diagnostics/foldingRange tests in `packages/lsp-server/test/lsp-server.test.ts` should be unaffected (they don't exercise didClose).

- [ ] **Step 8: Commit the `packages/lsp-server` half**

```bash
git add packages/lsp-server/src/document-update-handler.ts packages/lsp-server/src/rune-dsl-server.ts packages/lsp-server/src/index.ts packages/lsp-server/test/document-update-handler.test.ts
git commit -m "fix(lsp-server): evict closed documents from the workspace index

Langium's DefaultDocumentUpdateHandler doesn't implement didCloseDocument in
this version — closing a document never removed it from LangiumDocuments'
workspace index, only from TextDocuments' own text buffer. Fixes every
consumer of createRuneLspServer(), not just the DO."
```

- [ ] **Step 9: Write the failing test for the DO-side storage mirror**

Append to `apps/lsp-worker/test/session-lsp.test.ts`:

```ts
  it('persists the current full document text on every real content change, and removes it on close', async () => {
    const backing = new Map<string, unknown>();
    const state = makeState(backing);
    const session = new RuneLspSession(state);
    const ws = makeFakeWs();

    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } })
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
      JSON.stringify({ jsonrpc: '2.0', method: 'textDocument/didClose', params: { textDocument: { uri: 'file:///b.rosetta' } } })
    );

    await vi.waitFor(() => expect(backing.has('docs:file:///b.rosetta')).toBe(false));
  });
```

This is the T3.7 write/replay-seam fixture the spec calls for (`feedback_per_task_review_misses_inverse_pairs` memory) — it drives a real incremental delta through the write half (this test) and Task 3's replay test drives the read half; between the two, the seam is exercised, not just each half in isolation.

- [ ] **Step 10: Run it to confirm it fails**

Run: `pnpm --filter @rune-langium/lsp-worker test -- session-lsp`
Expected: FAIL — `session.ts` doesn't write to `docs:*` storage at all yet after Task 2's rewrite (that logic was deleted, not yet replaced).

- [ ] **Step 11: Register the storage-mirror listener in `ensureLangium()`**

```ts
  private async ensureLangium(ws: WebSocket): Promise<boolean> {
    if (this.langium && this.transport) return true;
    if (this.langiumLoadError) return false;
    try {
      this.langium = createRuneLspServer();
      this.transport = new DurableObjectWebSocketTransport(ws as unknown as { readyState: number; send(data: string): void; close?(code?: number, reason?: string): void });
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
   * entirely (see task rationale) and stays hibernation-safe (fires on
   * every real content change, not just at close/shutdown).
   */
  private registerStorageMirror(): void {
    if (!this.langium) return;
    this.langium.shared.workspace.DocumentBuilder.onUpdate((changed, deleted) => {
      void this.state.blockConcurrencyWhile(async () => {
        for (const uri of changed) {
          const doc = this.langium!.shared.workspace.LangiumDocuments.getDocument(uri);
          if (!doc) continue;
          await this.state.storage.put(`${DOC_PREFIX}${uri.toString()}`, doc.textDocument.getText());
        }
        for (const uri of deleted) {
          await this.state.storage.delete(`${DOC_PREFIX}${uri.toString()}`);
        }
      });
    });
  }
```

- [ ] **Step 12: Run the test again to confirm it passes**

Run: `pnpm --filter @rune-langium/lsp-worker test -- session-lsp`
Expected: PASS. If it's flaky on the `vi.waitFor` for the didChange assertion, the `DocumentBuilder`'s async build may need a longer settle window — check `document-update-handler.js`'s `fireDocumentUpdate` (awaits `workspaceManager.ready` then `workspaceLock.write(...)`) isn't being starved by fake timers if any are active in this test file's scope.

- [ ] **Step 13: Run the full lsp-worker suite + type-check**

Run: `pnpm --filter @rune-langium/lsp-worker test && pnpm --filter @rune-langium/lsp-worker run type-check`
Expected: both green.

- [ ] **Step 14: Commit the `apps/lsp-worker` half**

```bash
git add apps/lsp-worker/src/session.ts apps/lsp-worker/test/session-lsp.test.ts
git commit -m "fix(lsp-worker): derive the docs:* storage mirror from Langium's own text

Replaces the raw-delta mirroring the dead Pages-Function copy used (which
corrupts once Incremental sync is negotiated) with a DocumentBuilder.onUpdate
hook that reads Langium's authoritative post-build text. Hibernation-safe:
fires on every real edit, not just at close, unlike the spec's original
'flush at webSocketClose' suggestion (which webSocketClose never gets called
for on a hibernation eviction)."
```

---

### Task 6: Studio-side sync scoping — active editor document only

**Files:**
- Modify: `apps/studio/src/shell/providers/LspProvider.tsx`
- Test: `apps/studio/test/shell/providers/LspProvider.test.tsx` (extend if it exists, else create)

**Interfaces:**
- Consumes: `useExploreFileNavStore().activeEditorFile` (`apps/studio/src/shell/explore-file-nav-store.ts:23`) and the existing `useWorkspace().files` array.
- Produces: nothing new for later tasks.

**Design note — read this before implementing.** `apps/studio/src/shell/explore-file-nav-store.ts` tracks a single `activeEditorFile: string | undefined`, not a set of open tabs — Explore's source editor shows exactly one file at a time today (there is no multi-tab strip currently wired up, despite a comment in that file gesturing at a planned `FileTabStrip`). This means "cap sync to open editor documents" resolves to **the single active file**, not a small set. That is a real, meaningful narrowing versus today's behavior: cross-file hover/go-to-definition into any file *other than* the currently active one will not resolve, since the DO's Langium workspace won't have those documents open at all. This is the direct, expected consequence of the decision made when this spec was walked through — not a bug to work around in this task. If it proves too aggressive after rollout, the documented fast-follow is syncing the active file's direct reference closure (this repo already computes a dependency graph elsewhere — see `project_curated_manifest_per_namespace`/`buildDependencyGraph` in project memory) rather than reverting to whole-corpus sync; that is future work, not part of this plan.

- [ ] **Step 1: Write the failing test**

Find or create `apps/studio/test/shell/providers/LspProvider.test.tsx`. If a suitable rendering/mocking harness already exists in this file (mock `useWorkspace`, `useExploreFileNavStore`, and spy on `createLspClientService`'s returned `syncWorkspaceFiles`), add:

```tsx
it('syncs only the active editor document to the LSP client, not the whole workspace', async () => {
  const syncWorkspaceFiles = vi.fn();
  vi.mocked(createLspClientService).mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    syncWorkspaceFiles,
    isInitialized: () => true,
    getPlugin: () => null,
    onDiagnostics: () => () => {},
    onDisplayFile: () => () => {},
    reconnect: vi.fn(),
    disconnect: vi.fn()
  });
  vi.mocked(useWorkspace).mockReturnValue({
    files: [
      { path: 'a.rosetta', content: 'namespace a' },
      { path: 'b.rosetta', content: 'namespace b' }
    ]
  } as any);
  useExploreFileNavStore.setState({ activeEditorFile: 'a.rosetta', syncStatus: null });

  render(
    <LspProvider>
      <div />
    </LspProvider>
  );

  await waitFor(() => expect(syncWorkspaceFiles).toHaveBeenCalled());
  const lastCall = syncWorkspaceFiles.mock.calls.at(-1)![0];
  expect(lastCall).toEqual([{ path: 'a.rosetta', content: 'namespace a' }]);
});
```

Adapt the mock shapes above to whatever this test file's existing conventions are for mocking `useWorkspace`/`createLspClientService` — if this is the first test in the file, follow the mocking patterns from a sibling provider test (e.g. `apps/studio/test/shell/providers/` if other provider tests exist) rather than inventing a new one.

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @rune-langium/studio test -- LspProvider`
Expected: FAIL — the current effect passes both files.

- [ ] **Step 3: Scope the sync effect**

In `apps/studio/src/shell/providers/LspProvider.tsx`, add the import:

```ts
import { useExploreFileNavStore } from '../explore-file-nav-store.js';
```

And change the doc-set re-sync effect (currently):

```tsx
    // Doc-set re-sync when the model's files change — NOT a reconnect.
    useEffect(() => {
      lspClientRef.current?.syncWorkspaceFiles(
        files.filter((f) => !f.path.endsWith(BUNDLE_MARKER_SUFFIX) && !f.refOnly)
      );
    }, [files]);
```

to:

```tsx
    const activeEditorFile = useExploreFileNavStore((s) => s.activeEditorFile);

    // Doc-set re-sync when the active file or its content changes — NOT a
    // reconnect. Scoped to the single active editor document (not the whole
    // loaded workspace) to bound the DO's Langium index to what one tab has
    // open — see task rationale for what this trades away and why.
    useEffect(() => {
      const active = files.filter(
        (f) => f.path === activeEditorFile && !f.path.endsWith(BUNDLE_MARKER_SUFFIX) && !f.refOnly
      );
      lspClientRef.current?.syncWorkspaceFiles(active);
    }, [files, activeEditorFile]);
```

`LspClientService.syncWorkspaceFiles` (`apps/studio/src/services/lsp-client.ts:250-321`) already diffs against its own `workspaceSnapshot` and calls `client.didClose` for any URI no longer present in the passed list (lines 289-296) — so switching `activeEditorFile` from `a.rosetta` to `b.rosetta` naturally produces a `didClose` for `a.rosetta` and a `didOpen` for `b.rosetta` with no further changes needed here. That `didClose` is what now (Task 5) actually evicts `a.rosetta` from the DO's Langium index, not just from the DO's own `docs:*` storage mirror.

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `pnpm --filter @rune-langium/studio test -- LspProvider`
Expected: PASS.

- [ ] **Step 5: Run the full studio suite + type-check**

Run: `pnpm --filter @rune-langium/studio test && pnpm --filter @rune-langium/studio run type-check`
Expected: both green. Pay particular attention to any existing E2E/integration test that asserts cross-file LSP behavior (e.g. hover/go-to-def into a non-active file) — per the design note above, such a test would now correctly fail, and should be updated to reflect the new, intentionally-scoped behavior rather than being treated as a regression to revert.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/shell/providers/LspProvider.tsx apps/studio/test/shell/providers/LspProvider.test.tsx
git commit -m "fix(studio): scope LSP workspace sync to the active editor document

Mitigates the 128MB-per-isolate risk from spec §7 — syncWorkspaceFiles
previously pushed every loaded workspace file into the DO's Langium index
regardless of whether it was open. Trades away cross-file hover/go-to-def
into non-active files for V1; documented fast-follow is syncing the active
file's reference closure instead of the whole corpus."
```

---

### Task 7: DO-level integration tests — shutdown purge, hibernation-eviction sign-off pass

**Files:**
- Test: `apps/lsp-worker/test/session-lsp.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Tasks 2, 3, 5 — this task adds no new production code, only tests that weren't already written inline in those tasks' TDD steps.
- Produces: the sign-off checklist items in the spec's §9 that map to automated tests (as opposed to the manual/browser ones in Task 8).

Tasks 2, 3, and 5 already wrote and passed tests for: real-capability `initialize` (T2), cold-wake replay (T3.5's intent), and the incremental-diff write/replay seam + didClose eviction (T3.7). This task fills the remaining automatable gaps from spec §9: `shutdown` purging storage (T3.8), and an explicit unit test of the `webSocketClose` transport-clearing fix from Task 2 (T3.6, redesigned per Task 4's design note — a direct unit test of the clearing behavior itself, since the end-to-end "reconnect to the same DO instance" scenario the spec originally described is unreachable under per-connection keying).

**No `@cloudflare/vitest-pool-workers` dependency needed** — contrary to the spec's guess (§6, T3.5's note), the existing hand-rolled `DurableObjectState` fake (used throughout Tasks 2/3/5's tests, and already the established pattern in `upgrade.test.ts`/`session.test.ts`/`apps/telemetry-worker/test/ingest.test.ts`) is sufficient, including for hibernation-eviction simulation (construct a second `RuneLspSession` sharing the same storage `Map` — see Task 3, Step 1). Do not add the dependency or touch `apps/lsp-worker/vitest.config.ts`.

- [ ] **Step 1: Write the failing test for shutdown purge**

Append to `apps/lsp-worker/test/session-lsp.test.ts`:

```ts
  it('purges all docs:* storage on a real shutdown request', async () => {
    const backing = new Map<string, unknown>();
    const state = makeState(backing);
    const session = new RuneLspSession(state);
    const ws = makeFakeWs();

    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } })
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
```

Add a small local constant near the top of the test file (matching the private one in `session.ts`, since the test needs it to assert on storage keys without importing a private symbol):

```ts
const INIT_PARAMS_KEY_FOR_TEST = 'meta:initializeParams';
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter @rune-langium/lsp-worker test -- session-lsp`
Expected: FAIL — nothing in the current `session.ts` handles `shutdown` specially; it flows through to `@lspeasy/server`/Langium's own shutdown handling (which correctly transitions server state but has no knowledge of `state.storage`), so `docs:*` keys are never purged.

- [ ] **Step 3: Add a shutdown hook to `webSocketMessage`**

Langium's `startLanguageServer` registers its own `shutdown` handler for protocol correctness (state transitions, rejecting further requests), but it can't reach into DO storage. Intercept the request in the DO to purge storage as a side effect, then still forward it so the real server also answers correctly:

```ts
    if (isJsonRpcRequest(parsed) && parsed.method === 'shutdown') {
      await this.state.blockConcurrencyWhile(async () => {
        const docs = await this.state.storage.list({ prefix: DOC_PREFIX });
        const keys = Array.from(docs.keys());
        if (keys.length > 0) await this.state.storage.delete(keys);
        await this.state.storage.delete(INIT_PARAMS_KEY);
        await this.state.storage.delete(META_KEY);
      });
    }
```

Place this check in `webSocketMessage` right after the existing `initialize`-params-persist check (Task 2, Step 3), before `this.transport!.receive(text)`. This restores the purge behavior the *current live stub* already has (its own `handleShutdown`, deleted in Task 2's rewrite) — Task 2's commit message note that this "moves to Task 5" was imprecise; it actually lands here in Task 7 since it needed the shutdown-request interception point, not the storage-mirror redesign. Both are true: the purge depends on Task 2's dispatch-interception pattern and conceptually belongs beside Task 5's storage work, but this is where it's implemented.

- [ ] **Step 4: Run the test again to confirm it passes**

Run: `pnpm --filter @rune-langium/lsp-worker test -- session-lsp`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `webSocketClose` clearing the transport**

```ts
  it('clears the transport on webSocketClose so it is never reused after close', async () => {
    const state = makeState();
    const session = new RuneLspSession(state);
    const ws = makeFakeWs();

    await session.webSocketMessage(
      ws as unknown as WebSocket,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { capabilities: {} } })
    );
    await vi.waitFor(() => expect(ws.sent.some((m: any) => m.id === 1)).toBe(true));

    await session.webSocketClose(ws as unknown as WebSocket, 1000, 'normal', true);

    // Internal field — cast to access it for this white-box assertion.
    expect((session as unknown as { transport: unknown }).transport).toBeNull();
  });
```

- [ ] **Step 6: Run it — this one should already pass**

Run: `pnpm --filter @rune-langium/lsp-worker test -- session-lsp`
Expected: PASS immediately — Task 2, Step 3 already implemented `this.transport = null` in `webSocketClose`. This step exists to lock the behavior in with a regression test, not to drive new implementation.

- [ ] **Step 7: Run the full lsp-worker suite + type-check**

Run: `pnpm --filter @rune-langium/lsp-worker test && pnpm --filter @rune-langium/lsp-worker run type-check`
Expected: both green.

- [ ] **Step 8: Commit**

```bash
git add apps/lsp-worker/src/session.ts apps/lsp-worker/test/session-lsp.test.ts
git commit -m "fix(lsp-worker): purge docs:* storage on shutdown; lock in transport-clear regression test

Restores the storage-purge behavior the pre-rewrite stub had (contracts/
lsp-worker.md's stated privacy invariant), now implemented at the dispatch-
interception point introduced in Task 2. No @cloudflare/vitest-pool-workers
dependency was needed for the hibernation-eviction tests already added in
Tasks 3/5 — the existing hand-rolled DurableObjectState fake, doubled to
simulate eviction via a shared storage Map, was sufficient."
```

---

### Task 8: Manual verification + production rollout

**Files:** none modified — this task is verification and deployment steps only.

**Interfaces:** N/A.

The spec's §6 Phase 3 T3.1-T3.4 (diagnostics squiggles, hover tooltip, completion, go-to-definition against a real running studio + `wrangler dev`) are manual/browser checks, not unit tests — they verify the end-to-end wire behavior this plan's unit tests can't reach (real CodeMirror rendering, real WebSocket framing over an actual network stack). Do these after Tasks 1-7 are all merged, before deploying to production.

- [ ] **Step 1: Local `wrangler dev` smoke test**

```bash
cd apps/lsp-worker && pnpm dev
```

In a second terminal, run the studio dev server pointed at the local LSP worker (check `apps/studio/.env.local` or equivalent for how `VITE_LSP_WS_URL`/session endpoint overrides are configured; use the local `wrangler dev` port, `8790` per `apps/lsp-worker/wrangler.toml`'s `[dev]` block).

- [ ] **Step 2: Manual check — diagnostics**

Open a `.rosetta` file with a deliberate syntax error in the studio Source pane. Expected: a red squiggle appears under the error within a couple seconds, and the connection badge shows a state consistent with a working connection (not "Language services unavailable").

- [ ] **Step 3: Manual check — hover**

Hover over a `Quantity` (or any resolvable) type reference. Expected: a tooltip with the resolved type signature appears.

- [ ] **Step 4: Manual check — completion**

Type `.` after a variable of a known `Data`/`Choice` type. Expected: a completion list with valid attribute names appears.

- [ ] **Step 5: Manual check — go-to-definition**

Cmd/Ctrl-click (or the studio's equivalent trigger) a cross-file type reference. Expected: per Task 6's design note, this only resolves if the target file is the currently active editor document — if it's a genuinely different, non-active file, expect this to correctly NOT resolve today; that's the intended trade-off, not a bug to chase down here.

- [ ] **Step 6: Manual check — hibernation, for real**

With the studio connected and a document open, leave it idle for several minutes (CF's real hibernation idle window; the spec cites 70-140s as Cloudflare's documented range for even non-hibernatable DOs, hibernating ones sooner). Then type again. Expected: diagnostics/hover keep working after the pause — this is the scenario Task 3 fixed; confirm it holds under a REAL Cloudflare hibernation cycle, not just the simulated one in the unit tests.

- [ ] **Step 7: Confirm deployment ownership before deploying**

`apps/lsp-worker` (the `rune-lsp-worker` Worker) deploys via its own `wrangler deploy`, **not** the studio's Pages git-integration deploy (`reference_cloudflare_pages_deploy_mechanism` memory) — merging this plan's branch to `master` will NOT automatically ship it. Also confirm `specs/014-studio-prod-ready/tasks.md`'s T043 (`SESSION_SIGNING_KEY` secret) is actually set in production — the live `/api/lsp/health` returning `200 {"ok":true}` today is suggestive but not proof; check via `wrangler secret list` against the `rune-lsp-worker` deployment, not just the tasks.md checklist (which still shows T043 as open).

- [ ] **Step 8: Deploy**

```bash
cd apps/lsp-worker && pnpm deploy
```

- [ ] **Step 9: Smoke test on the production preview URL**

Repeat Steps 2-5 against `https://www.daikonic.dev/rune-studio/studio/` directly (not local `wrangler dev`).

- [ ] **Step 10: Update the studio's LspConnectionBadge tooltip copy**

Per spec §9's checklist — the badge should now say something like "Connected — diagnostics, hover, completion, definition" rather than whatever pre-this-plan copy exists (check `apps/studio/src/components/LspConnectionBadge.tsx` or equivalent for the exact current string before writing the replacement). This is a small, standalone follow-up commit — write and land it after the deploy is confirmed working, not before, since the copy should describe what's actually true in production.

- [ ] **Step 11: Update the spec's own status**

Edit `docs/superpowers/specs/2026-05-13-lsp-server-feature-parity-design.md`'s `**Status:**` line to record that this plan shipped, and check off every remaining `- [ ]` item in §6 and §9 that this plan's tasks satisfied (the spec is the durable record of what "V1 done" means for this feature — leave the ones this plan explicitly deferred, like the cross-file-reference-closure fast-follow, unchecked with a pointer to where that's tracked next).
