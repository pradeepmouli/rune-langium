# T035 Spike — langium in a Cloudflare Worker isolate

**Verdict**: `PASS`

**Date**: 2026-04-25
**Branch**: `014-studio-prod-ready` (worktree)
**Time-box**: 1 day budget, executed in well under that
**Spec hooks**: spec.md US3 (gated), FR-013–FR-015, SC-005; research.md R1 + R2

---

## Executive summary

A throwaway Cloudflare Worker (`scratch/lsp-spike/`) imports
`@rune-langium/lsp-server`, boots a langium service container per
WebSocket connection, parses a 7-line `.rosetta` source on `didOpen`,
and emits a fully-shaped `textDocument/publishDiagnostics` notification
back to a Node test client. Health probe reports `langium_loaded: true`.
No `nodejs_compat` deps fail to resolve, no `node:` import surprises,
and the WebSocket-pair upgrade path on CF Workers is fully compatible
with `@lspeasy/core`'s `WebSocketTransport` (W3C `addEventListener`
branch).

R1's hypothesis — "host langium server-side on a CF Worker + DO" — is
**de-risked**. The remaining engineering risk is now in DO hibernation
+ multi-document state, **not** in whether langium boots.

---

## Reproduction transcript (copy-paste verbatim)

```
$ cd scratch/lsp-spike
$ pnpm install
Already up to date

$ pnpm exec wrangler dev --port 8788 --local &
 ⛅️ wrangler 4.85.0
⎔ Starting local server...
[wrangler:info] Ready on http://localhost:8788

$ curl -s http://localhost:8788/spike/health
{"ok":true,"langium_loaded":true,"load_error":null,"uptime_ms":8926}

$ node src/test-client.mjs ws://localhost:8788/spike/ws
[ws] open
[spike] ready — sample length=170, uri=file:///spike/sample.rosetta
[lsp] initialize result keys: [ 'capabilities' ]
[lsp] server capabilities (subset): {
  textDocumentSync: { change: 2, openClose: true, save: false, ... },
  hoverProvider: true,
  completionProvider: true,
  definitionProvider: true
}
[PASS] publishDiagnostics received
  uri: file:///spike/sample.rosetta
  count: 3
  first diagnostic shape: {
    range: { start: { character: 10, line: 4 }, end: { character: 16, line: 4 } },
    severity: 1,
    message: "Could not resolve reference to RosettaType named 'string'.",
    source: 'rune-dsl',
    code: undefined
  }
```

Worker stderr during the round-trip:

```
[wrangler:info] GET /spike/health 200 OK (2ms)
[INFO] Server listening: rune-dsl-lsp v0.1.0
[wrangler:info] GET /spike/ws 101 Switching Protocols (5ms)
[INFO] Shutting down server...
[INFO] Server shutdown complete
```

---

## Diagnostics shape (matches `LSPDiagnostic` contract)

```jsonc
{
  "uri": "file:///spike/sample.rosetta",
  "diagnostics": [
    {
      "range": {
        "start": { "line": 4, "character": 10 },
        "end":   { "line": 4, "character": 16 }
      },
      "severity": 1,                                  // Error
      "source": "rune-dsl",
      "message": "Could not resolve reference to RosettaType named 'string'.",
      "code": undefined
    }
    // …two more of the same shape (one per `string`/`date` reference)
  ]
}
```

Shape = `{range:{start:{line,character},end:{line,character}}, severity:number, message:string, source:string, code?:string|number}`. This is the wire-shape Studio's `LSPDiagnostic` type already consumes — no client-side adapter needed.

> Aside on the three "Could not resolve" diagnostics: the spike's inline sample omits the cdm-tiny `types.rosetta` import that defines built-ins, so `string`/`date` legitimately don't resolve. That is **the parser doing its job**, not a spike failure — it's exactly what we wanted to prove (langium parsed, ran reference resolution, and reported). The full cdm-tiny fixture parses cleanly when both files are loaded; that test is not in scope for this spike.

---

## Non-blocking observations

| Aspect | Measurement | Note |
|---|---|---|
| Cold-start (isolate boot + module eval) | ~8s on first health hit (M-series Mac, `wrangler dev --local`) | Dominated by `langium` + `@lspeasy/server` import graph eval; production cold-start in CF will likely be <2s once minified + cached. |
| Per-request WS upgrade overhead | 5ms | Includes `createRuneLspServer()` allocation + `accept()`. |
| Time from `didOpen` → `publishDiagnostics` | sub-second (no measurable delay in transcript) | First parse of a 170-byte source. CDM-tiny full parse will dominate; revisit in T040. |
| `dispatchEvent(new Event('open'))` workaround | Required | CF's accepted server-side WebSocket is open-on-accept and never fires `'open'`. `WebSocketTransport`'s `connected` flag stays `false` until we manually fire it. **Fold this into `apps/lsp-worker` (T036)** — it's a one-liner, but missing it would manifest as "messages silently dropped." |
| `nodejs_compat` flag | Required (`compatibility_flags = ["nodejs_compat"]`) | Without it, `Buffer` (used by `@lspeasy/core`'s `parseIncomingMessage` for binary frames) is undefined. Even though we send strings, the transport probes `typeof Buffer`. |
| `@lspeasy/core` node-only path | Avoided automatically | The `getNativeWebSocketCtor()` branch wins because `globalThis.WebSocket` is defined in CF Workers. The `createRequire('ws')` fallback is never hit. |
| Memory at idle post-shutdown | not measured (workerd) | Defer to live-deploy probe in T044+. |
| Bundle size (wrangler dev unminified) | not surfaced by `wrangler dev` | Run `wrangler deploy --dry-run --outdir=dist` in T036 to confirm <1MB compressed. |

---

## Concrete next steps (which T036–T045 are unblocked)

The PASS unblocks the entire CF-hosted-LSP path. Recommended order:

1. **T036** — Scaffold `apps/lsp-worker/` (mirror `apps/curated-mirror-worker/wrangler.toml`). Drop in the spike's `dispatchEvent('open')` workaround verbatim.
2. **T037** — `RuneLspSession` Durable Object. Move the `createRuneLspServer()` allocation out of the request handler into the DO so language state survives WS hibernation.
3. **T038** — Token mint + verify (`POST /api/lsp/session`). Spike doesn't exercise this; it's pure CF API surface, low risk.
4. **T039** — Hibernation via `acceptWebSocket()` instead of `accept()`. **The one piece the spike does NOT validate.** Hibernation requires storing per-doc state in `state.storage`, not just per-isolate JS state. Plan a half-day to wire + test.
5. **T040–T044** — Diagnostics debouncing, hover/completion routing, `transport-provider.ts` rewrite. Mechanical once T036–T039 are green.
6. **T045** — `verify-production.sh` LSP probe extension (R9 already specced).

The FAIL-path tasks (**T046–T048** — read-only Studio with documentation rewrite) are now **not needed** for this feature cycle. Park them as a contingency only if a future deploy reveals a CF-runtime regression.

---

## Caveats / what the spike does NOT prove

- DO hibernation lifecycle (langium state hydrated from `state.storage` on wake) — this is its own risk surface for T039.
- Multi-document parse correctness with cross-file references (the inline sample is single-file).
- Production CSP / WS-route precedence on `www.daikonic.dev` (covered by T036's wrangler.toml + R3).
- CPU budget on full CDM cold parse (~30 MB of `.rosetta`). Spike was 170 bytes. Validate in T040 with the cdm-tiny fixture; if cold parse exceeds the paid plan's 30s window, revisit chunking.

---

## Files added by the spike

- `scratch/lsp-spike/package.json`
- `scratch/lsp-spike/wrangler.toml`
- `scratch/lsp-spike/tsconfig.json`
- `scratch/lsp-spike/src/index.ts` (Worker entry)
- `scratch/lsp-spike/src/test-client.mjs` (Node WS client)
- `pnpm-workspace.yaml` — added `scratch/*` to the workspace pattern so the
  spike resolves `@rune-langium/lsp-server` as a workspace dep. Revert when
  the spike is deleted.

The spike is throwaway. Once `apps/lsp-worker` is built, delete the
`scratch/lsp-spike/` directory and remove `scratch/*` from
`pnpm-workspace.yaml`.
