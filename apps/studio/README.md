# @rune-langium/studio

Web-based visual editor for Rune DSL models with integrated LSP support.

## Features

- **ReactFlow Graph** — Interactive DAG visualization of Rune DSL types, enums, and choice types
- **CodeMirror 6 Editor** — Full-featured source editor with Rune DSL syntax highlighting
- **LSP Integration** — Real-time diagnostics, hover information, code completion, and go-to-definition
- **Dual Transport** — WebSocket to a local `rune-lsp-server` for development, or to the production `rune-lsp-worker` (Cloudflare Worker + Durable Object hosting langium server-side)
- **Diagnostics Bridge** — LSP errors appear as inline editor underlines _and_ as badges on graph nodes
- **Multi-file Support** — Tab bar for switching between `.rosetta` files with per-file LSP document lifecycle
- **Workspaces** — IDE-style dockable panels with persistent layouts. Three workspace kinds:
  - *Browser-only* — files live in OPFS only; no roundtrips
  - *Folder-backed* — files mirrored to a local directory via the File System Access API
  - *GitHub-backed* — full clone/push/pull against any GitHub repo via Device-Flow auth (no tokens leave the browser)
- **Curated model mirror** — CDM / FpML / rune-dsl archives served from R2 via `www.daikonic.dev/curated/*` (refreshed nightly), so first-load is fast and offline-friendly
- **Anonymous telemetry (opt-out)** — closed-schema events power the SC-009 success-rate gate. No PII, no IPs, no file paths. Toggle in Settings.

## Architecture

```text
App (LSP client lifecycle)
├── ConnectionStatus (pill indicator)
├── EditorPage
│   ├── SourceEditor (CodeMirror 6 + LSP)
│   │   ├── Tab bar (file tabs)
│   │   └── EditorView per tab
│   ├── RuneTypeGraph (visual editor)
│   │   └── Node error badges (from diagnostics-store)
│   └── DiagnosticsPanel (error/warning list)
```

### Transport

The studio connects to a langium server over WebSocket. Two hosts:

| Mode | Host | When |
|---|---|---|
| **Dev** | `ws://localhost:3001` (`rune-lsp-server` running locally) | `pnpm dev` workflows |
| **Prod** | `wss://www.daikonic.dev/rune-studio/api/lsp/ws/<sessionToken>` (`rune-lsp-worker` Cloudflare Worker + `RuneLspSession` Durable Object) | deployed Studio |

The host URL is sourced from `config.lspWsUrl`, which reads
`VITE_LSP_WS_URL` (overridable per build per FR-021). On a connection
failure or 5xx during session-token mint, the studio drops to a
"language services unavailable" status — read-only editing continues,
no localhost host:port leaks into production copy (FR-014, SC-006).

The earlier "embedded SharedWorker fallback" path is **not shipped** —
running langium in a browser worker would require shimming
`node:events` / `node:crypto`, which `nodejs_compat` already resolves
in the CF isolate. See `specs/014-studio-prod-ready/research.md` R1
for the architecture decision.

### Data Flow

```text
User types in editor
    → CodeMirror (textDocument/didChange) → @codemirror/lsp-client
    → Transport (WS or Worker) → rune-lsp-server (Langium)
    → Langium validates → textDocument/publishDiagnostics
    → @codemirror/lsp-client → editor underlines
    → diagnostics-bridge → diagnostics-store → graph node badges
```

## Development

```bash
# From monorepo root
pnpm install

# Start dev server
pnpm --filter @rune-langium/studio dev

# Run tests (94 tests across 13 files)
pnpm --filter @rune-langium/studio test

# Type-check
pnpm --filter @rune-langium/studio run type-check
```

### With external LSP server

For full LSP features via WebSocket:

```bash
# Terminal 1: Start the LSP server
pnpm --filter @rune-langium/lsp-server start

# Terminal 2: Start the studio
pnpm --filter @rune-langium/studio dev
```

The studio will connect to `ws://localhost:3001` automatically. If no server is running, the editor remains usable for syntax-highlighted editing but live diagnostics, hover, and autocomplete go offline. Set `VITE_LSP_WS_URL` to point at a remote dev LSP host instead.

### Environment Variables

Studio loads its build-time configuration from `import.meta.env` and validates the result with Zod in `src/config.ts`; a malformed value crashes the bundle at module-init rather than degrading silently. Copy `.env.example` to `.env.local` and uncomment the fields you want to override. The deployment-facing vars are `VITE_LSP_WS_URL` (LSP host base, defaults to `ws://localhost:3001` in dev / `wss://www.daikonic.dev/rune-studio/api/lsp` in prod), `VITE_LSP_SESSION_URL` (token-mint endpoint, derived from the WS URL when unset), `VITE_ENABLE_LSP` (deployment-level switch for remote language services; defaults `true`), `VITE_TELEMETRY_ENDPOINT` (defaults to `${location.origin}/api/telemetry/v1/event`), `VITE_ENABLE_TELEMETRY` (deployment-level telemetry switch; defaults `false`), `VITE_ENABLE_GITHUB_AUTH` (deployment-level switch for the GitHub Device Flow-backed workspace flow; defaults `true`), `VITE_ENABLE_CURATED_MIRROR` (deployment-level switch for built-in curated reference models; defaults `true`), `VITE_DEV_MODE` (gates dev-only status copy; defaults to `import.meta.env.DEV`), and `VITE_LEGACY_GIT_PATH` (re-enables the legacy `cors.isomorphic-git.org` clone fallback per FR-019; production defaults `false`). See [`specs/014-studio-prod-ready/contracts/studio-config.md`](../../specs/014-studio-prod-ready/contracts/studio-config.md) for the full contract.

## Export Code

The **Export Code** toolbar button generates source code in a selected target language (Java, TypeScript, JSON Schema, Zod, Python, …) from the currently loaded Rune model. It has two deployment modes — local development and the hosted CF deploy at `www.daikonic.dev/rune-studio/studio/` — with different backends:

### Local development

Run the Java-backed codegen server alongside the studio:

```bash
# Terminal 3 (in addition to LSP + studio dev):
pnpm codegen:start   # serves http://localhost:8377
```

With this running, Export Code supports the **full** generator matrix (whatever `codegen-cli --list-languages` returns locally, including JVM-only targets like Java and CDM-specific generators). No Turnstile challenge, no rate-limit — local dev is friction-free.

### Hosted deployment (`www.daikonic.dev/rune-studio/`)

Same features, but behind a Cloudflare Worker that enforces light abuse protection:

- **CF Turnstile** — a one-off invisible challenge on the first generation per browser session. Subsequent generations in the session use an `HttpOnly` cookie and skip the widget.
- **Per-IP rate limits** — 10 generations per hour, 100 per day. Errors surface a clear "Try again in N minutes" message and point heavy users to local dev for unlimited use.
- **Transient failures** — if the container is cold or briefly unhealthy, the dialog shows a "warming up" message with auto-retry. The response time SLA is ≤5s warm / ≤15s cold.

Under the hood, Studio reads two build-time env vars:

- `VITE_CODEGEN_URL` — base URL for the codegen service. Default: `http://localhost:8377`. The CF build sets it to `/rune-studio` so Export Code calls `/rune-studio/api/generate` (same-origin, no CORS).
- `VITE_TURNSTILE_SITE_KEY` — Turnstile public site key. Defaults to Turnstile's "always-pass" dummy key for preview builds; set explicitly for the production deploy.

See [`specs/011-export-code-cf/`](../../specs/011-export-code-cf/) for the full design. The Worker + container live under [`apps/codegen-worker/`](../codegen-worker/) and [`apps/codegen-container/`](../codegen-container/).

## Workspaces & GitHub backing

Studio's start page exposes **Open a folder…**, **New blank workspace**, and **Open a GitHub repo…** entry points. The three kinds map to:

| Kind | Storage | Sync surface |
|---|---|---|
| browser-only | OPFS (Origin Private File System) | none |
| folder-backed | OPFS mirrored to a chosen local directory via FSA | manual save / load handle |
| git-backed | OPFS + isomorphic-git over OPFS | clone / fetch / push / status |

Auth for git-backed uses **GitHub Device Flow** mediated by `apps/github-auth-worker`. Tokens never reach the Worker — the user enters the code in their browser, GitHub returns the token to the Studio page directly, and Studio stores it in the workspace's OPFS data at `<workspace-id>/.studio/token`. The Worker only brokers the Device Flow handshake (`device_code`) and token polling; it does not receive or persist the resulting access token.

State on disk:
- File contents → OPFS
- GitHub access token for git-backed workspaces → OPFS (`<workspace-id>/.studio/token`)
- Workspace metadata, tabs, recent list, settings → IndexedDB
- Serialised FSA folder handles → IndexedDB (`handles` store)

`pnpm dev` works without any of the new Workers; it routes telemetry/curated calls back to the dev origin (no-op or bundled fixtures).

## Telemetry (FR-T01–T05)

Studio emits closed-schema events (see `specs/012-studio-workspace-ux/contracts/telemetry-event.md`) to `apps/telemetry-worker`. Privacy invariants enforced both in the client and the server:

- No file paths, names, or contents can ever appear in a body — the schema is `.strict()` enums + bounded strings.
- The server hashes `cf-connecting-ip` with a daily-rotating in-memory salt; raw IPs never log, never persist.
- Studio's `services/telemetry.ts` no-ops on `localhost` and when the user has set `telemetry-enabled=false` in Settings.
- A single `429` response from the server drops the event silently — telemetry never blocks the user.

Settings → **Diagnostics** has a single toggle. Builds also expose `VITE_ENABLE_TELEMETRY` so production can be hard-disabled until the telemetry worker is actually deployed.

## Key Files

| File | Purpose |
|------|---------|
| `src/components/SourceEditor.tsx` | CodeMirror 6 editor with multi-tab support |
| `src/components/DiagnosticsPanel.tsx` | Error/warning list with click-to-navigate |
| `src/components/ConnectionStatus.tsx` | Transport status indicator |
| `src/services/lsp-client.ts` | LSPClient lifecycle management |
| `src/services/transport-provider.ts` | WebSocket + Worker failover logic |
| `src/services/ws-transport.ts` | WebSocket → CM Transport adapter |
| `src/services/worker-transport.ts` | Worker → CM Transport adapter |
| `src/services/diagnostics-bridge.ts` | LSP diagnostics → type name mapping |
| `src/services/semantic-diff.ts` | Structural AST comparison |
| `src/workers/lsp-worker.ts` | SharedWorker/Worker entry point |
| `src/store/diagnostics-store.ts` | Zustand diagnostics state |
| `src/lang/rune-dsl.ts` | Rune DSL syntax highlighting |

## Non-Functional Requirements

| NFR | Target | Implementation |
|-----|--------|----------------|
| Diagnostics latency | < 500ms | Direct LSP pipeline, no intermediate buffering |
| LSP handshake | < 2s | 2s connection timeout to dev/prod WS host |
| Editor load | < 500ms | Lazy CodeMirror initialization per tab |
| SharedWorker memory | < 50MB | Langium ~2MB bundled, well within budget |
| Reconnection | 3 attempts with exponential backoff | Configurable via `TransportProviderOptions` |
| WebSocket security | Origin allowlist + signed session token | Token minted by `POST /api/lsp/session`; HMAC-SHA256 with daily-rotating server key; 24h expiry; per-isolate nonce ring buffer for replay protection |

## Testing

Tests use vendored Rune DSL fixtures under `.resources/` for realistic integration testing:

- `.resources/cdm/` — CDM model corpus
- `.resources/rune-dsl/` — built-in base model files
- `.resources/rune-fpml/` — FpML imported model dependencies

Refresh snapshots with:

```bash
bash scripts/update-fixtures.sh
```

```bash
# Run all studio tests
pnpm --filter @rune-langium/studio test

# Run specific test file
pnpm --filter @rune-langium/studio exec vitest run test/components/SourceEditor.test.tsx
```
