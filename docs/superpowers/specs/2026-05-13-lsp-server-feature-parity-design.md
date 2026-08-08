<!-- SPDX-License-Identifier: FSL-1.1-ALv2 -->
<!-- Copyright (c) 2026 Pradeep Mouli -->

# Spec: LSP server-side feature parity in the same-origin DO

**Status:** Draft (2026-05-13); revised 2026-08-08 — a production scoping review found this spec had already been partially implemented (and merged), but with several factual errors baked into the implementation, plus four defects in the merged code. See §10 for what changed in this revision and why.
**Owner:** TBD
**Tracking:** Codex round-6 P1 review of PR #159; Task #81 in the spec-019 follow-up list. **Not** tracked as "T044b" — a stray comment in the production stub misattributes this work to that ID, but `specs/014-studio-prod-ready/tasks.md:174` defines T044b as the studio `ConnectionStatus` "warming-up" state, an unrelated task.

---

## 1. Problem

Spec 019 Phase 2 retired the in-browser embedded LSP (`apps/studio/src/workers/lsp-worker.ts`) and made the same-origin `RuneLspSession` Durable Object the default LSP transport. The DO is reachable, the WebSocket handshake succeeds, and the studio's footer badge shows "Connected (Same-origin)" in green.

**Correction (2026-08-08):** this section originally described `apps/studio/functions/lib/lsp-session-do.ts` as "the migrated DO." It is not — it never has been reachable. Someone did write the wiring this spec called for (commit `ea6f1d7a`, 2026-05-13, "feat(019/#81): wire DO to real langium LSP via Transport adapter"), but it landed in that file, which is a Cloudflare **Pages Function**. Pages cannot create or host a Durable Object — it can only *bind*, via a Worker-owned namespace, to a DO class defined and deployed in a separate Worker (see `apps/studio/wrangler.toml:11-20`, which documents this constraint). The DO class Cloudflare actually instantiates in production is defined in `apps/lsp-worker/src/index.ts`/`wrangler.toml` and deployed as the standalone `rune-lsp-worker` Worker. `apps/studio/functions/lib/lsp-session-do.ts` — along with its test and the `export { RuneLspSession }` re-export at `apps/studio/functions/api/lsp/ws/[token].ts:31` that references it — is dead, unreachable code and should be **deleted**, not edited. Everything below now refers to the real production file: `apps/lsp-worker/src/session.ts`.

`apps/lsp-worker/src/session.ts` (the production DO) is a stub:

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

**Status: done.** `packages/lsp-server/src/cf-durable-object-transport.ts` already implements this and is exercised end-to-end in `packages/lsp-server/test/lsp-server.test.ts` (diagnostics, hover, documentSymbol, foldingRange all pass over a real transport pair). Phase 1 below is complete; nothing in this section needs building. It satisfies `@lspeasy/core`'s `Transport` interface, backed by the DO's `webSocketMessage` / `webSocketClose` hooks:

```ts
export class DurableObjectWebSocketTransport implements Transport {
  // Inbound: webSocketMessage(ws, raw) → push a message to consumers
  // Outbound: send(payload) → ws.send(JSON.stringify(payload))
  // Close:  webSocketClose(ws, code, reason, wasClean) → notify consumers
}
```

What's left is wiring it into `apps/lsp-worker/src/session.ts` (the real production DO — see §1's correction) instead of the dead `apps/studio/functions/lib/lsp-session-do.ts` copy: replace the current hand-rolled `handleRequest`/`handleNotification` router with `lsp.listen(transport)` plus a `transport.receive(raw)` forward, per §6.

### Why this does NOT "just work" with CF Hibernation (correction, 2026-08-08)

The original text here claimed "the DO lifetime survives hibernation" and "no long-held `await` blocks hibernation." **The first claim is false**, and it matters: Cloudflare's Hibernation API evicts the DO from memory between events. On the next `webSocketMessage`, the DO's **constructor runs again** — all in-memory state, including any live `LangiumDocuments` index, `LSPServer` state machine, and the `Transport`'s buffered-message promise, is gone. Only `state.storage` and data attached via `WebSocket.serializeAttachment` (≤16 KB) survive a hibernation cycle. Isolate memory (128 MB) is shared across all DO instances co-resident in that isolate, not per-DO — relevant to the risk in §7.

So `ensureLangium()`'s "construct once per DO instance" pattern is not a durability guarantee — it's just avoiding a redundant construct *within* one wake. Every wake pays a fresh `import()` + `createRuneLspServer()` + `startLanguageServer(shared)` cost, and needs a full replay before it can answer anything correctly (next section).

### Cold-start / wake replay (rewritten, 2026-08-08)

The original "Persistent state reconciliation" section below said "replaying each stored doc as `textDocument/didOpen`" was sufficient to rehydrate the workspace after a wake. **It is not — this is the single most important correction in this revision.** The client sent `initialize`/`initialized` once, long before the DO was ever evicted, and — per the LSP protocol — will never resend them. Skip the replay and two independent things break, both silently:

1. `@lspeasy/server`'s `handleMessage` gates every non-lifecycle **request** on `state === Initialized` (`server.js:501-508`). A freshly-reconstructed server starts in `Created`. Every hover/completion/definition request after a wake returns `ServerNotInitialized` — **forever**, since nothing ever moves the state machine out of `Created` again.
2. Langium's `DefaultDocumentUpdateHandler.fireDocumentUpdate` awaits `workspaceManager.ready` (`document-update-handler.js:46`), which only resolves once `WorkspaceManager.initialized()` fires — itself only triggered by `connection.onInitialized` (`workspace-manager.js:29-33`). Without replaying `initialized`, **no document ever builds again and no diagnostics are ever published again**, with no error surfaced anywhere.

The correct replay sequence on a cold wake, before the triggering message is forwarded, is:

1. `initialize` — using the client's **original** `initialize` params, which must be persisted (DO storage, or `WebSocket.serializeAttachment` — CodeMirror's client capabilities are well under the 16 KB cap). Use a synthetic/sentinel request id so the echoed response can be discarded; `@codemirror/lsp-client` only `console.warn`s on an unmatched response id (`index.cjs:656`), so this is hygiene, not a correctness requirement.
2. `initialized`
3. One `textDocument/didOpen` per document persisted in `state.storage`'s `docs:*` keys

...and only then is the message that actually triggered the wake forwarded to `transport.receive()`.

The rest of the split described in the original text — langium's in-memory index as the moment-to-moment source of truth, DO storage as the durable snapshot — still holds; only the "restore" step needed correcting.

**Two more defects to avoid when porting the dead copy's logic**, found during the 2026-08-08 review of `apps/studio/functions/lib/lsp-session-do.ts` (do not copy these as-is):

- `webSocketClose` must clear `this.transport` (not just call `transport.signalClose()`). The dead copy leaves it non-null; `signalClose()` latches `closed = true` permanently, and `webSocketMessage` skips re-init whenever `this.transport` is already set — so reconnecting to the same (non-evicted) DO instance after a socket close is permanently broken.
- The transport binds to whichever socket existed at construction time. `apps/lsp-worker/src/index.ts`'s `handleWsUpgrade` (`:190`) currently keys the DO by `workspaceId` alone, so a second browser tab on the same workspace shares the DO instance — its messages get answered on the *first* tab's socket. `@lspeasy/server`'s own docs explicitly say not to share one `LSPServer` instance across multiple transports/connections. See §7 for the resolution options (this needs a decision, not just a fix).

---

## 4. Capabilities advertised in V1

**Correction (2026-08-08): delete the hand-maintained `SERVER_CAPABILITIES` constant; do not expand it.** Once `lsp.listen(transport)` is wired, that constant becomes unreachable dead weight: `startLanguageServer` registers its own `connection.onInitialize` handler (`language-server.js:203-205`), and Langium computes `buildInitializeResult` from whichever providers are actually registered on the services. Keeping a second, hand-maintained capability list is exactly the drift hazard the stub's own current comment was trying to avoid by advertising nothing — it just avoided it by disabling everything instead of by deriving capabilities from one source of truth.

Note the capability delta this produces vs. the old stub, so nothing downstream assumes the old shape:

- `textDocumentSync.change` becomes `Incremental` (`2`), not `Full` (`1`) as this section originally proposed. This has a real consequence — see §3's note on the storage-mirror defect and §6's T2.5.
- Also gained "for free," with no additional code: `referencesProvider`, `documentSymbolProvider`, `foldingRangeProvider`, `renameProvider`, `semanticTokensProvider`, and more — `@rune-langium/lsp-server` already registers these; the stub's hand-list simply never advertised them.

`apps/studio/src/services/lsp-client.ts` and `transport-provider.ts` need **no changes** for this: `@codemirror/lsp-client` reads `serverCapabilities` off the `initialize` response and enables hover/completion/definition/etc. automatically (`index.cjs:588-591`, `:755`, `:858`, `:1052`, `:1559`). Server→client requests Langium may issue that the client doesn't implement (e.g. `workspace/configuration`, `client/registerCapability`) are safely answered with `MethodNotFound` (`index.cjs:684-690`) rather than hanging.

---

## 5. Diagnostics specifically

`startLanguageServer(shared)` registers langium's built-in diagnostic emitter that fires `textDocument/publishDiagnostics` notifications after every document build. With V1's transport hookup:

- Client sends `textDocument/didChange` → transport delivers to LSP → langium re-parses + re-validates → langium calls `connection.sendNotification('textDocument/publishDiagnostics', { uri, diagnostics })` → transport forwards over the WS → client renders red squiggles.

**Correction (2026-08-08): Langium has no built-in didChange debounce — the opposite of what this section originally claimed.** `didChangeContent` → `fireDocumentUpdate` → `documentBuilder.update` fires synchronously on every notification (`document-update-handler.js:53-55`); `update` relinks every affected document (`document-builder.js:103-104`). A `WorkspaceLock` serializes concurrent builds so they don't race, but nothing coalesces rapid-fire changes. Dropping the DO's existing `~200ms` debounce as originally instructed means a full document rebuild on every single keystroke, billed as DO wall-clock time. This is now an open decision (§7) rather than a safe deletion: either keep a debounce at the transport-forward layer (buffer `didChange` notifications before calling `transport.receive()`, distinct from the removed hand-rolled request/notification router) or accept per-keystroke rebuild cost and measure it.

---

## 6. Implementation plan

### Phase 1: Transport adapter — DONE

`packages/lsp-server/src/cf-durable-object-transport.ts` exists, is exported, and is covered by `packages/lsp-server/test/lsp-server.test.ts`. Nothing to do here; T1.1–T1.3 are struck.

### Phase 2: DO wiring (rewritten, 2026-08-08 — targets `apps/lsp-worker/src/session.ts`, not the dead Pages copy)

- [ ] **T2.1** Delete `apps/studio/functions/lib/lsp-session-do.ts`, `apps/studio/functions/test/lsp-session-do.test.ts`, and the `export { RuneLspSession }` re-export at `apps/studio/functions/api/lsp/ws/[token].ts:31`. Confirmed dead: Pages cannot host the DO class it references (§1).
- [ ] **T2.2** In `apps/lsp-worker/src/session.ts`, replace `handleRequest`/`handleNotification`'s hand-rolled router with a single `transport.receive(raw)` forward, mirroring the pattern already proven in the dead file (mine the logic — the *shape* of that port is right, several specifics inside it are not; see T2.3–T2.6). Move the `listen(transport)` call into `ensureLangium`, run once per DO instance-lifetime (i.e., re-runs after every wake, since the instance is new).
- [ ] **T2.3** Implement the cold-wake replay sequence from §3: persist the client's `initialize` params (storage or `serializeAttachment`), and on every fresh DO construction, replay `initialize` (sentinel request id) → `initialized` → one `didOpen` per stored `docs:*` entry, before forwarding the message that triggered the wake. This is the single highest-value task in this phase — without it, the DO passes a smoke test (fresh connect) and then silently stops working after the first idle-driven eviction.
- [ ] **T2.4** Fix transport lifecycle: clear `this.transport` in `webSocketClose` so reconnect to a non-evicted instance works. Resolve the multi-tab question from §7 (per-connection keying vs. a multiplexing transport) before or alongside this task — don't ship the current `workspaceId`-only DO keying unchanged without an explicit decision.
- [ ] **T2.5** Resolve the incremental-sync storage mirror. Once §4's capability change lands, the client sends range-scoped `didChange` deltas, not whole-document text; a hand-rolled `docs:*` mirror that does `contentChanges[0].text → storage.put` (as the dead copy does) silently corrupts the persisted snapshot on every real keystroke. Do not reimplement `TextDocument.update`'s range application in the DO — that duplicates logic `vscode-languageserver-textdocument`/Langium's own `TextDocuments` already implement correctly (this repo's DRY rule; see the `preview-validator.ts` precedent in project memory). Prefer deriving the persisted snapshot from Langium's own in-memory document text at flush time (`webSocketClose`/`shutdown`) over maintaining a second parallel copy.
- [ ] **T2.6** Restore `shutdown` (and confirm whether `exit` also needs it) → purge all `docs:*` keys for the session from storage. The dead copy dropped this; it's a stated privacy invariant in `contracts/lsp-worker.md` and `data-model.md §1`, not an optional cleanup.
- [ ] **T2.7** Delete `SERVER_CAPABILITIES` per §4; verify capabilities now come from `buildInitializeResult`.
- [ ] **T2.8** Decide and implement the didChange coalescing question from §5 (keep a debounce at the transport-forward layer, or accept per-keystroke rebuild cost after measuring it).

### Phase 3: Integration tests (expanded, 2026-08-08)

- [ ] **T3.1** Local `wrangler dev` test: open studio, edit a `.rune` file, assert diagnostic squiggles appear in the editor.
- [ ] **T3.2** Hover at a `Quantity` reference → assert tooltip shows the resolved type signature.
- [ ] **T3.3** Completion after typing `.` on an `Action` type → assert candidates list includes valid attribute names.
- [ ] **T3.4** Go-to-definition on a cross-file reference → assert editor jumps to the definition file/range.
- [ ] **T3.5 (new)** Hibernation-eviction case: `didOpen` a document, force-evict the DO (`@cloudflare/vitest-pool-workers`'s `evictDurableObject()` — not currently a repo dependency, likely needs adding to `apps/lsp-worker/vitest.config.ts`), send a `didChange`, and assert hover/diagnostics still work post-wake. This is the test that would have caught T2.3's gap; without it, the feature can look done via T3.1–T3.4 alone and still be broken in production after the DO's first idle eviction.
- [ ] **T3.6 (new)** Reconnect case: close and reopen the WebSocket without triggering DO eviction; assert the session keeps working (catches the T2.4 regression class).
- [ ] **T3.7 (new)** Incremental-diff round-trip: drive a real editor-style *range* `didChange` (not a synthetic full-text one) through the mirror-write/replay-read seam and assert the replayed document matches. Per this repo's `feedback_per_task_review_misses_inverse_pairs` memory, a write/replay pair like this needs a fixture that exercises both halves together, not each in isolation.
- [ ] **T3.8 (new)** `shutdown` purge: assert `docs:*` entries are gone from storage after a clean shutdown.

### Phase 4: Production rollout

- [ ] **T4.1 (revised)** Decide whether `LSP_FEATURES_ENABLED` gating is warranted before implementing it. This repo's `feedback_no_migration_before_live` guidance argues against backward-compat/gating ceremony for states with no real prior users — the studio isn't live-with-users yet. If a flag is skipped, say so explicitly here rather than defaulting to one out of habit.
- [ ] **T4.2** Smoke test on production preview URL.
- [ ] **T4.3** Confirm deployment ownership before rollout: `apps/lsp-worker` (the `rune-lsp-worker` Worker) deploys via a separate `wrangler deploy`, not the Pages git integration that ships the rest of the studio (`reference_cloudflare_pages_deploy_mechanism` memory). Changing `session.ts` requires that manual/CI deploy step explicitly; it will not happen as a side effect of merging to `master`. Also confirm `specs/014-studio-prod-ready/tasks.md`'s T043 (`SESSION_SIGNING_KEY` secret) is actually done — the live `/api/lsp/health` 200 suggests it is, but the checklist itself still shows it open.
- [ ] **T4.4 (if flag used)** Flip flag to default on; remove flag in next release.

---

## 7. Risks and unknowns

| Risk | Mitigation |
|---|---|
| CF Workers runtime doesn't support `vscode-languageserver-protocol`'s event loop pattern | De-risked: `/api/lsp/health` already reports `langium_loaded: true` in production today, confirming the import graph resolves under `nodejs_compat`. Verify request-handling specifically via local `wrangler dev`. |
| Langium's `DocumentBuilder.build()` is sync-blocking and exceeds CF's 30s CPU budget on first-build of a 100+ file workspace | Lazy-build per-document only; never invoke `workspace/didChangeWatchedFiles`. The studio sends one doc at a time. |
| DO storage `docs:*` snapshot diverges from langium's in-memory state under partial failures | Wrap `dispose-to-storage` in `state.blockConcurrencyWhile` so it's atomic with the close handshake. |
| Bundle size grows with full langium services in the DO (already ~1.8 MB) | Already deployed today as a stub; the LSP wiring adds < 200 KB. Workers Paid 10 MB limit still has headroom. |
| Hibernation + outstanding LSP request handles → request times out | Track in-flight LSP requests; on hibernation, complete with `RequestCancelled` per LSP spec so clients re-issue on wake. |
| **(new, 2026-08-08) 128 MB per-isolate memory ceiling vs. `syncWorkspaceFiles` pushing the whole loaded corpus into the DO's Langium index.** `LspProvider.tsx:106` pushes every loaded workspace file as a `didOpen` today. Isolate memory is shared across *all* DO instances co-resident in that isolate, not per-DO. This repo has already hit almost this exact shape once: `project_curated_503_dep_graph_no_link` records a ~238 MB closure blowing CF's un-raisable 128 MB cap in `/api/parse`. | **Open decision, not yet resolved by this spec.** Options include capping sync to open editors only, and failing gracefully (explicit degraded-LSP state) rather than crashing the isolate. Needs a decision before Phase 2 ships, and a load test at realistic corpus size. |
| **(new, 2026-08-08) Multi-tab fan-out.** `apps/lsp-worker/src/index.ts:190` keys the DO by `workspaceId` alone, so N browser tabs on one workspace share one DO instance and one `LSPServer`. `@lspeasy/server`'s own docs say never to share one `LSPServer` instance across multiple transports/connections; request ids can also collide across clients sharing a socket-bound transport. | **Open decision.** Either key the DO per-connection (simple, but N× memory and N× Langium construction per workspace — interacts with the isolate-ceiling risk above) or build a multiplexing transport with per-client id namespacing (correct, more work). Human call — see T2.4. |
| **(new, 2026-08-08) Cold-start latency on hibernation wake is unmeasured.** A full `import()` + `createRuneLspServer()` + `startLanguageServer` + N-document-build replay runs on the user's next keystroke after any wake. | Measure via `wrangler dev` at realistic workspace sizes before deciding between hibernation (current design) and `server.accept()` non-hibernating mode (§8b). |
| **(new, 2026-08-08) DO storage limits at corpus scale.** `state.storage.list({ prefix: 'docs:' })` pagination and per-value size limits are unverified against the studio's largest real `.rosetta` files. | Verify against `.resources/` corpus fixtures before rollout; add pagination if `list()` is used anywhere in the replay path. |

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

**(new, 2026-08-08) Worth a conscious re-confirmation, not an assumption:** `apps/studio/src/workers/parser-worker.ts` already runs a full in-browser Langium instance (`createRuneDslServices`) with corpus hydration for a different purpose. This alternative's rejection predates the 128 MB isolate-ceiling risk found in §7, which strengthens (not weakens) the case for keeping compute server-side — but it's worth re-confirming deliberately rather than assuming the original rationale still fully covers the new risk.

### 8b. Tuning knob, not an alternative: skip hibernation via `server.accept()` (new, 2026-08-08)

Cloudflare's Hibernation API (`state.acceptWebSocket(server)`) is what makes §7's cold-start-latency risk real — a resident, non-hibernating DO (`server.accept()` instead) keeps the Langium workspace warm for the WebSocket's lifetime, with no replay cost in the steady state. Per Cloudflare's own pricing example (100 always-on WS DOs ≈ $410/mo), a resident DO bills duration for the connection's full lifetime — but at the studio's current scale (~1 concurrent session, several hours/day) this is roughly $1–2/mo, not a meaningful cost.

This is **not a substitute** for the cold-wake replay logic in §3/T2.3: DOs are still evicted on redeploy, crash, and (per Cloudflare's docs) after 70–140s of idle time even in non-hibernatable mode. Build the replay path regardless; if measured latency (§7) is bad, flipping `acceptWebSocket` → `accept()` is a small, low-risk change that demotes replay to a rare cold path instead of a routine one.

---

## 9. Sign-off checklist (V1)

- [ ] Transport adapter unit-tested in isolation — already true today (Phase 1 is done)
- [ ] DO integration: didOpen + didChange roundtrip publishes diagnostics
- [ ] DO integration: hover, completion, definition return results from langium
- [ ] **(new)** DO integration: hover/completion/definition/diagnostics still work after a forced hibernation eviction, not just on first connect (T3.5)
- [ ] **(new)** Reconnect after a socket close/reopen (no eviction) works (T3.6)
- [ ] **(new)** `shutdown` purges `docs:*` from storage (T3.8)
- [ ] **(new)** Multi-tab scenario resolved and tested, or explicitly deferred with a documented single-tab constraint (§7, T2.4)
- [ ] CF preview deploy: studio editor shows red squiggles for a malformed `.rune` file
- [ ] CF preview deploy: hover tooltip appears on a `Quantity` reference
- [ ] CF production deploy, with the deployment-ownership check from T4.3 done first (separate `rune-lsp-worker` deploy, not the Pages git integration)
- [ ] LspConnectionBadge tooltip updated to reflect actual capability state ("Connected — diagnostics, hover, completion, definition")

---

## 10. 2026-08-08 revision notes

A scoping review (dispatched ahead of writing an implementation plan) found this spec had already been mostly acted on — commit `ea6f1d7a` (2026-05-13) implemented Phase 2's wiring — but the result landed in `apps/studio/functions/lib/lsp-session-do.ts`, a file Cloudflare Pages cannot actually serve as the live DO class (§1). It has been dead code since the day it merged, and the production DO (`apps/lsp-worker/src/session.ts`) has remained the unwired stub this spec was written to fix.

Independently of the wiring-location bug, the dead copy was built on top of two factual errors in this spec's original text — "the DO lifetime survives hibernation" (§3) and "langium has its own [didChange] debounce" (§5) — both now corrected above. The first error is the more serious one: it means the dead copy's hibernation-wake handling (replay `didOpen` only) would have shipped a server that silently and permanently stops answering non-diagnostic requests after the DO's first idle-triggered eviction, with no error surfaced anywhere. Two further defects (a latched-closed transport breaking reconnect, and a storage mirror that corrupts once incremental sync is negotiated) were also found in the dead copy and must not be ported verbatim; see §3 and §6 Phase 2 for what changed as a result.

Net effect on this spec: §1, §3, §4, §5, and Phase 2/3/4 of §6 were substantively rewritten; §7 gained four new risk rows requiring human decisions before implementation; §8 gained a tuning-knob subsection (§8b); §9's checklist gained four new items. Phase 1 (§6) and the recommendation in §8 did not change — both were already correct.
