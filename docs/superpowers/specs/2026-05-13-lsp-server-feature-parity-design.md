<!-- SPDX-License-Identifier: FSL-1.1-ALv2 -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Spec: LSP server-side feature parity in the same-origin DO

**Status:** Draft (2026-05-13)
**Owner:** TBD
**Tracking:** Codex round-6 P1 review of PR #159; Task #81 in the spec-019 follow-up list.

---

## 1. Problem

Spec 019 Phase 2 retired the in-browser embedded LSP (`apps/studio/src/workers/lsp-worker.ts`) and made the same-origin `RuneLspSession` Durable Object the default LSP transport. The DO is reachable, the WebSocket handshake succeeds, and the studio's footer badge shows "Connected (Same-origin)" in green.

But `apps/studio/functions/lib/lsp-session-do.ts` (the migrated DO) is a stub:

```ts
const SERVER_CAPABILITIES = {
  textDocumentSync: { openClose: true, change: 1 /* full */ }
};
```

```ts
private async parseAndPublish(_uri: string): Promise<void> {
  // Do not publish `diagnostics: []` until this path is backed by a real
  // langium parse / validation pass. ...
  await this.ensureLangium();
}
```

Hover, completion, definition, references, code actions — **none** are advertised, none are implemented. `parseAndPublish` deliberately doesn't publish diagnostics so the client can't infer "document is clean" when the server isn't really checking.

Net user impact: the studio LSP badge is green but the editor receives no LSP-driven features at all. Pre-Phase-2, the in-browser worker provided full features via local langium services. Phase 2 made the DO the default without first building it out, regressing the user-visible feature set.

---

## 2. Goal

The DO advertises a useful capability set, handles inbound LSP traffic, publishes diagnostics, and responds to at least the canonical semantic requests (hover, completion, definition). The studio's "Connected" badge becomes a truthful signal that LSP features are available, not just that a socket is open.

**Non-goals for V1:** full LSP parity with VS Code-class servers (semantic tokens, inlay hints, rename refactors, code actions). Those are post-V1.

---

## 3. Architecture overview

The DO already imports `createRuneLspServer()` from `@rune-langium/lsp-server` (in `ensureLangium`), but never calls `.listen(transport)`. The `RuneLspServer` interface exposes:

```ts
export interface RuneLspServer {
  server: LSPServer<ServerCapabilities>;
  shared: LangiumSharedServices;
  services: LangiumServices;
  listen(transport: Transport): Promise<void>;
}
```

The `Transport` interface is from `@lspeasy/core`. Currently the only canonical impl is `WebSocketTransport(ws: WebSocket)` which assumes a Node `ws.WebSocket` or browser `WebSocket` — neither matches CF Workers' WebSocket exactly (subset of the browser API, with hibernation semantics).

### V1 design: write a `DurableObjectWebSocketTransport`

A new transport adapter in `packages/lsp-server/src/cf-durable-object-transport.ts` that satisfies `@lspeasy/core`'s `Transport` interface, backed by the DO's `webSocketMessage` / `webSocketClose` hooks:

```ts
export class DurableObjectWebSocketTransport implements Transport {
  // Inbound: webSocketMessage(ws, raw) → push a message to consumers
  // Outbound: send(payload) → ws.send(JSON.stringify(payload))
  // Close:  webSocketClose(ws, code, reason, wasClean) → notify consumers
}
```

The DO wires this once during construction, calls `lsp.listen(transport)` (lazily, on first message), and replaces its current hand-rolled `handleMessage` switch with a single `transport.receive(raw)` forward.

### Why this works with CF Hibernation

CF's Hibernation API delivers messages via `webSocketMessage(ws, message)` callback on the DO. The transport adapter holds a single buffered "next message" promise — every `webSocketMessage` call resolves it. `lsp.listen()` awaits these in a normal event-loop fashion, which CF's runtime allows because the DO lifetime survives hibernation. When the DO comes out of hibernation (next message after sleep), the transport callback fires again and the loop continues. **No long-held `await` blocks hibernation** because the awaits happen inside the JS event loop the runtime drives.

### Persistent state reconciliation

The DO currently stores `docs:*` keys in DO storage as the source of truth across hibernation. After this change:

- The langium workspace (in-memory `LangiumDocuments` index) becomes the source of truth WHILE the DO is awake.
- DO storage is a snapshot — restored to langium on first message after hibernation by replaying each stored doc as `textDocument/didOpen`.
- `webSocketClose` (or `shutdown` notification) flushes the in-memory index back to storage and clears langium.

This split mirrors the canonical LSP server pattern (workspace state in memory, restored from filesystem on startup) adapted to CF Hibernation's wake/sleep cycle.

---

## 4. Capabilities advertised in V1

Update `SERVER_CAPABILITIES`:

```ts
const SERVER_CAPABILITIES = {
  textDocumentSync: { openClose: true, change: 1 /* full */ },
  hoverProvider: true,
  completionProvider: { triggerCharacters: ['.', ' ', ':'] },
  definitionProvider: true,
  referencesProvider: true,
  // Diagnostics are push-only via publishDiagnostics — no client capability flag
  // is needed; langium publishes them automatically after document build.
};
```

Each of these is already wired in `@rune-langium/lsp-server` via the standard `startLanguageServer(shared)` call. Once `lsp.listen(transport)` runs, the providers handle requests automatically.

---

## 5. Diagnostics specifically

`startLanguageServer(shared)` registers langium's built-in diagnostic emitter that fires `textDocument/publishDiagnostics` notifications after every document build. With V1's transport hookup:

- Client sends `textDocument/didChange` → transport delivers to LSP → langium re-parses + re-validates → langium calls `connection.sendNotification('textDocument/publishDiagnostics', { uri, diagnostics })` → transport forwards over the WS → client renders red squiggles.

The DO's existing `pendingChanges` debounce becomes redundant (langium has its own debounce); drop it.

---

## 6. Implementation plan

### Phase 1: Transport adapter
- [ ] **T1.1** Add `packages/lsp-server/src/cf-durable-object-transport.ts` implementing `Transport`. ~150 LOC.
- [ ] **T1.2** Test the adapter in isolation (mock DO state + WS) — push messages in, assert they emerge to the consumer; assert outbound writes hit `ws.send`.
- [ ] **T1.3** Export from `packages/lsp-server/src/index.ts`.

### Phase 2: DO wiring
- [ ] **T2.1** In `lsp-session-do.ts`, replace the hand-rolled `handleMessage` switch with `transport.receive(raw)` after the first message arrives.
- [ ] **T2.2** Move the langium `listen()` call from a `parseAndPublish` side-effect into `ensureLangium`. Run once per DO instance.
- [ ] **T2.3** On wake-up after hibernation, replay stored `docs:*` keys as `textDocument/didOpen` messages to rehydrate the workspace.
- [ ] **T2.4** On `webSocketClose` or shutdown, dump the workspace to DO storage and call `lsp.dispose()` / discard `this.langium`.
- [ ] **T2.5** Drop the `pendingChanges` debounce; langium does this internally.
- [ ] **T2.6** Expand `SERVER_CAPABILITIES` to advertise hover/completion/definition/references.

### Phase 3: Integration tests
- [ ] **T3.1** Local `wrangler dev` test: open studio, edit a `.rune` file, assert diagnostic squiggles appear in the editor.
- [ ] **T3.2** Hover at a `Quantity` reference → assert tooltip shows the resolved type signature.
- [ ] **T3.3** Completion after typing `.` on an `Action` type → assert candidates list includes valid attribute names.
- [ ] **T3.4** Go-to-definition on a cross-file reference → assert editor jumps to the definition file/range.

### Phase 4: Production rollout
- [ ] **T4.1** Deploy with feature flag (`LSP_FEATURES_ENABLED` env var, default off) so the new behavior is gated.
- [ ] **T4.2** Smoke test on production preview URL.
- [ ] **T4.3** Flip flag to default on; remove flag in next release.

---

## 7. Risks and unknowns

| Risk | Mitigation |
|---|---|
| CF Workers runtime doesn't support `vscode-languageserver-protocol`'s event loop pattern | Verify via local `wrangler dev` first. If broken, fall back to a polling/queue-based message pump. |
| Langium's `DocumentBuilder.build()` is sync-blocking and exceeds CF's 30s CPU budget on first-build of a 100+ file workspace | Lazy-build per-document only; never invoke `workspace/didChangeWatchedFiles`. The studio sends one doc at a time. |
| DO storage `docs:*` snapshot diverges from langium's in-memory state under partial failures | Wrap `dispose-to-storage` in `state.blockConcurrencyWhile` so it's atomic with the close handshake. |
| Bundle size grows with full langium services in the DO (already ~1.8 MB) | Already deployed today as a stub; the LSP wiring adds < 200 KB. Workers Paid 10 MB limit still has headroom. |
| Hibernation + outstanding LSP request handles → request times out | Track in-flight LSP requests; on hibernation, complete with `RequestCancelled` per LSP spec so clients re-issue on wake. |

---

## 8. Alternative: re-introduce embedded LSP as a fallback tier

Instead of building out the DO, restore `apps/studio/src/workers/lsp-worker.ts` and `worker-transport.ts` (deleted in Phase 2 Task 2.3) and make embedded the default with the DO as a fallback. This trades:

- ✅ Faster to ship (~1 day vs ~1 week)
- ✅ No CF runtime concerns
- ✅ Lower latency (no network for LSP traffic)
- ❌ Reintroduces langium to the browser bundle (~1.8 MB compressed)
- ❌ Discards spec 019's architectural goal of moving heavy compute server-side
- ❌ Won't scale to features requiring cross-tab workspace state (e.g. multi-file refactoring)

**Recommendation:** pick the DO path unless we have a hard deadline. The bundle-size argument is genuinely meaningful for a studio that already loads slowly on first visit, and spec 019's premise becomes unstable without it.

---

## 9. Sign-off checklist (V1)

- [ ] Transport adapter unit-tested in isolation
- [ ] DO integration: didOpen + didChange roundtrip publishes diagnostics
- [ ] DO integration: hover, completion, definition return results from langium
- [ ] CF preview deploy: studio editor shows red squiggles for a malformed `.rune` file
- [ ] CF preview deploy: hover tooltip appears on a `Quantity` reference
- [ ] CF production deploy via feature flag with monitoring
- [ ] LspConnectionBadge tooltip updated to reflect actual capability state ("Connected — diagnostics, hover, completion, definition")
