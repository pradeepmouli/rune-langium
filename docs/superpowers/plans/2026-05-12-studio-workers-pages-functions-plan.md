# Studio Workers → Pages Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a same-origin Pages Function fallback for `parseWorkspace` and migrate the LSP server from `apps/lsp-worker/` (standalone Cloudflare Worker) to `apps/studio/functions/api/lsp/` (Pages Functions), then retire the in-browser LSP server entirely.

**Architecture:** New `POST /api/parse` Pages Function handles workspace-wide parsing server-side; the browser parse-worker gains a `hydrate` handler so subsequent `linkDocument` requests still work in-browser without re-parsing. Existing `apps/lsp-worker/` code (~1k lines: auth, session DO, log) moves bit-for-bit to `apps/studio/functions/{api/lsp/,lib/}`. After studio cutover, the in-browser LSP worker (`apps/studio/src/workers/lsp-worker.ts`) and MessagePort transport (`apps/studio/src/services/worker-transport.ts`) are deleted; `transport-provider.ts` simplifies from 3 tiers to 2.

**Tech Stack:** TypeScript 5.9 strict ESM · pnpm workspace · vitest · Langium 4.2 · React 19 · CodeMirror 6 + `@codemirror/lsp-client` · Cloudflare Pages Functions with `nodejs_compat` · Durable Objects + WebSocket Hibernation.

**Spec:** [`docs/superpowers/specs/2026-05-12-studio-workers-pages-functions-design.md`](../specs/2026-05-12-studio-workers-pages-functions-design.md)

**Execution order note:** This plan is **self-contained** and can run before or after spec 018 (`codegen-additional-targets`). Phase -1 below establishes the Pages Functions infrastructure (`apps/studio/functions/` directory, `apps/studio/wrangler.toml`, `wrangler` devDep, `dev:pages` script) that both this plan and 018 share.

- If 019 runs **first** (recommended — "optimize before adding features"): Phase -1 creates the infra. When 018 later lands, its Tasks 0.10 and 0.13 should be treated as **verify-only**: assert the files exist with the required content; do not overwrite.
- If 018 has **already** shipped: Phase -1's tasks are idempotent (each checks for existing content before creating). Engineer can skim Phase -1 to confirm and proceed to Phase 0.

---

## File Structure

### New files

| Path | Responsibility |
|------|---------------|
| `apps/studio/functions/api/parse.ts` | `POST /api/parse` — server-side `parseWorkspace` |
| `apps/studio/functions/test/parse.test.ts` | Integration tests for `/api/parse` |
| `apps/studio/functions/api/lsp/session.ts` | `POST /api/lsp/session` — session token mint (migrated) |
| `apps/studio/functions/api/lsp/health.ts` | `GET /api/lsp/health` — reachability probe (migrated) |
| `apps/studio/functions/api/lsp/ws/[token].ts` | `GET /api/lsp/ws/{token}` — WS upgrade + DO forward; re-exports `RuneLspSession` (migrated). Uses Pages Functions dynamic-route convention (`[token]` filename = path param). |
| `apps/studio/functions/lib/lsp-auth.ts` | HMAC token, origin allowlist, nonce ring, rate limit (migrated from `apps/lsp-worker/src/auth.ts`) |
| `apps/studio/functions/lib/lsp-session-do.ts` | `RuneLspSession` Durable Object class (migrated from `apps/lsp-worker/src/session.ts`) |
| `apps/studio/functions/lib/lsp-log.ts` | Pino logger (migrated from `apps/lsp-worker/src/log.ts`) |
| `apps/studio/functions/test/lsp-session.test.ts` | Migrated from `apps/lsp-worker/test/` |
| `apps/studio/functions/test/lsp-auth.test.ts` | Migrated from `apps/lsp-worker/test/` |
| `apps/studio/src/components/LspConnectionBadge.tsx` | Connection-state badge for editor footer |
| `apps/studio/test/components/LspConnectionBadge.test.tsx` | Component tests |

### Modified files

| Path | Change |
|------|--------|
| `apps/studio/src/workers/parser-worker.ts` | Add `HydrateRequest` type + `hydrate` case in message dispatch |
| `apps/studio/src/services/workspace.ts` | Add routing layer: `parseWorkspace` → `POST /api/parse` with browser fallback |
| `apps/studio/src/services/transport-provider.ts` | Drop `embedded` tier; rename `cf-worker` → `pages-function`; keep `websocket` (dev override) |
| `apps/studio/src/config.ts` | Change `lspWsUrl` / `lspSessionUrl` defaults to same-origin |
| `apps/studio/src/components/EditorFooter.tsx` (or wherever the footer lives) | Mount `<LspConnectionBadge />` |
| `apps/studio/wrangler.toml` | Add DO binding + SQLite migration for `RuneLspSession` |
| `packages/lsp-server/package.json` | Verify `Buffer` / `nodejs_compat` runtime assumptions hold under Pages Functions |

### Deleted files

| Path | Phase | Reason |
|------|-------|--------|
| `apps/studio/src/workers/lsp-worker.ts` | 2 | In-browser LSP server retired |
| `apps/studio/src/services/worker-transport.ts` | 2 | MessagePort transport — no in-browser LSP target |
| `apps/studio/test/workers/lsp-worker.test.ts` (if present) | 2 | Stale |
| `apps/studio/test/services/worker-transport.test.ts` (if present) | 2 | Stale |
| `apps/lsp-worker/` (entire package) | 3 | Standalone CF Worker deploy retired |

---

# Phase -1 — Pages Functions Infrastructure

**Outcome:** `apps/studio/functions/` directory exists. `apps/studio/wrangler.toml` declares `nodejs_compat`. `wrangler` is a devDep of studio. `pnpm --filter @rune-langium/studio dev:pages` serves the SPA + Functions on `localhost:8788`. Functions directory is empty (no route handlers yet — those come in Phase 0).

This phase is **shared with spec 018**. If 018 has already shipped, each task here is verify-only — confirm the file/content exists and skip.

## Task -1.1: Create `apps/studio/wrangler.toml`

**Files:**
- Create (or verify): `apps/studio/wrangler.toml`

- [ ] **Step 1: Check whether the file already exists**

```bash
test -f apps/studio/wrangler.toml && echo "exists" || echo "missing"
```

- [ ] **Step 2: If missing, create it**

Create `apps/studio/wrangler.toml`:

```toml
# SPDX-License-Identifier: FSL-1.1-ALv2
# Copyright (c) 2026 Pradeep Mouli
#
# Cloudflare Pages project config for the Rune Studio.
# Pages serves apps/studio/dist as static assets; functions in
# apps/studio/functions/ are deployed alongside (see spec 019 + 018).

name = "rune-studio"
compatibility_date = "2025-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "./dist"
```

- [ ] **Step 3: If it already exists, verify content**

```bash
grep -q "name = \"rune-studio\"" apps/studio/wrangler.toml && \
  grep -q "nodejs_compat" apps/studio/wrangler.toml && \
  grep -q "pages_build_output_dir" apps/studio/wrangler.toml && \
  echo "ok"
```

Expected: `ok`. If anything is missing, edit the file to add it (do not overwrite the whole file).

- [ ] **Step 4: Commit (only if file was created or modified)**

```bash
git status --short apps/studio/wrangler.toml
# If shows a change:
git add apps/studio/wrangler.toml
git commit -m "build(studio): wrangler.toml for Pages project (019 Phase -1)"
```

## Task -1.2: Create the `apps/studio/functions/` directory and empty middleware

**Files:**
- Create: `apps/studio/functions/_middleware.ts` (placeholder, empty middleware)

- [ ] **Step 1: Check whether the directory exists**

```bash
test -d apps/studio/functions && echo "exists" || echo "missing"
```

- [ ] **Step 2: If missing, create the directory and a placeholder middleware**

```bash
mkdir -p apps/studio/functions
```

Create `apps/studio/functions/_middleware.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Pages Functions middleware. Currently a no-op pass-through;
 * placeholder so the functions/ directory is non-empty and version-controlled.
 *
 * Add cross-cutting concerns (error envelopes, request logging) here as needed.
 */

export const onRequest: PagesFunction = ({ next }) => next();
```

- [ ] **Step 3: Commit**

```bash
git add apps/studio/functions/_middleware.ts
git commit -m "build(studio): scaffold functions/ directory (019 Phase -1)"
```

## Task -1.3: Add `wrangler` devDep and `dev:pages` script

**Files:**
- Modify: `apps/studio/package.json`
- Modify: `apps/studio/README.md`

- [ ] **Step 1: Check current state**

```bash
grep -q '"wrangler"' apps/studio/package.json && echo "wrangler-present" || echo "missing"
grep -q '"dev:pages"' apps/studio/package.json && echo "script-present" || echo "missing"
```

- [ ] **Step 2: Add wrangler devDep if missing**

In `apps/studio/package.json`, ensure `devDependencies` includes:

```json
"wrangler": "^4.0.0"
```

- [ ] **Step 3: Add `dev:pages` script if missing**

In `apps/studio/package.json`, ensure `scripts` includes:

```json
"dev:pages": "wrangler pages dev http://localhost:5173 --port 8788 --compatibility-date 2025-09-23 --compatibility-flags nodejs_compat"
```

- [ ] **Step 4: Install**

```bash
pnpm install
```

- [ ] **Step 5: Smoke-check `wrangler` resolves**

```bash
pnpm --filter @rune-langium/studio exec wrangler --version
```

Expected: prints a version (4.x).

- [ ] **Step 6: Document the dev flow in studio README**

If `apps/studio/README.md` does not already document the `dev:pages` workflow, append:

```markdown
## Local development with Pages Functions

The studio's Download (spec 018) and LSP (spec 019) endpoints are hosted as
Cloudflare Pages Functions under `apps/studio/functions/api/`. To exercise
them locally:

1. Start Vite (the SPA dev server):
   ```bash
   pnpm dev
   ```
2. In a second terminal, start the Pages dev proxy:
   ```bash
   pnpm dev:pages
   ```
3. Open `http://localhost:8788/` — the SPA from Vite plus `/api/*` from the Functions.

Preview features (per-namespace LSP, code preview) run client-side and do not need the Pages dev proxy. Network features (Download, parseWorkspace fallback) do.
```

- [ ] **Step 7: Commit**

```bash
git add apps/studio/package.json apps/studio/README.md pnpm-lock.yaml
git commit -m "build(studio): add wrangler devDep + dev:pages script (019 Phase -1)"
```

---

# Phase 0 — Parse-worker Fallback

**Outcome:** `parseWorkspace` routes to `POST /api/parse`. Browser parse-worker hydrates from the response. `linkDocument` continues working in-browser. Failure-fallback to browser worker on 5xx / network error.

## Task 0.1: Define `HydrationBlob` shape and `hydrate` request type

**Files:**
- Modify: `apps/studio/src/workers/parser-worker.ts`
- Test: `apps/studio/test/workers/parser-worker-hydrate.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/workers/parser-worker-hydrate.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expectTypeOf } from 'vitest';
import type {
  HydrateRequest,
  HydrateResponse,
  WorkerRequest,
  WorkerResponse
} from '../../src/workers/parser-worker.js';

describe('HydrateRequest type', () => {
  it('is included in WorkerRequest union', () => {
    expectTypeOf<HydrateRequest>().toMatchTypeOf<WorkerRequest>();
  });

  it('has documents and exportsByNamespace fields', () => {
    const req: HydrateRequest = {
      type: 'hydrate',
      id: 'h1',
      documents: [{ uri: 'file:///x.rune', content: '', serializedModel: '{}' }],
      exportsByNamespace: { x: [{ type: 'Data', name: 'T', path: 'x.T' }] }
    };
    expectTypeOf(req.documents).toBeArray();
  });
});

describe('HydrateResponse type', () => {
  it('is included in WorkerResponse union', () => {
    expectTypeOf<HydrateResponse>().toMatchTypeOf<WorkerResponse>();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- parser-worker-hydrate.test.ts
```

Expected: FAIL — `HydrateRequest` / `HydrateResponse` are not exported.

- [ ] **Step 3: Add the types**

In `apps/studio/src/workers/parser-worker.ts`, after the existing `LinkDocumentResponse` interface:

```ts
export interface HydrateRequest {
  type: 'hydrate';
  id: string;
  /** Documents to register with the deferred-model provider. */
  documents: Array<{
    uri: string;
    content: string;
    /** Serialized langium AST as JSON string (from JsonSerializer.serialize). */
    serializedModel: string;
  }>;
  /** Pre-computed export descriptions per namespace, for RuneDslIndexManager.registerExports. */
  exportsByNamespace: Record<string, Array<{ type: string; name: string; path: string }>>;
}

export interface HydrateResponse {
  type: 'hydrateResult';
  id: string;
  ok: boolean;
  error?: string;
}
```

Update the unions:

```ts
export type WorkerRequest = ParseRequest | ParseWorkspaceRequest | LinkDocumentRequest | HydrateRequest;
export type WorkerResponse = ParseResponse | ParseWorkspaceResponse | LinkDocumentResponse | HydrateResponse;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- parser-worker-hydrate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/workers/parser-worker.ts apps/studio/test/workers/parser-worker-hydrate.test.ts
git commit -m "feat(studio): add HydrateRequest/Response types to parser-worker (019 Phase 0)"
```

## Task 0.2: Implement `hydrate` handler in parser-worker

**Files:**
- Modify: `apps/studio/src/workers/parser-worker.ts`
- Modify: `apps/studio/test/workers/parser-worker-hydrate.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `apps/studio/test/workers/parser-worker-hydrate.test.ts`:

```ts
import { Worker } from 'node:worker_threads'; // for jsdom/node worker emulation in tests
import { fileURLToPath } from 'node:url';

describe('hydrate handler', () => {
  it('registers documents and exports such that linkDocument resolves cross-namespace refs', async () => {
    // Drive the worker via postMessage from a test harness.
    // The test harness is at apps/studio/test/workers/parser-worker-harness.ts (NEW in Task 0.2 step 3).
    const { createParserWorkerHarness } = await import('./parser-worker-harness.js');
    const harness = createParserWorkerHarness();

    await harness.send({
      type: 'hydrate',
      id: 'h1',
      documents: [
        {
          uri: 'file:///cdm.base.math.rune',
          content: 'namespace cdm.base.math\ntype Quantity:\n  amount number (1..1)\n',
          serializedModel: harness.serializeSample('cdm.base.math', 'Quantity')
        }
      ],
      exportsByNamespace: {
        'cdm.base.math': [{ type: 'Data', name: 'Quantity', path: 'cdm.base.math.Quantity' }]
      }
    });

    // After hydration, linkDocument against a doc referencing Quantity should resolve.
    const linkResult = await harness.send({
      type: 'linkDocument',
      id: 'l1',
      uri: 'file:///user.rune'
    });

    expect(linkResult.type).toBe('linkDocumentResult');
    expect((linkResult as { errors: string[] }).errors).toHaveLength(0);

    harness.dispose();
  });
});
```

- [ ] **Step 2: Write the test harness**

Create `apps/studio/test/workers/parser-worker-harness.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Test harness for the parser-worker. Loads the worker's module code in the
 * test runtime and exposes a postMessage-shaped API.
 *
 * Used by hydrate/linkDocument tests that need to drive the worker without
 * spinning a full Web Worker.
 */

import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import type { WorkerRequest, WorkerResponse } from '../../src/workers/parser-worker.js';

export interface ParserWorkerHarness {
  send(msg: WorkerRequest): Promise<WorkerResponse>;
  serializeSample(namespace: string, typeName: string): string;
  dispose(): void;
}

export function createParserWorkerHarness(): ParserWorkerHarness {
  // Lazy-import to avoid loading the worker module at file-parse time
  // (which would try to access worker globals like `self`).
  // Instead, import the message handlers directly.
  // This requires apps/studio/src/workers/parser-worker.ts to export its
  // dispatcher (or named handlers) — see Task 0.2 step 4.
  // For now this is a stub; the implementation is filled in step 4 below.
  throw new Error('Implement after Task 0.2 step 4');
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- parser-worker-hydrate.test.ts
```

Expected: FAIL — harness throws "Implement after Task 0.2 step 4".

- [ ] **Step 4: Refactor parser-worker to expose its dispatcher for testing, and implement `hydrate`**

In `apps/studio/src/workers/parser-worker.ts`, refactor the message-dispatch logic into an exported function. Find the existing `self.addEventListener('message', ...)` handler and extract its body:

```ts
// Existing at top of file:
import {
  createRuneDslServices,
  RuneDslIndexManager,
  type DeferredModelProvider,
  type RosettaModel
} from '@rune-langium/core';
import type { CuratedSerializedDocument } from '@rune-langium/curated-schema';
import {
  URI,
  EmptyFileSystem,
  type AstNode,
  type AstNodeDescription,
  type LangiumDocument
} from 'langium';

// NEW: extract handlers behind an exported dispatcher
export async function dispatchWorkerRequest(req: WorkerRequest): Promise<WorkerResponse> {
  switch (req.type) {
    case 'parse': return handleParse(req);
    case 'parseWorkspace': return handleParseWorkspace(req);
    case 'linkDocument': return handleLinkDocument(req);
    case 'hydrate': return handleHydrate(req);
  }
}

// Existing self.addEventListener becomes:
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  self.addEventListener('message', async (e: MessageEvent<WorkerRequest>) => {
    const response = await dispatchWorkerRequest(e.data);
    self.postMessage(response);
  });
}

// NEW handler:
async function handleHydrate(req: HydrateRequest): Promise<HydrateResponse> {
  try {
    // For each document, register the serialized model with the deferred-model store
    // (same mechanism used today by the curated-corpus path: deferredModelJson map).
    for (const doc of req.documents) {
      deferredModelJson.set(doc.uri, doc.serializedModel);
    }
    // Register exports so RuneDslIndexManager can resolve cross-namespace refs.
    const services = getServices();
    const indexManager = services.shared.workspace.IndexManager as RuneDslIndexManager;
    for (const [namespace, exports] of Object.entries(req.exportsByNamespace)) {
      const uri = URI.parse(`file:///${namespace.replace(/\./g, '/')}.rune`);
      const descriptions: AstNodeDescription[] = exports.map((e) => ({
        name: e.name,
        type: e.type,
        path: e.path,
        documentUri: uri,
        nameSegment: undefined,
        selectionSegment: undefined,
        node: undefined
      }) as AstNodeDescription);
      indexManager.registerExports(uri, descriptions);
    }
    return { type: 'hydrateResult', id: req.id, ok: true };
  } catch (err) {
    return {
      type: 'hydrateResult',
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}
```

(Helper `getServices()` should return the same singleton services the existing handlers use. If the file doesn't already have such a helper, extract from the existing `handleParseWorkspace` / `handleLinkDocument` init flow.)

- [ ] **Step 5: Implement the harness**

Replace the body of `createParserWorkerHarness` in `apps/studio/test/workers/parser-worker-harness.ts`:

```ts
import { dispatchWorkerRequest } from '../../src/workers/parser-worker.js';

export function createParserWorkerHarness(): ParserWorkerHarness {
  return {
    async send(msg: WorkerRequest): Promise<WorkerResponse> {
      return dispatchWorkerRequest(msg);
    },
    serializeSample(namespace: string, typeName: string): string {
      const services = createRuneDslServices(EmptyFileSystem).RuneDsl;
      // Parse a minimal source to produce a real serialized AST.
      const source = `namespace ${namespace}\ntype ${typeName}:\n  x number (1..1)\n`;
      const doc = services.shared.workspace.LangiumDocumentFactory.fromString(
        source,
        URI.parse(`file:///${namespace.replace(/\./g, '/')}.rune`)
      );
      // Serialize using langium's JsonSerializer (available on services.serializer).
      return services.serializer.JsonSerializer.serialize(doc.parseResult.value);
    },
    dispose(): void {
      // No-op — singleton services in the worker are reused across tests.
      // For test isolation, callers should construct a fresh harness per test.
    }
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- parser-worker-hydrate.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run all parser-worker tests for regression**

```bash
pnpm --filter @rune-langium/studio test -- parser-worker
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/studio/src/workers/parser-worker.ts apps/studio/test/workers/parser-worker-hydrate.test.ts apps/studio/test/workers/parser-worker-harness.ts
git commit -m "feat(studio): add hydrate handler to parser-worker (019 Phase 0)"
```

## Task 0.3: Pages Function `/api/parse` — stub returning 501

**Files:**
- Create: `apps/studio/functions/api/parse.ts`
- Create: `apps/studio/functions/test/parse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/studio/functions/test/parse.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../api/parse.js';

function makeRequest(body: unknown): Request {
  return new Request('http://example.com/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('POST /api/parse (stub)', () => {
  it('returns 501 Not Implemented', async () => {
    const res = await onRequestPost({ request: makeRequest({}) } as never);
    expect(res.status).toBe(501);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/parse.test.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 3: Add the stub**

Create `apps/studio/functions/api/parse.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Cloudflare Pages Function: POST /api/parse
 *
 * Server-side `parseWorkspace`. Browser studio POSTs workspace files;
 * function runs Langium parse + builds the index, returns a hydration
 * blob the browser worker can replay locally so subsequent linkDocument
 * requests work without re-parsing.
 *
 * Task 0.3 ships a 501 stub; Task 0.4 wires the real pipeline.
 */

export const onRequestPost: PagesFunction = async () => {
  return new Response(
    JSON.stringify({ ok: false, error: 'Not implemented yet' }),
    { status: 501, headers: { 'Content-Type': 'application/json' } }
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/parse.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/functions/api/parse.ts apps/studio/functions/test/parse.test.ts
git commit -m "feat(studio): scaffold /api/parse Pages Function stub (019 Phase 0)"
```

## Task 0.4: Implement `/api/parse` with real pipeline

**Files:**
- Modify: `apps/studio/functions/api/parse.ts`
- Modify: `apps/studio/functions/test/parse.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `apps/studio/functions/test/parse.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../api/parse.js';

function makeRequest(body: unknown): Request {
  return new Request('http://example.com/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

const SIMPLE_RUNE = 'namespace x\ntype T:\n  a string (1..1)\n';

describe('POST /api/parse', () => {
  it('returns 400 for malformed JSON', async () => {
    const req = new Request('http://example.com/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json'
    });
    const res = await onRequestPost({ request: req } as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when files array is missing or empty', async () => {
    const res1 = await onRequestPost({ request: makeRequest({ files: [] }) } as never);
    expect(res1.status).toBe(400);
    const res2 = await onRequestPost({ request: makeRequest({}) } as never);
    expect(res2.status).toBe(400);
  });

  it('returns 200 with ParseResponse shape on success', async () => {
    const res = await onRequestPost({
      request: makeRequest({ files: [{ name: 'x.rune', content: SIMPLE_RUNE }] })
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      ok: boolean;
      models: unknown[];
      parsedModels: unknown[];
      deferredExports: unknown[];
      errors: Record<string, string[]>;
      hydrationState: { documents: unknown[]; exportsByNamespace: Record<string, unknown> };
    };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.models)).toBe(true);
    expect(Array.isArray(body.parsedModels)).toBe(true);
    expect(body.hydrationState).toBeDefined();
    expect(Array.isArray(body.hydrationState.documents)).toBe(true);
    expect(body.hydrationState.documents.length).toBeGreaterThan(0);
  });

  it('includes namespace in exportsByNamespace', async () => {
    const res = await onRequestPost({
      request: makeRequest({ files: [{ name: 'x.rune', content: SIMPLE_RUNE }] })
    } as never);
    const body = await res.json() as {
      hydrationState: { exportsByNamespace: Record<string, Array<{ name: string }>> };
    };
    expect(Object.keys(body.hydrationState.exportsByNamespace)).toContain('x');
    expect(body.hydrationState.exportsByNamespace.x.some((e) => e.name === 'T')).toBe(true);
  });

  it('returns errors field per filePath for parse failures', async () => {
    const res = await onRequestPost({
      request: makeRequest({ files: [{ name: 'broken.rune', content: 'namespace x\ntype Broken:' }] })
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json() as { errors: Record<string, string[]> };
    expect(body.errors['broken.rune']).toBeDefined();
    expect(body.errors['broken.rune'].length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/parse.test.ts
```

Expected: FAIL — stub returns 501 for everything.

- [ ] **Step 3: Implement the real pipeline**

Replace `apps/studio/functions/api/parse.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createRuneDslServices, type RosettaModel } from '@rune-langium/core';
import { URI, type LangiumDocument } from 'langium';

type ParseRequestBody = {
  files: Array<{ name: string; content: string }>;
};

function badRequest(error: string): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  let body: ParseRequestBody;
  try {
    body = (await request.json()) as ParseRequestBody;
  } catch {
    return badRequest('Malformed JSON');
  }

  if (!Array.isArray(body.files) || body.files.length === 0) {
    return badRequest('files: must be a non-empty array');
  }

  const services = createRuneDslServices({ workspaceUri: undefined }).RuneDsl;
  const docs: LangiumDocument[] = body.files.map((f) =>
    services.shared.workspace.LangiumDocumentFactory.fromString(
      f.content,
      URI.parse(`file:///${f.name}`)
    )
  );
  await services.shared.workspace.DocumentBuilder.build(docs, { validation: false });

  const models: RosettaModel[] = [];
  const parsedModels: Array<{ filePath: string; model: RosettaModel }> = [];
  const errors: Record<string, string[]> = {};
  const documentsForHydration: Array<{ uri: string; content: string; serializedModel: string }> = [];
  const exportsByNamespace: Record<string, Array<{ type: string; name: string; path: string }>> = {};

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const filePath = body.files[i].name;
    const parseErrors = doc.parseResult.parserErrors.map((e) => e.message);
    if (parseErrors.length > 0) {
      errors[filePath] = parseErrors;
    }
    const model = doc.parseResult.value as RosettaModel | undefined;
    if (!model) continue;
    models.push(model);
    parsedModels.push({ filePath, model });

    // Serialize for hydration
    const serializedModel = services.serializer.JsonSerializer.serialize(model);
    documentsForHydration.push({
      uri: doc.uri.toString(),
      content: body.files[i].content,
      serializedModel
    });

    // Build per-namespace exports for the index hydration step.
    const namespace = typeof model.name === 'string' ? model.name.replace(/^"|"$/g, '') : '';
    if (!namespace) continue;
    const nsExports = exportsByNamespace[namespace] ?? [];
    // Iterate top-level declarations (data, enum, typeAlias, etc.).
    // Adjust based on @rune-langium/core's RosettaModel shape.
    for (const decl of (model as unknown as { declarations?: Array<{ $type: string; name?: string }> }).declarations ?? []) {
      if (decl.name) {
        nsExports.push({
          type: decl.$type,
          name: decl.name,
          path: `${namespace}.${decl.name}`
        });
      }
    }
    exportsByNamespace[namespace] = nsExports;
  }

  return new Response(JSON.stringify({
    ok: true,
    models,
    parsedModels,
    deferredExports: Object.entries(exportsByNamespace).map(([namespace, exports]) => ({
      filePath: `${namespace.replace(/\./g, '/')}.rune`,
      namespace,
      exports: exports.map(({ type, name }) => ({ type, name }))
    })),
    errors,
    hydrationState: { documents: documentsForHydration, exportsByNamespace }
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/parse.test.ts
```

Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/functions/api/parse.ts apps/studio/functions/test/parse.test.ts
git commit -m "feat(studio): implement /api/parse Pages Function (019 Phase 0)"
```

## Task 0.5: Add routing layer in `workspace.ts`

**Files:**
- Modify: `apps/studio/src/services/workspace.ts`
- Test: `apps/studio/test/services/workspace-parse-routing.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/services/workspace-parse-routing.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseWorkspaceViaRouter } from '../../src/services/workspace.js';

describe('parseWorkspace routing', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to /api/parse for parseWorkspace requests', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      models: [],
      parsedModels: [],
      deferredExports: [],
      errors: {},
      hydrationState: { documents: [], exportsByNamespace: {} }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await parseWorkspaceViaRouter([{ name: 'x.rune', content: 'namespace x\ntype T: a string (1..1)' }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/parse');
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('POST');
  });

  it('falls back to browser worker when /api/parse returns 5xx', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValue(new Response('{}', { status: 503 }));

    // Spy on the browser-worker-path used in fallback (the existing parseWorkspace impl).
    // The router exports `_internalBrowserParseWorkspace` for test injection.
    const browserSpy = vi.fn().mockResolvedValue({
      type: 'parseWorkspaceResult',
      id: 'fb',
      models: [],
      parsedModels: [],
      deferredExports: [],
      errors: {}
    });
    const { setBrowserParseImpl } = await import('../../src/services/workspace.js');
    setBrowserParseImpl(browserSpy);

    await parseWorkspaceViaRouter([{ name: 'x.rune', content: 'namespace x\ntype T: a string (1..1)' }]);

    expect(browserSpy).toHaveBeenCalled();
  });

  it('falls back to browser worker when /api/parse fetch throws', async () => {
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockRejectedValue(new TypeError('Network down'));

    const browserSpy = vi.fn().mockResolvedValue({
      type: 'parseWorkspaceResult',
      id: 'fb',
      models: [],
      parsedModels: [],
      deferredExports: [],
      errors: {}
    });
    const { setBrowserParseImpl } = await import('../../src/services/workspace.js');
    setBrowserParseImpl(browserSpy);

    await parseWorkspaceViaRouter([{ name: 'x.rune', content: 'namespace x\ntype T: a string (1..1)' }]);

    expect(browserSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- workspace-parse-routing.test.ts
```

Expected: FAIL — `parseWorkspaceViaRouter` / `setBrowserParseImpl` not exported.

- [ ] **Step 3: Add the routing helper to `workspace.ts`**

In `apps/studio/src/services/workspace.ts`, add (preserving existing exports):

```ts
import type { ParseWorkspaceResponse, HydrateRequest } from '../workers/parser-worker.js';

// Injection point for tests; production uses the existing workerRequest path.
let browserParseImpl: (files: Array<{ name: string; content: string }>) => Promise<ParseWorkspaceResponse> =
  defaultBrowserParse;

export function setBrowserParseImpl(
  impl: (files: Array<{ name: string; content: string }>) => Promise<ParseWorkspaceResponse>
): void {
  browserParseImpl = impl;
}

async function defaultBrowserParse(files: Array<{ name: string; content: string }>): Promise<ParseWorkspaceResponse> {
  // Use the existing workerRequest path.
  return workerRequest({
    type: 'parseWorkspace',
    id: `ws:${Date.now()}`,
    files: files.map((f) => ({ name: f.name, content: f.content }))
  });
}

export async function parseWorkspaceViaRouter(
  files: Array<{ name: string; content: string }>
): Promise<ParseWorkspaceResponse> {
  try {
    const response = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files })
    });
    if (!response.ok) {
      // Fall through to browser worker.
      return browserParseImpl(files);
    }
    const data = (await response.json()) as {
      ok: boolean;
      models: ParseWorkspaceResponse['models'];
      parsedModels: ParseWorkspaceResponse['parsedModels'];
      deferredExports: ParseWorkspaceResponse['deferredExports'];
      errors: ParseWorkspaceResponse['errors'];
      hydrationState: HydrateRequest['documents'] extends infer D ? {
        documents: HydrateRequest['documents'];
        exportsByNamespace: HydrateRequest['exportsByNamespace'];
      } : never;
    };

    // Hydrate the browser worker so subsequent linkDocument requests work.
    await workerRequest({
      type: 'hydrate',
      id: `hydrate:${Date.now()}`,
      documents: data.hydrationState.documents,
      exportsByNamespace: data.hydrationState.exportsByNamespace
    } as HydrateRequest);

    return {
      type: 'parseWorkspaceResult',
      id: `routed:${Date.now()}`,
      models: data.models,
      parsedModels: data.parsedModels,
      deferredExports: data.deferredExports,
      errors: data.errors
    };
  } catch {
    return browserParseImpl(files);
  }
}
```

Then update **all call sites** that currently call the browser-worker `parseWorkspace` directly to use `parseWorkspaceViaRouter` instead. Find them with:

```bash
grep -rn "type: 'parseWorkspace'" apps/studio/src/ | grep -v workers/parser-worker.ts
```

Each call site (likely 2-3 in services and stores) becomes:

```ts
// Before:
const result = await workerRequest({ type: 'parseWorkspace', id, files });
// After:
const result = await parseWorkspaceViaRouter(files);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- workspace-parse-routing.test.ts
```

Expected: PASS (3 assertions).

- [ ] **Step 5: Run all studio tests for regressions**

```bash
pnpm --filter @rune-langium/studio test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/services/workspace.ts apps/studio/test/services/workspace-parse-routing.test.ts
git commit -m "feat(studio): route parseWorkspace to /api/parse with browser fallback (019 Phase 0)"
```

## Task 0.5a: Extend `/api/parse` to fetch curated bundles server-to-server

**Files:**
- Modify: `apps/studio/functions/api/parse.ts`
- Modify: `apps/studio/functions/test/parse.test.ts`
- (Possibly) Create: `apps/studio/functions/lib/curated-fetch.ts` — tar.gz unpack helper

The "no browser-side corpus parsing" directive added in spec 019 §3.1 / §3.6 requires `/api/parse` to accept `curatedBundles: [{ id, version }]` and fetch the corresponding archives from the curated-mirror Worker. The studio never sends pre-serialized corpus content — it only sends bundle metadata + user files.

- [ ] **Step 1: Write the failing tests** for the new contract

Add to `apps/studio/functions/test/parse.test.ts` (preserve existing tests):

```ts
describe('POST /api/parse — curatedBundles', () => {
  it('accepts an empty curatedBundles array', async () => {
    const res = await onRequestPost({
      request: makeRequest({
        files: [{ name: 'x.rune', content: SIMPLE_RUNE }],
        curatedBundles: []
      })
    } as never);
    expect(res.status).toBe(200);
  });

  it('returns 502 with structured error when a curated bundle is unavailable', async () => {
    // The Pages Function should attempt to fetch from curated-mirror.
    // Mock global.fetch to simulate failure.
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(new Response('not found', { status: 404 }));

    try {
      const res = await onRequestPost({
        request: makeRequest({
          files: [{ name: 'x.rune', content: SIMPLE_RUNE }],
          curatedBundles: [{ id: 'cdm', version: 'latest' }]
        })
      } as never);
      expect(res.status).toBe(502);
      const body = await res.json() as { ok: boolean; error: string; bundleId?: string };
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/curated_bundle_unavailable/);
      expect(body.bundleId).toBe('cdm');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('merges curated bundle documents into hydrationState on success', async () => {
    const originalFetch = global.fetch;
    // Construct a minimal pako-gzipped tar archive with one document, or mock
    // the unpacker. For unit-test simplicity, mock the curated-fetch helper
    // (export it from lib/curated-fetch.ts so tests can stub it). The
    // alternative is to construct a real tar.gz fixture — feasible but
    // adds complexity.
    // The simplest path: have curated-fetch.ts export a function we can vi.spyOn.
    // ...

    // Assert that the response's hydrationState.documents includes:
    //   - The user file (x.rune)
    //   - At least one corpus document from the mocked bundle
  });
});
```

The third test (merging) is complex to assert without a real tar.gz fixture. **Either** spy on the curated-fetch helper (recommended), **or** construct a minimal tar.gz fixture using `pako` directly in the test setup. Discuss with the controller if the fixture approach is preferred — for v1 the spy approach is sufficient.

- [ ] **Step 2: Run failing test**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/parse.test.ts
```

Expected: the new tests fail because `curatedBundles` handling and the 502 path don't exist yet.

- [ ] **Step 3: Implement curated-fetch helper**

Create `apps/studio/functions/lib/curated-fetch.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { inflate } from 'pako';

const CURATED_MIRROR_BASE = 'https://www.daikonic.dev/curated';

export interface CuratedDocument {
  uri: string;
  content: string;
  serializedModel: string;  // JSON string from the bundle's modelJson sidecar
  exports: Array<{ type: string; name: string; path: string }>;
}

/**
 * Fetches a curated bundle archive from the curated-mirror Worker and
 * extracts the per-document serialized model JSON.
 *
 * Throws if the bundle is unavailable (network error, 4xx/5xx from mirror),
 * if the archive is malformed, or if no documents are found.
 */
export async function fetchCuratedBundle(
  id: string,
  version: string
): Promise<CuratedDocument[]> {
  const url = version === 'latest'
    ? `${CURATED_MIRROR_BASE}/${id}/latest.tar.gz`
    : `${CURATED_MIRROR_BASE}/${id}/archives/${version}.tar.gz`;

  const res = await fetch(url);
  if (!res.ok) {
    throw Object.assign(new Error(`curated_bundle_unavailable`), {
      bundleId: id, version, status: res.status
    });
  }

  const gzBuffer = new Uint8Array(await res.arrayBuffer());
  const tarBuffer = inflate(gzBuffer);

  // Walk the tar entries. Each curated bundle ships .rosetta source files
  // AND .modelJson sidecar files at predictable paths.
  // See apps/curated-mirror-worker/src/publisher.ts for the layout.
  // ...
  // (Implementation detail: use the same tar-walking logic the curated
  // mirror or curated-loader uses. Pseudocode here; the real impl reuses
  // existing helpers where possible.)

  return /* parsed CuratedDocument[] */ [];
}
```

The actual tar-walking implementation can either:
- Lift code from `apps/studio/src/services/curated-loader.ts` (currently does the same parsing in the browser).
- Lift from `apps/curated-mirror-worker/src/publisher.ts` (does the inverse — packs the archive — but has the file layout reference).
- Use a minimal tar parser (the `pako` library handles gzip; tar is a simple block format).

Whichever path: keep the logic **identical** to what the browser-side `curated-loader.ts` produces so the hydration documents are byte-compatible with what the browser worker expects.

- [ ] **Step 4: Update `apps/studio/functions/api/parse.ts`**

Extend the request type to accept `curatedBundles`. After parsing user files, fetch each curated bundle via `fetchCuratedBundle`, merge the resulting documents into `documentsForHydration`. On curated-mirror failure return 502 with structured error envelope `{ ok: false, error: 'curated_bundle_unavailable', bundleId, version }`.

Specifically modify the section that builds `documentsForHydration`:

```ts
// Existing user-file loop produces documentsForHydration entries.

// NEW: fetch curated bundles server-to-server.
if (Array.isArray(body.curatedBundles)) {
  for (const bundle of body.curatedBundles) {
    try {
      const curatedDocs = await fetchCuratedBundle(bundle.id, bundle.version);
      for (const doc of curatedDocs) {
        documentsForHydration.push(doc);
      }
    } catch (err) {
      const e = err as { bundleId?: string; version?: string; status?: number; message: string };
      return new Response(JSON.stringify({
        ok: false,
        error: 'curated_bundle_unavailable',
        bundleId: e.bundleId ?? bundle.id,
        version: e.version ?? bundle.version,
        upstreamStatus: e.status
      }), { status: 502, headers: { 'Content-Type': 'application/json' } });
    }
  }
}
```

- [ ] **Step 5: Run tests + regression**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/parse.test.ts
pnpm --filter @rune-langium/studio test
```

Both pass.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/functions/api/parse.ts apps/studio/functions/test/parse.test.ts apps/studio/functions/lib/curated-fetch.ts
git commit -m "feat(studio): /api/parse fetches curated bundles server-to-server (019 Phase 0)"
```

## Task 0.5b: Update `parseWorkspaceFiles` to delegate to `parseWorkspaceViaRouter`

**Files:**
- Modify: `apps/studio/src/services/workspace.ts`
- Modify: `apps/studio/test/services/workspace.test.ts` (if exists)

`parseWorkspaceFiles` currently routes to the browser parse-worker with `serializedModelJson` pass-through. After this task it delegates to `parseWorkspaceViaRouter`, splitting the workspace into user files (sent as content) and curated bundles (sent as metadata).

- [ ] **Step 1: Read current `parseWorkspaceFiles` shape**

```bash
grep -n "parseWorkspaceFiles\|WorkspaceFile " apps/studio/src/services/workspace.ts | head -10
```

Note the `WorkspaceFile` shape — at minimum has `path`, `content`. May have `serializedModelJson` (pre-parsed corpus marker) and `exports`. Files WITH `serializedModelJson` are curated corpus entries; files WITHOUT are user-authored.

The studio also needs to know **which curated bundle** each curated file belongs to (id + version). If this metadata isn't on `WorkspaceFile`, it lives on the workspace store (or `model-store.ts`). Find it before continuing.

- [ ] **Step 2: Update `parseWorkspaceFiles`**

```ts
export async function parseWorkspaceFiles(files: WorkspaceFile[]): Promise<ParseWorkspaceFilesResult> {
  if (files.length === 0) {
    return { models: [], parsedModels: [], errors: new Map(), parseMode: 'router' };
  }

  // Split: user files (no serializedModelJson) go as content; curated bundles
  // (have serializedModelJson) become curatedBundles metadata.
  const userFiles = files
    .filter((f) => !f.serializedModelJson)
    .map((f) => ({ name: f.path, content: f.content }));

  // Derive curated bundles from the workspace's curated imports. Source TBD —
  // either from a sidecar field on WorkspaceFile or from a separate workspace
  // metadata store. For Task 0.5b, look at what model-store.ts knows about
  // active bundles and surface that here.
  const curatedBundles: Array<{ id: string; version: string }> = collectCuratedBundlesFromWorkspace(files);

  try {
    const response = await parseWorkspaceViaRouter(userFiles, { curatedBundles });
    return {
      models: response.models,
      parsedModels: response.parsedModels,
      errors: mapErrors(response.errors),
      parseMode: 'router',
      deferredExports: response.deferredExports
    };
  } catch (error) {
    console.warn('[workspace] parseWorkspaceFiles via router failed:', error);
    return parseWorkspaceFilesOnMainThread(files, {
      parseMode: 'main-thread-fallback',
      fallbackMessage: formatWorkerFallbackMessage(error)
    });
  }
}
```

The signature of `parseWorkspaceViaRouter` from Task 0.5 was `(files: Array<{ name, content }>) => Promise<ParseWorkspaceResponse>`. Extend it to accept an optional second argument:

```ts
export async function parseWorkspaceViaRouter(
  files: Array<{ name: string; content: string }>,
  options: { curatedBundles?: Array<{ id: string; version: string }> } = {}
): Promise<ParseWorkspaceResponse>
```

The router POSTs `{ files, curatedBundles: options.curatedBundles ?? [] }` to `/api/parse`.

- [ ] **Step 3: Add `collectCuratedBundlesFromWorkspace`**

A small helper that walks the workspace files and emits unique `{ id, version }` entries. Source depends on where curated metadata lives in the studio today. Read `apps/studio/src/store/model-store.ts` for the canonical answer.

If the metadata lives in the `WorkspaceFile.serializedModelJson` itself (each entry tagged with bundle id/version), iterate and dedupe. If it lives in a separate store, read it from there.

- [ ] **Step 4: Run tests + regression**

```bash
pnpm --filter @rune-langium/studio test
```

If any tests fail because they assert on `parseMode: 'worker'`, update them to expect `'router'` (or whatever new value you chose).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/services/workspace.ts apps/studio/test/services
git commit -m "feat(studio): parseWorkspaceFiles delegates to /api/parse via router (019 Phase 0)"
```

## Task 0.5c: Trim `model-store.ts` and `curated-loader.ts` to bundle-metadata-only

**Files:**
- Modify: `apps/studio/src/store/model-store.ts`
- Modify: `apps/studio/src/services/curated-loader.ts` (possibly delete)

Per the directive, the studio no longer fetches or unpacks curated archives in-browser. It only tracks which bundle IDs + versions a workspace imports.

- [ ] **Step 1: Identify the in-browser fetch/unpack code path**

```bash
grep -nE "loadCuratedModel|fetchCurated|curated-mirror|untar|inflate" apps/studio/src/store/model-store.ts apps/studio/src/services/curated-loader.ts
```

- [ ] **Step 2: Refactor `loadCuratedModel` (or equivalent) to populate bundle metadata only**

Replace the archive fetch + unpack + per-file population with: track the bundle's `{ id, version }` in the workspace's curated-imports list. The studio store carries this metadata; `parseWorkspaceFiles` reads it and passes to `parseWorkspaceViaRouter`.

The exact shape depends on what `model-store.ts` already exposes. The minimal change: where it previously called `curated-loader` to get `WorkspaceFile[]` with `serializedModelJson` populated, now it appends `{ id, version }` to an `importedBundles` array on the workspace store.

- [ ] **Step 3: Delete or shrink `curated-loader.ts`**

If `curated-loader.ts` was solely an unpacker for the in-browser path and has no other callers, delete it. If it has bundle-metadata utilities (manifest parsing, version validation) that are still useful, keep those.

```bash
grep -rn "curated-loader" apps/studio/src/ apps/studio/test/
```

Verify no orphan imports. Delete cleanly.

- [ ] **Step 4: Verify the studio still loads a curated workspace end-to-end**

This is the integration test. With Task 0.5a (server fetch) + Task 0.5b (router delegation) + Task 0.5c (browser cleanup), loading a workspace with the CDM corpus should:
- Studio sends `{ files: userFiles, curatedBundles: [{ id: 'cdm', version: 'latest' }] }` to `/api/parse`.
- Server fetches the CDM bundle from curated-mirror, parses, returns hydrationState.
- Browser hydrates from the response.
- No archive ever touches the browser.

Verify by running the studio locally:

```bash
pnpm --filter @rune-langium/studio dev &
pnpm --filter @rune-langium/studio dev:pages &
# Open http://localhost:8788/, load a workspace that imports CDM, verify it works.
```

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/store/model-store.ts apps/studio/src/services
git commit -m "refactor(studio): model-store tracks bundle metadata only; remove curated-loader (019 Phase 0)"
```

## Task 0.5d: Deprecate `serializedModelJson` pass-through in `handleParseWorkspace`

**Files:**
- Modify: `apps/studio/src/workers/parser-worker.ts`

`handleParseWorkspace` still honors the `serializedModelJson` field on incoming files as a fast-path that skips parsing. After Task 0.5b, production no longer populates this field — but the path stays as a transition shim. This task marks the path deprecated for removal in a follow-up spec.

- [ ] **Step 1: Add a deprecation comment**

In `apps/studio/src/workers/parser-worker.ts`, find the `if (file.serializedModelJson)` branch inside `handleParseWorkspace`. Add a comment above it:

```ts
// DEPRECATED (019 Phase 0): pre-parsed corpus content no longer flows through
// this path. The server-side /api/parse Pages Function fetches curated bundles
// from curated-mirror directly and returns them in hydrationState. This branch
// remains as a transition shim during 019 rollout; remove in a follow-up spec
// once the router is the only production path for parseWorkspace.
if (file.serializedModelJson) {
  // existing fast-path
}
```

- [ ] **Step 2: No test changes needed** — the branch still works for any caller that still uses it.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/workers/parser-worker.ts
git commit -m "chore(studio): mark serializedModelJson pass-through deprecated (019 Phase 0)"
```

## Task 0.6: e2e — parseWorkspace → server → hydrate → linkDocument

**Files:**
- Create: `apps/studio/test/e2e/parse-fallback.spec.ts`

- [ ] **Step 1: Write the Playwright spec**

Create `apps/studio/test/e2e/parse-fallback.spec.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { test, expect } from '@playwright/test';

test.describe('parseWorkspace server-side path', () => {
  test('parseWorkspace POSTs to /api/parse', async ({ page }) => {
    await page.goto('/');
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.url().endsWith('/api/parse') && r.method() === 'POST'),
      page.evaluate(() => {
        // Trigger a fresh workspace load. Exact selector depends on existing UI.
        // For this test, navigate to a known fixture workspace via the URL params
        // the studio already supports.
        window.location.search = '?fixture=trade';
      })
    ]);
    expect(request.url()).toContain('/api/parse');
  });

  test('after server parseWorkspace, adding a new file resolves cross-namespace refs via browser linkDocument', async ({ page }) => {
    await page.goto('/?fixture=trade');
    await page.waitForSelector('[data-testid="workspace-loaded"]');

    // Add a new file that references a type from the existing workspace.
    await page.evaluate(() => {
      const event = new CustomEvent('test:add-file', {
        detail: {
          name: 'new.rune',
          content: 'namespace test.new\ntype Holding:\n  asset cdm.base.Trade (1..1)\n'
        }
      });
      window.dispatchEvent(event);
    });

    // Wait for the new file to be parsed and linked.
    await page.waitForSelector('[data-testid="new.rune-linked"]');

    // Assert no link errors.
    const errors = await page.evaluate(() => {
      return document.querySelectorAll('[data-testid="link-error"]').length;
    });
    expect(errors).toBe(0);
  });

  test('with /api/parse returning 500, parseWorkspace falls back to browser worker', async ({ page }) => {
    await page.route('**/api/parse', (route) => route.fulfill({ status: 500, body: 'down' }));
    await page.goto('/?fixture=trade');
    await page.waitForSelector('[data-testid="workspace-loaded"]', { timeout: 10_000 });
    // No visible error to the user; the workspace just loaded via the browser worker.
    expect(await page.locator('[data-testid="workspace-loaded"]').isVisible()).toBe(true);
  });
});
```

The test relies on a fixture workspace loadable via `?fixture=trade`. If this doesn't exist, add one in `apps/studio/test/fixtures/trade/*.rune` and wire the URL-param loading in dev mode (or invoke the workspace-load via the studio's existing test hooks).

- [ ] **Step 2: Start dev servers and run e2e**

```bash
# Terminal 1
pnpm --filter @rune-langium/studio dev
# Terminal 2
pnpm --filter @rune-langium/studio dev:pages
# Terminal 3
pnpm --filter @rune-langium/studio test:e2e -- parse-fallback.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/test/e2e/parse-fallback.spec.ts
git commit -m "test(studio): e2e for parseWorkspace server-side path (019 Phase 0)"
```

---

# Phase 1 — LSP Server Code Migration

**Outcome:** All `apps/lsp-worker/` server-side code is duplicated into `apps/studio/functions/api/lsp/` and `apps/studio/functions/lib/`. `apps/studio/wrangler.toml` has the Durable Object binding for `RuneLspSession`. Both the old `apps/lsp-worker/` deploy and the new same-origin endpoint are live in parallel. Existing `apps/lsp-worker/test/*` suites pass against the new endpoint.

## Task 1.1: Move `auth.ts` to `apps/studio/functions/lib/lsp-auth.ts`

**Files:**
- Create: `apps/studio/functions/lib/lsp-auth.ts`
- Source: `apps/lsp-worker/src/auth.ts`
- Test: `apps/studio/functions/test/lsp-auth.test.ts` (NEW — migrated from `apps/lsp-worker/test/auth.test.ts`)

- [ ] **Step 1: Verify source file location**

```bash
ls apps/lsp-worker/src/auth.ts apps/lsp-worker/test/auth.test.ts 2>/dev/null
```

Expected: both files exist.

- [ ] **Step 2: Copy the file**

```bash
mkdir -p apps/studio/functions/lib
cp apps/lsp-worker/src/auth.ts apps/studio/functions/lib/lsp-auth.ts
```

- [ ] **Step 3: Update imports**

If `lsp-auth.ts` has any relative imports (e.g., `./log.js`, `./session.js`), update them. After the move:
- `from './log.js'` → `from './lsp-log.js'` (we rename in Task 1.2)
- `from './session.js'` → `from './lsp-session-do.js'` (we rename in Task 1.3)

Use:

```bash
grep -n "^import" apps/studio/functions/lib/lsp-auth.ts
```

For each relative import, update inline. Example sed if there are no other matches:

```bash
# Verify before applying:
grep -n "from './log.js'\|from './session.js'" apps/studio/functions/lib/lsp-auth.ts
```

Apply edits via the Edit tool, not sed, to keep the change auditable.

- [ ] **Step 4: Copy the test**

```bash
mkdir -p apps/studio/functions/test
cp apps/lsp-worker/test/auth.test.ts apps/studio/functions/test/lsp-auth.test.ts
```

Update its import to point at the new path:

```ts
// Before:
import * as auth from '../src/auth.js';
// After:
import * as auth from '../lib/lsp-auth.js';
```

- [ ] **Step 5: Run the test**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/lsp-auth.test.ts
```

Expected: PASS (same as the original test ran against `apps/lsp-worker/`).

- [ ] **Step 6: Commit**

```bash
git add apps/studio/functions/lib/lsp-auth.ts apps/studio/functions/test/lsp-auth.test.ts
git commit -m "refactor(studio): migrate lsp-worker/auth.ts to studio/functions/lib (019 Phase 1)"
```

## Task 1.2: Move `log.ts` to `apps/studio/functions/lib/lsp-log.ts`

**Files:**
- Create: `apps/studio/functions/lib/lsp-log.ts`
- Source: `apps/lsp-worker/src/log.ts`
- Source: `apps/lsp-worker/src/pino-browser.d.ts`

- [ ] **Step 1: Copy the file**

```bash
cp apps/lsp-worker/src/log.ts apps/studio/functions/lib/lsp-log.ts
cp apps/lsp-worker/src/pino-browser.d.ts apps/studio/functions/lib/pino-browser.d.ts
```

- [ ] **Step 2: Update any imports inside the file**

```bash
grep -n "^import" apps/studio/functions/lib/lsp-log.ts
```

The original file's relative imports — likely none (log.ts depends only on `pino`). Verify and update if any.

- [ ] **Step 3: Smoke-check the import**

```bash
pnpm --filter @rune-langium/studio exec tsgo --noEmit apps/studio/functions/lib/lsp-log.ts
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/functions/lib/lsp-log.ts apps/studio/functions/lib/pino-browser.d.ts
git commit -m "refactor(studio): migrate lsp-worker/log.ts to studio/functions/lib (019 Phase 1)"
```

## Task 1.3: Move `session.ts` (Durable Object) to `apps/studio/functions/lib/lsp-session-do.ts`

**Files:**
- Create: `apps/studio/functions/lib/lsp-session-do.ts`
- Source: `apps/lsp-worker/src/session.ts`
- Test: `apps/studio/functions/test/lsp-session-do.test.ts`

- [ ] **Step 1: Copy the file**

```bash
cp apps/lsp-worker/src/session.ts apps/studio/functions/lib/lsp-session-do.ts
```

- [ ] **Step 2: Update imports**

In `apps/studio/functions/lib/lsp-session-do.ts`:

```ts
// Before (likely):
import { ... } from './auth.js';
import { ... } from './log.js';
// After:
import { ... } from './lsp-auth.js';
import { ... } from './lsp-log.js';
```

Verify all imports:

```bash
grep -n "^import\|^export" apps/studio/functions/lib/lsp-session-do.ts | head -20
```

- [ ] **Step 3: Copy the test (if it exists)**

```bash
test -f apps/lsp-worker/test/session.test.ts && cp apps/lsp-worker/test/session.test.ts apps/studio/functions/test/lsp-session-do.test.ts
```

Update its import paths:

```ts
// Before:
import { RuneLspSession } from '../src/session.js';
// After:
import { RuneLspSession } from '../lib/lsp-session-do.js';
```

- [ ] **Step 4: Run the test**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/lsp-session-do.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/functions/lib/lsp-session-do.ts apps/studio/functions/test/lsp-session-do.test.ts
git commit -m "refactor(studio): migrate lsp-worker/session.ts DO to studio/functions/lib (019 Phase 1)"
```

## Task 1.4: Add Pages Function `POST /api/lsp/session` (session mint)

**Files:**
- Create: `apps/studio/functions/api/lsp/session.ts`
- Source: extract from `apps/lsp-worker/src/index.ts` (look for the `/api/lsp/session` route handler)
- Test: `apps/studio/functions/test/lsp-session.test.ts` (NEW)

- [ ] **Step 1: Write the failing test**

Create `apps/studio/functions/test/lsp-session.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { onRequestPost } from '../api/lsp/session.js';

function makeRequest(body: unknown, origin = 'https://www.daikonic.dev'): Request {
  return new Request('http://example.com/api/lsp/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': origin
    },
    body: JSON.stringify(body)
  });
}

const mockEnv = {
  SESSION_SIGNING_KEY: 'a'.repeat(64),
  ALLOWED_ORIGIN: 'https://www.daikonic.dev',
  LSP_SESSION: {} as DurableObjectNamespace,
  SESSION_RATE_LIMIT_KV: {} as KVNamespace
};

describe('POST /api/lsp/session', () => {
  it('returns 200 with a signed token for valid request', async () => {
    const res = await onRequestPost({
      request: makeRequest({ workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA' }),
      env: mockEnv
    } as never);
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string; expiresAt: number };
    expect(typeof body.token).toBe('string');
    expect(typeof body.expiresAt).toBe('number');
  });

  it('returns 403 for disallowed origin', async () => {
    const res = await onRequestPost({
      request: makeRequest({ workspaceId: '01J7M8AAAAAAAAAAAAAAAAAAAA' }, 'https://evil.com'),
      env: mockEnv
    } as never);
    expect(res.status).toBe(403);
  });

  it('returns 400 for missing workspaceId', async () => {
    const res = await onRequestPost({
      request: makeRequest({}),
      env: mockEnv
    } as never);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/lsp-session.test.ts
```

Expected: FAIL — file does not exist.

- [ ] **Step 3: Extract the session route handler from `apps/lsp-worker/src/index.ts`**

Read `apps/lsp-worker/src/index.ts` and identify the block that handles `POST /api/lsp/session`. Copy that block into `apps/studio/functions/api/lsp/session.ts`, wrapping it as a Pages Function:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { z } from 'zod';
import {
  signSessionToken,
  isOriginAllowed,
  checkSessionRateLimit,
  newNonceHex,
  type SessionTokenPayload
} from '../../lib/lsp-auth.js';
import { logRequest } from '../../lib/lsp-log.js';

interface Env {
  SESSION_SIGNING_KEY?: string;
  ALLOWED_ORIGIN: string;
  LSP_SESSION: DurableObjectNamespace;
  SESSION_RATE_LIMIT_KV?: KVNamespace;
}

const sessionRequestSchema = z.object({
  workspaceId: z.string().min(1)
});

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const origin = request.headers.get('Origin') ?? '';
  if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
    return new Response('Origin not allowed', { status: 403 });
  }

  let body: { workspaceId: string };
  try {
    const parsed = sessionRequestSchema.parse(await request.json());
    body = parsed;
  } catch {
    return new Response('Invalid request body', { status: 400 });
  }

  if (!env.SESSION_SIGNING_KEY) {
    return new Response('Server misconfigured', { status: 500 });
  }

  // Rate-limit per-IP (carries over from the original implementation).
  const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (env.SESSION_RATE_LIMIT_KV) {
    const allowed = await checkSessionRateLimit(env.SESSION_RATE_LIMIT_KV, clientIp);
    if (!allowed) {
      return new Response('Rate limit exceeded', { status: 429 });
    }
  }

  const nonce = newNonceHex();
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
  const payload: SessionTokenPayload = {
    workspaceId: body.workspaceId,
    nonce,
    expiresAt
  };

  const token = await signSessionToken(payload, env.SESSION_SIGNING_KEY);

  logRequest('session.mint', { workspaceId: body.workspaceId, clientIp });

  return new Response(JSON.stringify({ token, expiresAt }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

Adjust to match the exact shape from `apps/lsp-worker/src/index.ts` — the snippet above is illustrative; the actual logic (signing key derivation, nonce handling, KV access) must mirror the source file.

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/lsp-session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/functions/api/lsp/session.ts apps/studio/functions/test/lsp-session.test.ts
git commit -m "feat(studio): add /api/lsp/session Pages Function (019 Phase 1)"
```

## Task 1.5: Add Pages Function `GET /api/lsp/health`

**Files:**
- Create: `apps/studio/functions/api/lsp/health.ts`
- Test: `apps/studio/functions/test/lsp-health.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/studio/functions/test/lsp-health.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { onRequestGet } from '../api/lsp/health.js';

describe('GET /api/lsp/health', () => {
  it('returns 200 with status payload', async () => {
    const req = new Request('http://example.com/api/lsp/health');
    const res = await onRequestGet({ request: req } as never);
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string; langium: boolean };
    expect(body.status).toBe('ok');
    expect(body.langium).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/lsp-health.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the function**

Extract the equivalent block from `apps/lsp-worker/src/index.ts`. Create `apps/studio/functions/api/lsp/health.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

export const onRequestGet: PagesFunction = async () => {
  // Probe that the langium server module can be lazy-imported.
  // (Mirrors the existing apps/lsp-worker/src/index.ts health behavior.)
  let langiumLoaded = false;
  try {
    await import('@rune-langium/lsp-server');
    langiumLoaded = true;
  } catch {
    langiumLoaded = false;
  }

  return new Response(JSON.stringify({
    status: langiumLoaded ? 'ok' : 'degraded',
    langium: langiumLoaded
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/lsp-health.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/functions/api/lsp/health.ts apps/studio/functions/test/lsp-health.test.ts
git commit -m "feat(studio): add /api/lsp/health Pages Function (019 Phase 1)"
```

## Task 1.6: Add Pages Function `GET /api/lsp/ws/[token]` (WS upgrade + DO forward)

**Files:**
- Create: `apps/studio/functions/api/lsp/ws/[token].ts`
- Test: `apps/studio/functions/test/lsp-ws.test.ts`

Note: Pages Functions use `[token]` as dynamic route segment syntax (file name becomes `[token].ts`).

- [ ] **Step 1: Write the failing test**

Create `apps/studio/functions/test/lsp-ws.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { onRequestGet } from '../api/lsp/ws/[token].js';

const mockEnv = {
  SESSION_SIGNING_KEY: 'a'.repeat(64),
  ALLOWED_ORIGIN: 'https://www.daikonic.dev',
  LSP_SESSION: {
    idFromName: () => ({ toString: () => 'do-id-stub' }),
    get: () => ({
      fetch: async () => new Response(null, {
        status: 101,
        webSocket: {} as unknown as WebSocket
      })
    })
  } as unknown as DurableObjectNamespace,
  SESSION_RATE_LIMIT_KV: {} as KVNamespace
};

function makeUpgradeRequest(token: string): Request {
  return new Request('http://example.com/api/lsp/ws/' + token, {
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Origin': 'https://www.daikonic.dev'
    }
  });
}

describe('GET /api/lsp/ws/[token]', () => {
  it('returns 426 for non-upgrade requests', async () => {
    const req = new Request('http://example.com/api/lsp/ws/sometoken');
    const res = await onRequestGet({ request: req, env: mockEnv, params: { token: 'sometoken' } } as never);
    expect(res.status).toBe(426);
  });

  it('returns 401 for invalid token', async () => {
    const res = await onRequestGet({
      request: makeUpgradeRequest('bogus.token.signature'),
      env: mockEnv,
      params: { token: 'bogus.token.signature' }
    } as never);
    expect(res.status).toBe(401);
  });

  // Full WS upgrade tests run against `wrangler pages dev` in the integration job (Task 1.8).
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/lsp-ws.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the function**

Extract from `apps/lsp-worker/src/index.ts` (the WS route handler) plus re-export the DO class. Create `apps/studio/functions/api/lsp/ws/[token].ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import {
  verifySessionToken,
  isOriginAllowed,
  checkAndRecordNonce,
  type SessionTokenPayload
} from '../../../lib/lsp-auth.js';
import { logRequest } from '../../../lib/lsp-log.js';
import { RuneLspSession } from '../../../lib/lsp-session-do.js';

// Re-export so wrangler's DO binding can resolve `class_name = "RuneLspSession"`.
export { RuneLspSession };

interface Env {
  SESSION_SIGNING_KEY?: string;
  ALLOWED_ORIGIN: string;
  LSP_SESSION: DurableObjectNamespace;
  SESSION_RATE_LIMIT_KV?: KVNamespace;
}

export const onRequestGet: PagesFunction<Env, 'token'> = async ({ request, env, params }) => {
  const upgrade = request.headers.get('Upgrade');
  if (upgrade !== 'websocket') {
    return new Response('Expected websocket upgrade', { status: 426 });
  }

  const origin = request.headers.get('Origin') ?? '';
  if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
    return new Response('Origin not allowed', { status: 403 });
  }

  const token = String(params.token ?? '');
  if (!env.SESSION_SIGNING_KEY) {
    return new Response('Server misconfigured', { status: 500 });
  }

  let payload: SessionTokenPayload;
  try {
    payload = await verifySessionToken(token, env.SESSION_SIGNING_KEY);
  } catch {
    return new Response('Invalid token', { status: 401 });
  }

  if (payload.expiresAt < Date.now()) {
    return new Response('Token expired', { status: 401 });
  }

  // Replay protection
  if (env.SESSION_RATE_LIMIT_KV) {
    const fresh = await checkAndRecordNonce(env.SESSION_RATE_LIMIT_KV, payload.nonce);
    if (!fresh) {
      return new Response('Nonce reused', { status: 401 });
    }
  }

  // Forward the WS to the per-workspace Durable Object.
  const doId = env.LSP_SESSION.idFromName(payload.workspaceId);
  const doStub = env.LSP_SESSION.get(doId);

  logRequest('ws.upgrade', { workspaceId: payload.workspaceId });

  return doStub.fetch(request);
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- functions/test/lsp-ws.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/functions/api/lsp/ws/\[token\].ts apps/studio/functions/test/lsp-ws.test.ts
git commit -m "feat(studio): add /api/lsp/ws/[token] Pages Function with DO forward (019 Phase 1)"
```

## Task 1.7: Extend `apps/studio/wrangler.toml` with DO binding

**Files:**
- Modify: `apps/studio/wrangler.toml`

- [ ] **Step 1: Read the current file**

```bash
cat apps/studio/wrangler.toml
```

Existing content (from spec 018):

```toml
name = "rune-studio"
compatibility_date = "2025-09-23"
compatibility_flags = ["nodejs_compat"]
pages_build_output_dir = "./dist"
```

- [ ] **Step 2: Append the DO binding**

Append to `apps/studio/wrangler.toml`:

```toml
# LSP session Durable Object (migrated from apps/lsp-worker/, spec 019 Phase 1).
[[durable_objects.bindings]]
name = "LSP_SESSION"
class_name = "RuneLspSession"
script_name = "rune-studio"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["RuneLspSession"]

# Allowlist for LSP session origin gating (defaults; override per env).
[vars]
ALLOWED_ORIGIN = "https://www.daikonic.dev"
```

- [ ] **Step 3: Verify wrangler config parses**

```bash
pnpm --filter @rune-langium/studio exec wrangler pages functions build --compatibility-date 2025-09-23 --outdir .wrangler/tmp-functions
```

Expected: build succeeds; the DO class `RuneLspSession` is recognized (it's exported from `apps/studio/functions/api/lsp/ws/[token].ts`).

- [ ] **Step 4: Commit**

```bash
git add apps/studio/wrangler.toml
git commit -m "build(studio): wrangler.toml — add LSP_SESSION DO binding (019 Phase 1)"
```

## Task 1.8: Deploy both endpoints in parallel and verify

**Files:**
- Modify: (none — deployment-only task)

- [ ] **Step 1: Deploy the new endpoint to staging**

```bash
# Studio Pages project (includes /api/parse and /api/lsp/*)
pnpm --filter @rune-langium/studio build
pnpm --filter @rune-langium/studio exec wrangler pages deploy dist --branch=lsp-migration-staging
```

Expected: deploy succeeds. The new staging URL is printed (something like `https://lsp-migration-staging.rune-studio.pages.dev`).

- [ ] **Step 2: Smoke-test the new endpoint**

```bash
# Health probe
curl -i "https://lsp-migration-staging.rune-studio.pages.dev/api/lsp/health"
```

Expected: `200 OK`, body `{"status":"ok","langium":true}`.

```bash
# Session mint (replace ORIGIN with the actual deploy origin)
curl -i -X POST "https://lsp-migration-staging.rune-studio.pages.dev/api/lsp/session" \
  -H "Content-Type: application/json" \
  -H "Origin: https://lsp-migration-staging.rune-studio.pages.dev" \
  -d '{"workspaceId":"01J7M8AAAAAAAAAAAAAAAAAAAA"}'
```

Expected: `200 OK`, body has `token` and `expiresAt`.

- [ ] **Step 3: Run the existing apps/lsp-worker/test suites against the new endpoint URL**

The `apps/lsp-worker/test/` suites that test against the deployed Worker can be re-pointed at the staging URL via env override. Add a script `apps/studio/scripts/test-against-staging.mjs` that runs the relevant test suite against `LSP_BASE_URL=https://lsp-migration-staging.rune-studio.pages.dev`.

For now, document this as a manual verification step; the implementer can decide whether to script it.

- [ ] **Step 4: Verify the old `apps/lsp-worker/` deploy still works**

```bash
curl -i "https://www.daikonic.dev/rune-studio/api/lsp/health"
```

Expected: `200 OK` from the old deploy. Both endpoints are now live in parallel.

- [ ] **Step 5: Commit (deployment record)**

This task has no code changes. Document the deployment URL and verification results in the PR description or a deployment log entry. No commit needed.

---

# Phase 2 — Studio Cutover and In-Browser LSP Retirement

**Outcome:** Studio points at the same-origin LSP endpoint. `apps/studio/src/workers/lsp-worker.ts` and `apps/studio/src/services/worker-transport.ts` are deleted. `transport-provider.ts` simplifies from 3 tiers to 2. Editor footer shows a connection-state badge.

## Task 2.1: Update `apps/studio/src/config.ts` to same-origin defaults

**Files:**
- Modify: `apps/studio/src/config.ts`
- Test: `apps/studio/test/config.test.ts` (extend if exists, else NEW)

- [ ] **Step 1: Write the failing test**

Create or extend `apps/studio/test/config.test.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('config — same-origin LSP defaults', () => {
  beforeEach(() => {
    // Reset window.location for each test.
    vi.stubGlobal('window', {
      location: { origin: 'https://www.daikonic.dev', href: 'https://www.daikonic.dev/rune-studio/studio/' }
    });
  });

  it('lspWsUrl defaults to same-origin /api/lsp/ws', async () => {
    const { config } = await import('../src/config.js');
    expect(config.lspWsUrl).toBe('wss://www.daikonic.dev/api/lsp/ws');
  });

  it('lspSessionUrl defaults to same-origin /api/lsp/session', async () => {
    const { config } = await import('../src/config.js');
    expect(config.lspSessionUrl).toBe('https://www.daikonic.dev/api/lsp/session');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- config.test.ts
```

Expected: FAIL — config still points at the old external URL.

- [ ] **Step 3: Update config defaults**

In `apps/studio/src/config.ts`, replace the `lspWsDefault` and `deriveSessionUrl` logic:

```ts
// Replace the existing lspWsDefault constant + deriveSessionUrl call:

function defaultLspWsUrl(): string {
  if (typeof window === 'undefined') return 'wss://localhost:8788/api/lsp/ws';
  return window.location.origin.replace(/^http/, 'ws') + '/api/lsp/ws';
}

function defaultLspSessionUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:8788/api/lsp/session';
  return window.location.origin + '/api/lsp/session';
}

const lspWsUrl = env.VITE_LSP_WS_URL ?? defaultLspWsUrl();
const lspSessionUrl = env.VITE_LSP_SESSION_URL ?? defaultLspSessionUrl();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter @rune-langium/studio test -- config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/config.ts apps/studio/test/config.test.ts
git commit -m "feat(studio): default LSP URLs to same-origin (019 Phase 2)"
```

## Task 2.2: Simplify `transport-provider.ts` (drop `embedded` tier)

**Files:**
- Modify: `apps/studio/src/services/transport-provider.ts`
- Modify: `apps/studio/test/services/transport-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/studio/test/services/transport-provider.test.ts`, add (or update existing tests):

```ts
describe('TransportProvider — 2-tier fallback', () => {
  it('TransportMode no longer includes "embedded"', () => {
    // Type-level: this test compiles only if the type was actually narrowed.
    const validModes: Array<'disconnected' | 'websocket' | 'pages-function'> =
      ['disconnected', 'websocket', 'pages-function'];
    expect(validModes).toHaveLength(3);
  });

  it('createTransportProvider does not try the embedded worker', async () => {
    const provider = createTransportProvider({
      // Force network path; do not pass preferEmbedded.
      wsUri: undefined,
      sessionUrl: '/api/lsp/session',
      cfWsBase: 'ws://localhost:8788/api/lsp/ws'
    });
    // After connect, mode is either 'pages-function' or 'disconnected' (on error).
    // Mock fetch to return a valid token then mock WS to succeed.
    // (Mocking detail in full test; abbreviated here.)
    const state = provider.getState();
    expect(state.mode).not.toBe('embedded');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @rune-langium/studio test -- transport-provider.test.ts
```

Expected: FAIL — `embedded` still exists in `TransportMode`.

- [ ] **Step 3: Refactor `transport-provider.ts`**

In `apps/studio/src/services/transport-provider.ts`, make the following changes:

1. Update the `TransportMode` type:

```ts
// Before:
export type TransportMode = 'disconnected' | 'websocket' | 'cf-worker' | 'embedded';
// After:
export type TransportMode = 'disconnected' | 'websocket' | 'pages-function';
```

2. Remove the `tryEmbedded` function entirely.

3. Remove `preferEmbedded` from `TransportProviderOptions` and from defaults.

4. Update `connect()` to skip the embedded tier:

```ts
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
```

5. Rename `tryCfWorker` to `tryPagesFunction` (same body):

```ts
async function tryPagesFunction(): Promise<Transport> {
  setState({ mode: 'pages-function', status: 'connecting' });
  // ... existing tryCfWorker body, with setState mode updated to 'pages-function'
}
```

6. Update error message helpers to reference "pages-function" instead of "cf-worker":

```ts
function createPagesFunctionUnavailableError(cause: unknown): Error {
  // ... renamed from createCfWorkerUnavailableError, same body
}
```

7. Remove the import of `createWorkerTransport` from `./worker-transport.js`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @rune-langium/studio test -- transport-provider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all studio tests for regressions**

```bash
pnpm --filter @rune-langium/studio test
```

Expected: PASS. Tests that referenced `mode: 'embedded'` or `mode: 'cf-worker'` will fail; update them to `mode: 'pages-function'`.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/services/transport-provider.ts apps/studio/test/services/transport-provider.test.ts
git commit -m "refactor(studio): transport-provider — drop embedded tier; rename cf-worker → pages-function (019 Phase 2)"
```

## Task 2.3: Delete `lsp-worker.ts` and `worker-transport.ts`

**Files:**
- Delete: `apps/studio/src/workers/lsp-worker.ts`
- Delete: `apps/studio/src/services/worker-transport.ts`
- Delete: `apps/studio/test/workers/lsp-worker.test.ts` (if exists)
- Delete: `apps/studio/test/services/worker-transport.test.ts` (if exists)

- [ ] **Step 1: Find remaining references**

```bash
grep -rn "lsp-worker\|worker-transport\|createWorkerTransport" apps/studio/src apps/studio/test | grep -v functions/
```

Expected: only the files themselves should match (no callers remain after Task 2.2).

- [ ] **Step 2: Delete the files**

```bash
git rm apps/studio/src/workers/lsp-worker.ts
git rm apps/studio/src/services/worker-transport.ts
test -f apps/studio/test/workers/lsp-worker.test.ts && git rm apps/studio/test/workers/lsp-worker.test.ts
test -f apps/studio/test/services/worker-transport.test.ts && git rm apps/studio/test/services/worker-transport.test.ts
```

- [ ] **Step 3: Run all studio tests**

```bash
pnpm --filter @rune-langium/studio test
```

Expected: PASS.

- [ ] **Step 4: Run type-check**

```bash
pnpm --filter @rune-langium/studio run type-check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/studio/src apps/studio/test
git commit -m "refactor(studio): delete in-browser lsp-worker and worker-transport (019 Phase 2)"
```

## Task 2.4: Add `LspConnectionBadge` component to the editor footer

**Files:**
- Create: `apps/studio/src/components/LspConnectionBadge.tsx`
- Create: `apps/studio/test/components/LspConnectionBadge.test.tsx`
- Modify: `apps/studio/src/components/EditorFooter.tsx` (or equivalent existing footer)

- [ ] **Step 1: Write the failing test**

Create `apps/studio/test/components/LspConnectionBadge.test.tsx`:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LspConnectionBadge } from '../../src/components/LspConnectionBadge.js';

const mockProvider = (mode: string, status: string) => ({
  getState: () => ({ mode, status, error: status === 'error' ? new Error('Down') : undefined }),
  onStateChange: () => () => {},
  reconnect: vi.fn().mockResolvedValue(undefined)
} as never);

describe('LspConnectionBadge', () => {
  it('renders nothing when status is connected', () => {
    const { container } = render(<LspConnectionBadge provider={mockProvider('pages-function', 'connected')} />);
    // Visible only in dev mode; in test we assert the badge text isn't an error.
    expect(container.querySelector('[data-testid="lsp-badge-error"]')).toBeNull();
  });

  it('renders "Connecting…" when status is connecting', () => {
    render(<LspConnectionBadge provider={mockProvider('pages-function', 'connecting')} />);
    expect(screen.getByTestId('lsp-badge-connecting')).toBeInTheDocument();
  });

  it('renders "Language services unavailable" with retry button when status is error', () => {
    render(<LspConnectionBadge provider={mockProvider('disconnected', 'error')} />);
    expect(screen.getByTestId('lsp-badge-error')).toBeInTheDocument();
    expect(screen.getByText(/Language services unavailable/i)).toBeInTheDocument();
    expect(screen.getByTestId('lsp-badge-retry')).toBeInTheDocument();
  });

  it('clicking retry invokes provider.reconnect', () => {
    const provider = mockProvider('disconnected', 'error');
    render(<LspConnectionBadge provider={provider} />);
    fireEvent.click(screen.getByTestId('lsp-badge-retry'));
    expect(provider.reconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @rune-langium/studio test -- LspConnectionBadge.test.tsx
```

Expected: FAIL — file does not exist.

- [ ] **Step 3: Implement the badge**

Create `apps/studio/src/components/LspConnectionBadge.tsx`:

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { TransportProvider, TransportState } from '../services/transport-provider.js';

export interface LspConnectionBadgeProps {
  provider: TransportProvider;
}

export function LspConnectionBadge({ provider }: LspConnectionBadgeProps): React.ReactElement | null {
  const [state, setState] = useState<TransportState>(provider.getState());

  useEffect(() => {
    return provider.onStateChange(setState);
  }, [provider]);

  if (state.status === 'connected') {
    // Visible only in dev mode; in production, success is silent.
    if (typeof window !== 'undefined' && import.meta.env?.DEV) {
      return (
        <span data-testid="lsp-badge-connected" className="text-green-500 text-xs">●</span>
      );
    }
    return null;
  }

  if (state.status === 'connecting') {
    return (
      <span data-testid="lsp-badge-connecting" className="text-amber-500 text-xs flex items-center gap-1">
        <RefreshCw className="size-3 animate-spin" />
        Connecting…
      </span>
    );
  }

  return (
    <span data-testid="lsp-badge-error" className="text-red-500 text-xs flex items-center gap-2">
      <AlertTriangle className="size-3.5" />
      Language services unavailable
      <button
        type="button"
        data-testid="lsp-badge-retry"
        onClick={() => { void provider.reconnect(); }}
        className="ml-1 underline hover:no-underline"
      >
        Retry
      </button>
    </span>
  );
}
```

- [ ] **Step 4: Mount the badge in the editor footer**

Find the existing editor footer component:

```bash
grep -rln "editor footer\|EditorFooter\|footer.*editor" apps/studio/src/components/
```

In whichever file is the footer, import and render the badge:

```tsx
import { LspConnectionBadge } from './LspConnectionBadge.js';
// ... inside the footer JSX:
<LspConnectionBadge provider={transportProvider} />
```

The `transportProvider` instance should be available via the existing store or a React context. If not, the badge can be wired up in the same place that constructs the LSP client today.

- [ ] **Step 5: Run tests to verify**

```bash
pnpm --filter @rune-langium/studio test -- LspConnectionBadge.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/components/LspConnectionBadge.tsx apps/studio/test/components/LspConnectionBadge.test.tsx apps/studio/src/components/
git commit -m "feat(studio): add LspConnectionBadge to editor footer (019 Phase 2)"
```

## Task 2.5: Bundle-size regression guard

**Files:**
- Create: `apps/studio/scripts/check-bundle-size.mjs`
- Modify: `apps/studio/package.json` (add a `bundle-size` script)

- [ ] **Step 1: Capture baseline size**

```bash
pnpm --filter @rune-langium/studio build
du -sb apps/studio/dist/assets | awk '{print $1}'
```

Record the size in bytes — call this `BASELINE`.

After deleting `apps/studio/src/workers/lsp-worker.ts` and `worker-transport.ts` (Task 2.3), the bundle should be smaller. Pick a conservative threshold (e.g., `BASELINE - 100_000` = at least 100KB smaller) as the regression gate.

- [ ] **Step 2: Write the size-check script**

Create `apps/studio/scripts/check-bundle-size.mjs`:

```js
#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/assets', import.meta.url).pathname;
// MAX_BYTES is the upper bound the studio's JS bundle should not exceed.
// Phase 2 sets this after measuring the post-LSP-retirement build.
const MAX_BYTES = Number(process.env.STUDIO_MAX_BUNDLE_BYTES ?? 5_000_000); // 5MB default placeholder; replace with measured value

async function dirTotal(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await dirTotal(path);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      total += (await stat(path)).size;
    }
  }
  return total;
}

const total = await dirTotal(DIST);
console.log(`Studio bundle JS total: ${total} bytes (limit ${MAX_BYTES})`);
if (total > MAX_BYTES) {
  console.error(`Bundle exceeds limit by ${total - MAX_BYTES} bytes`);
  process.exit(1);
}
```

- [ ] **Step 3: Add a script entry**

In `apps/studio/package.json`, add to `scripts`:

```json
"bundle-size": "node scripts/check-bundle-size.mjs"
```

- [ ] **Step 4: Run after build**

```bash
pnpm --filter @rune-langium/studio build
pnpm --filter @rune-langium/studio run bundle-size
```

Record the post-migration size; set `STUDIO_MAX_BUNDLE_BYTES` in CI to that value plus a small headroom (e.g., +5%).

- [ ] **Step 5: Wire the check into CI**

In `.github/workflows/ci.yml` (or wherever the studio CI lives), add a step after the studio build:

```yaml
- name: Studio bundle size check
  run: pnpm --filter @rune-langium/studio run bundle-size
  env:
    STUDIO_MAX_BUNDLE_BYTES: ${{ vars.STUDIO_MAX_BUNDLE_BYTES }}
```

- [ ] **Step 6: Commit**

```bash
git add apps/studio/scripts/check-bundle-size.mjs apps/studio/package.json .github/workflows/ci.yml
git commit -m "build(studio): bundle-size regression guard after LSP retirement (019 Phase 2)"
```

## Task 2.6: Playwright e2e — "Language services unavailable" state

**Files:**
- Modify: `apps/studio/test/e2e/codegen-targets.spec.ts` (or NEW `lsp-states.spec.ts`)

- [ ] **Step 1: Write the spec**

Create `apps/studio/test/e2e/lsp-states.spec.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { test, expect } from '@playwright/test';

test.describe('LSP connection state UI', () => {
  test('shows "Language services unavailable" when /api/lsp/session is blocked', async ({ page }) => {
    await page.route('**/api/lsp/session', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.goto('/');
    await page.waitForSelector('[data-testid="lsp-badge-error"]');
    await expect(page.getByText(/Language services unavailable/i)).toBeVisible();
    await expect(page.getByTestId('lsp-badge-retry')).toBeVisible();
  });

  test('Retry button invokes reconnect (which succeeds when route is unblocked)', async ({ page }) => {
    let blockSession = true;
    await page.route('**/api/lsp/session', (route) => {
      if (blockSession) {
        route.fulfill({ status: 503, body: 'down' });
      } else {
        route.continue();
      }
    });

    await page.goto('/');
    await page.waitForSelector('[data-testid="lsp-badge-error"]');

    blockSession = false;
    await page.getByTestId('lsp-badge-retry').click();

    // After successful retry, badge no longer shows error.
    await expect(page.getByTestId('lsp-badge-error')).toBeHidden({ timeout: 5000 });
  });

  test('editor still loads and edits save when LSP is unavailable', async ({ page }) => {
    await page.route('**/api/lsp/session', (route) => route.fulfill({ status: 503, body: 'down' }));
    await page.goto('/');

    // CodeMirror editor mounts even without LSP.
    await page.waitForSelector('.cm-editor');
    await page.locator('.cm-editor').click();
    await page.keyboard.type('namespace test\ntype X:\n  a number (1..1)\n');

    // The file is now dirty; verify the save indicator (UI-dependent).
    await expect(page.locator('[data-testid="workspace-dirty"]')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run e2e**

```bash
pnpm --filter @rune-langium/studio test:e2e -- lsp-states.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/test/e2e/lsp-states.spec.ts
git commit -m "test(studio): e2e for LSP unavailable state (019 Phase 2)"
```

## Task 2.7: Browser memory-footprint regression guard

**Files:**
- Create: `apps/studio/test/e2e/memory-baseline.spec.ts`
- Modify: `apps/studio/playwright.config.ts` (Chromium launch args)
- Create: `apps/studio/scripts/capture-memory-baseline.mjs`

This task implements US2 acceptance criterion #7: the post-migration `performance.memory.usedJSHeapSize` against the CDM corpus must not exceed the captured baseline by more than 5%.

- [ ] **Step 1: Enable precise memory info in Playwright**

In `apps/studio/playwright.config.ts`, ensure the `chromium` project launches with `--enable-precise-memory-info`:

```ts
// inside projects: [{ name: 'chromium', use: { ... } }]
use: {
  ...devices['Desktop Chrome'],
  launchOptions: {
    args: ['--enable-precise-memory-info']
  }
}
```

- [ ] **Step 2: Capture the baseline (one-shot)**

Create `apps/studio/scripts/capture-memory-baseline.mjs`:

```js
#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { chromium } from 'playwright';

const url = process.env.STUDIO_URL ?? 'http://localhost:8788/?fixture=cdm';
const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
const page = await browser.newPage();
await page.goto(url);
await page.waitForSelector('[data-testid="workspace-loaded"]', { timeout: 60_000 });
// Allow GC to settle.
await page.waitForTimeout(2000);
const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0);
console.log(JSON.stringify({ heapBytes: heap }, null, 2));
await browser.close();
```

Pre-migration: check out the commit just before Task 2.3 (in-browser LSP deletion) and run:

```bash
pnpm --filter @rune-langium/studio build
pnpm --filter @rune-langium/studio dev &
pnpm --filter @rune-langium/studio dev:pages &
sleep 5
pnpm --filter @rune-langium/studio exec node scripts/capture-memory-baseline.mjs > baseline.json
```

Record the `heapBytes` value. Call this `BASELINE`.

- [ ] **Step 3: Write the regression test**

Create `apps/studio/test/e2e/memory-baseline.spec.ts`:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { test, expect } from '@playwright/test';

// BASELINE is set in CI via the STUDIO_MEMORY_BASELINE_BYTES env var.
// Captured per Phase 2 Task 2.7 step 2.
const BASELINE = Number(process.env.STUDIO_MEMORY_BASELINE_BYTES ?? '0');
const HEADROOM_PCT = 5;

test.describe('browser memory regression', () => {
  test.skip(BASELINE === 0, 'STUDIO_MEMORY_BASELINE_BYTES not set');

  test('used JS heap after CDM workspace parse is at or below baseline (+5% headroom)', async ({ page }) => {
    await page.goto('/?fixture=cdm');
    await page.waitForSelector('[data-testid="workspace-loaded"]', { timeout: 60_000 });
    await page.waitForTimeout(2000); // let GC settle

    const heap = await page.evaluate(() =>
      (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0
    );

    expect(heap).toBeGreaterThan(0);
    const max = Math.floor(BASELINE * (1 + HEADROOM_PCT / 100));
    expect(heap).toBeLessThanOrEqual(max);
    console.log(`Memory: heap=${heap} bytes, baseline=${BASELINE}, max=${max} (headroom ${HEADROOM_PCT}%)`);
  });
});
```

- [ ] **Step 4: Capture post-migration measurement and set the CI variable**

After Task 2.3 deletions land:

```bash
pnpm --filter @rune-langium/studio build
pnpm --filter @rune-langium/studio dev &
pnpm --filter @rune-langium/studio dev:pages &
sleep 5
pnpm --filter @rune-langium/studio exec node scripts/capture-memory-baseline.mjs
```

The post-migration `heapBytes` value should be **smaller** than `BASELINE`. Set `STUDIO_MEMORY_BASELINE_BYTES` in CI to the **post-migration** value (so future regressions fail if memory grows back).

- [ ] **Step 5: Run the regression test**

```bash
STUDIO_MEMORY_BASELINE_BYTES=<post-migration-value> \
  pnpm --filter @rune-langium/studio test:e2e -- memory-baseline.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Wire into CI**

In `.github/workflows/ci.yml` studio job, add:

```yaml
- name: Studio memory regression check
  run: pnpm --filter @rune-langium/studio test:e2e -- memory-baseline.spec.ts
  env:
    STUDIO_MEMORY_BASELINE_BYTES: ${{ vars.STUDIO_MEMORY_BASELINE_BYTES }}
```

`vars.STUDIO_MEMORY_BASELINE_BYTES` is set to the post-migration value (from step 4).

- [ ] **Step 7: Commit**

```bash
git add apps/studio/test/e2e/memory-baseline.spec.ts apps/studio/playwright.config.ts apps/studio/scripts/capture-memory-baseline.mjs .github/workflows/ci.yml
git commit -m "test(studio): browser memory regression guard after LSP retirement (019 Phase 2)"
```

---

# Phase 3 — Strip `apps/lsp-worker/` to DO-only

**Outcome:** `apps/lsp-worker/`'s HTTP routes (`/api/lsp/session`, `/api/lsp/health`, `/api/lsp/ws/*`) are removed; the Worker keeps a single responsibility — **hosting the `RuneLspSession` Durable Object class** that the Pages Functions in `apps/studio/functions/api/lsp/*` bind to.

> **Architecture note (corrected from the original plan):** Cloudflare Pages
> cannot create or host Durable Objects — only consume them via binding to a
> Worker that owns the namespace. See
> https://developers.cloudflare.com/pages/functions/bindings/#durable-objects
>
> The `apps/studio/wrangler.toml` DO binding has `script_name = "rune-lsp-worker"`
> for exactly this reason: the DO class lives in `apps/lsp-worker/src/session.ts`,
> and the Pages Functions consume it via the binding.
>
> The original Phase 3 plan ("delete `apps/lsp-worker/` entirely") was wrong on
> this point and has been narrowed. The Worker stays deployed forever (or until
> CF Pages eventually gains DO-hosting capability — not on their roadmap as of
> 2026-05); only its now-redundant HTTP route handlers come out.

## Task 3.1: Strip HTTP route handlers from `apps/lsp-worker/src/index.ts`

**Files:**
- Modify: `apps/lsp-worker/src/index.ts` — remove `handleSession`, `handleHealth`, `handleWsUpgrade` and their `URL.pathname` dispatch; keep the DO class export
- Delete: `apps/lsp-worker/src/auth.ts` — already migrated to `apps/studio/functions/lib/lsp-auth.ts`
- Delete: `apps/lsp-worker/src/log.ts` — already migrated to `apps/studio/functions/lib/lsp-log.ts`
- Modify: `apps/lsp-worker/wrangler.toml` — remove `[[routes]]` block (Worker no longer serves HTTP)
- Keep: `apps/lsp-worker/src/session.ts` — DO class, the whole point
- Keep: `apps/lsp-worker/wrangler.toml` `[[durable_objects.bindings]]` + `[[migrations]]` — these declare the DO namespace at the edge

- [ ] **Step 1: Rewrite `apps/lsp-worker/src/index.ts` to a DO-only export**

Replace the entire `fetch(request, env, ctx)` body with a stub that 404s anything that reaches the Worker directly. With `[[routes]]` removed the Worker shouldn't see HTTP traffic at all, but a 404 is cheap insurance against misconfiguration:

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
//
// apps/lsp-worker/ is now a DO-only Worker (spec 019 Phase 3).
// All HTTP traffic that used to live here was migrated to Pages Functions
// at apps/studio/functions/api/lsp/*. This Worker exists solely to host
// the RuneLspSession Durable Object class that the Pages binding points at
// (see apps/studio/wrangler.toml: script_name = "rune-lsp-worker").

export { RuneLspSession } from './session.js';

export default {
  async fetch(): Promise<Response> {
    return new Response('not_found', { status: 404 });
  }
} satisfies ExportedHandler;
```

- [ ] **Step 2: Strip the `[[routes]]` block from `apps/lsp-worker/wrangler.toml`**

The old block:

```toml
[[routes]]
pattern = "www.daikonic.dev/rune-studio/api/lsp/*"
zone_name = "daikonic.dev"
```

Delete it entirely. The Worker no longer needs a public route — it's accessed only via the Pages binding.

- [ ] **Step 3: Delete the moved-to-Pages files**

```bash
git rm apps/lsp-worker/src/auth.ts apps/lsp-worker/src/log.ts
# Test files that exercised the old HTTP handlers come out too:
git rm apps/lsp-worker/test/upgrade.test.ts apps/lsp-worker/test/auth.test.ts \
       apps/lsp-worker/test/handle-session.test.ts
```

(Keep any tests that exercise the DO directly — they're still relevant.)

- [ ] **Step 4: Deploy the stripped Worker**

```bash
pnpm --filter @rune-langium/lsp-worker run deploy
```

This re-deploys the same DO namespace (existing DO instances + their stored state are preserved because migrations are unchanged) but with no HTTP routes attached. The Pages binding from `apps/studio/wrangler.toml` keeps working.

- [ ] **Step 5: Verify the old HTTP routes are gone**

```bash
curl -i "https://www.daikonic.dev/rune-studio/api/lsp/health"
```

Expected: `404` or no response — the route binding is gone.

```bash
curl -i "https://www.daikonic.dev/api/lsp/health"
```

Expected: `200 {"ok":true,...}` — the Pages Function still serves.

- [ ] **Step 6: Verify LSP still works in the studio**

Load `https://www.daikonic.dev/rune-studio/studio/`, click a model, watch network: `POST /api/lsp/session` → 200 mints a token, `GET /api/lsp/ws/<token>` → 101 upgrades. Editor footer shows "Connected (Same-origin)". The DO it routes to is the same one that's existed since spec 014 — Phase 3 didn't move it.

- [ ] **Step 7: Commit**

```bash
git add apps/lsp-worker/
git commit -m "refactor(019 Phase 3): strip apps/lsp-worker HTTP routes; keep DO host"
```

## Task 3.2: Remove studio code references to the old route path

The studio's `config.ts` and `transport-provider.ts` already point at the same-origin Pages Function URLs after Phase 2. Nothing further to do for the studio.

The verify script `scripts/verify-production.sh` still probes the old `$BASE/api/lsp/health` route (which now 404s after Task 3.1 lands). That section was added under spec 014 and tested the OLD apps/lsp-worker.

- [ ] **Step 1: Remove the legacy LSP /health probe**

Open `scripts/verify-production.sh` and delete the entire "Section 7 — LSP Worker /health probe" block (around line 250). The "Section 8 — Spec 019 Pages Functions" block already covers the new endpoint.

- [ ] **Step 2: Commit**

```bash
git add scripts/verify-production.sh
git commit -m "chore: drop legacy LSP /health probe from verify-production.sh"
```

---

# Final Verification

## Task F.1: Full test suite + type-check + lint

- [ ] **Step 1: All tests**

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 2: Type-check**

```bash
pnpm run type-check
```

Expected: PASS.

- [ ] **Step 3: Lint**

```bash
pnpm run lint
```

Expected: PASS.

## Task F.2: CHANGELOG entries

**Files:**
- Modify: `apps/studio/CHANGELOG.md`
- Modify: `packages/lsp-server/CHANGELOG.md` (if it has changes; otherwise skip)

- [ ] **Step 1: Add studio CHANGELOG**

```markdown
## Unreleased

### Added
- `POST /api/parse` Pages Function: server-side `parseWorkspace` with browser fallback.
- `POST /api/lsp/session`, `GET /api/lsp/health`, `GET /api/lsp/ws/[token]` Pages Functions: same-origin LSP server (migrated from `apps/lsp-worker/`).
- `LspConnectionBadge` editor footer component for connection state.

### Changed
- LSP server is now network-only — no in-browser LSP server. `apps/studio/src/workers/lsp-worker.ts` and `apps/studio/src/services/worker-transport.ts` were deleted.
- `transport-provider.ts` simplified from 3 tiers (embedded / websocket / cf-worker) to 2 tiers (pages-function / websocket).
- `lspWsUrl` / `lspSessionUrl` defaults are now same-origin (`/api/lsp/*`).

### Removed
- In-browser LSP worker (~700 lines).
- MessagePort transport for the in-browser LSP (~150 lines).

### Operational
- Old endpoint `www.daikonic.dev/rune-studio/api/lsp/*` returns 308 redirect (HTTP routes) or 410 (WS).
- `apps/lsp-worker/` deploy retired.
```

- [ ] **Step 2: Commit**

```bash
git add apps/studio/CHANGELOG.md
git commit -m "docs: CHANGELOG entries for 019 studio workers → Pages Functions"
```
