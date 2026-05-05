# Lazy Reference Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the parser worker from eager linking (all 141 CDM files fully cross-referenced at startup) to Langium's lazy reference resolution, making large model loading near-instant.

**Architecture:** Pass `eagerLinking: false` to `DocumentBuilder.build()` during the initial workspace parse. This builds to `ComputedScopes` (phase 3) instead of `Linked` (phase 4) — symbols are indexed and scopes are computed, but cross-references resolve lazily on first access via the `.ref` property. A new `linkDocument` worker message enables on-demand linking for the active file when the user selects a type or opens a file for editing.

**Tech Stack:** Langium 4.2.x DocumentBuilder API, Web Worker postMessage protocol, TypeScript

**ADR:** `docs/adr/007-lazy-reference-resolution-for-large-models.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `apps/studio/src/workers/parser-worker.ts` | Modify | Add `eagerLinking: false` to workspace build; add `linkDocument` handler |
| `apps/studio/src/services/workspace.ts` | Modify | Add `linkDocument` worker request function; export new types |
| `apps/studio/src/pages/EditorPage.tsx` | Modify | Trigger `linkDocument` on node selection |
| `apps/studio/test/workers/parser-worker.test.ts` | Modify | Update existing tests + add lazy linking test |

## Pre-implementation audit

The graph adapter (`packages/visual-editor/src/adapters/ast-to-model.ts`) and model helpers (`model-helpers.ts`) exclusively use `$refText` (the text name of the reference), never `.ref` (the resolved AST node). This means the graph, explorer, and inspector are already compatible with lazy resolution — no adapter changes needed.

---

### Task 1: Switch workspace build to lazy linking

**Files:**
- Modify: `apps/studio/src/workers/parser-worker.ts:182`
- Modify: `apps/studio/test/workers/parser-worker.test.ts`

- [ ] **Step 1: Change the build call in `handleParseWorkspace`**

In `apps/studio/src/workers/parser-worker.ts`, line 182, change:

```typescript
await workspace.builder.build(workspace.documents, { validation: false });
```

to:

```typescript
await workspace.builder.build(workspace.documents, { validation: false, eagerLinking: false });
```

This single change makes the workspace parse run through `ComputedScopes` (phase 3) instead of `Linked` (phase 4). References will resolve lazily when accessed.

- [ ] **Step 2: Also update the single-document `handleParse`**

In `apps/studio/src/workers/parser-worker.ts`, line 144, change:

```typescript
await builder.build([document], { validation: false });
```

to:

```typescript
await builder.build([document], { validation: false, eagerLinking: false });
```

This keeps the single-file parse consistent with the workspace parse.

- [ ] **Step 3: Update the parser-worker test assertions**

In `apps/studio/test/workers/parser-worker.test.ts`, the test `builds a single document with validation disabled for parse requests` (line 74) likely asserts on the build call args. Update any assertion that checks for `{ validation: false }` to expect `{ validation: false, eagerLinking: false }`.

Similarly update the test `builds workspace documents with validation disabled and preserves file ordering` (line 96).

Read the test file first to see the exact assertion patterns before modifying.

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @rune-langium/studio test
```

Expected: All tests pass — the lazy linking change doesn't affect the parse output shape (models are still returned with the same structure; references just aren't eagerly resolved).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/workers/parser-worker.ts \
       apps/studio/test/workers/parser-worker.test.ts
git commit -m "perf(studio): switch parser worker to lazy reference resolution

Pass eagerLinking: false to DocumentBuilder.build() so workspace
parsing stops at ComputedScopes (phase 3) instead of Linked (phase 4).
References resolve lazily on first .ref access. For CDM (141 files),
this skips the expensive cross-reference resolution at startup.

Implements Phase 1 of ADR 007."
```

---

### Task 2: Add `linkDocument` message type to the parser worker

**Files:**
- Modify: `apps/studio/src/workers/parser-worker.ts`
- Modify: `apps/studio/test/workers/parser-worker.test.ts`

- [ ] **Step 1: Add the request/response types**

In `apps/studio/src/workers/parser-worker.ts`, after the existing `ParseWorkspaceRequest` type (around line 24), add:

```typescript
export interface LinkDocumentRequest {
  type: 'linkDocument';
  id: string;
  /** URI of the document to link (must have been parsed in a prior parseWorkspace). */
  uri: string;
}

export interface LinkDocumentResponse {
  type: 'linkDocumentResult';
  id: string;
  /** true if the document was found and linked, false if not found. */
  linked: boolean;
  errors: string[];
}
```

Update the `WorkerRequest` union:

```typescript
export type WorkerRequest = ParseRequest | ParseWorkspaceRequest | LinkDocumentRequest;
```

Update the `WorkerResponse` union:

```typescript
export type WorkerResponse = ParseResponse | ParseWorkspaceResponse | LinkDocumentResponse;
```

- [ ] **Step 2: Add the `handleLinkDocument` function**

Add after `handleParseWorkspace`:

```typescript
async function handleLinkDocument(req: LinkDocumentRequest): Promise<LinkDocumentResponse> {
  try {
    const targetUri = URI.parse(req.uri);
    // Look up the document in the shared Langium services first,
    // then fall back to the local (serialized payload) services.
    const langiumDocs = RuneDsl.shared.workspace.LangiumDocuments;
    const doc = langiumDocs.hasDocument(targetUri)
      ? langiumDocs.getDocument(targetUri)
      : undefined;

    if (!doc) {
      return { type: 'linkDocumentResult', id: req.id, linked: false, errors: [] };
    }

    // Build this single document with eager linking enabled.
    // Since the workspace is already at ComputedScopes, this only
    // resolves references for the target document.
    await builder.build([doc], { validation: false, eagerLinking: true });

    const errors: string[] = [];
    for (const diag of doc.diagnostics ?? []) {
      errors.push(diag.message);
    }
    return { type: 'linkDocumentResult', id: req.id, linked: true, errors };
  } catch (error) {
    return {
      type: 'linkDocumentResult',
      id: req.id,
      linked: false,
      errors: [(error as Error).message]
    };
  }
}
```

- [ ] **Step 3: Wire the handler in the message listener**

In the `self.onmessage` handler (around line 260), add the new case:

```typescript
    } else if (req.type === 'linkDocument') {
      response = await handleLinkDocument(req);
    } else {
```

- [ ] **Step 4: Export the new handler and type guard**

Add at the bottom of the file:

```typescript
export function isLinkDocumentResponse(value: unknown): value is LinkDocumentResponse {
  if (!isRecord(value)) return false;
  return value.type === 'linkDocumentResult' && typeof value.id === 'string';
}

export { handleLinkDocument };
```

- [ ] **Step 5: Write a test for `handleLinkDocument`**

In `apps/studio/test/workers/parser-worker.test.ts`, add a new test:

```typescript
it('links a single document on demand after lazy workspace parse', async () => {
  // First: parse workspace with lazy linking
  const wsResult = await handleParseWorkspace({
    type: 'parseWorkspace',
    id: 'ws-link-test',
    files: [
      { name: 'inmemory:///types.rosetta', content: 'namespace test\n\ntype Foo:\n  bar string (1..1)' },
      { name: 'inmemory:///refs.rosetta', content: 'namespace test\n\ntype Bar:\n  foo Foo (1..1)' }
    ]
  });
  expect(wsResult.models).toHaveLength(2);

  // Then: link just the second document
  const linkResult = await handleLinkDocument({
    type: 'linkDocument',
    id: 'link-test',
    uri: 'inmemory:///refs.rosetta'
  });
  expect(linkResult.linked).toBe(true);
});
```

- [ ] **Step 6: Run tests**

```bash
pnpm --filter @rune-langium/studio test
```

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/workers/parser-worker.ts \
       apps/studio/test/workers/parser-worker.test.ts
git commit -m "feat(studio): add linkDocument message to parser worker

New message type that eagerly links a single document after a lazy
workspace parse. Used to resolve cross-references on demand when the
user selects a type or opens a file.

Implements Phase 2 handler of ADR 007."
```

---

### Task 3: Add `linkDocument` to the workspace service

**Files:**
- Modify: `apps/studio/src/services/workspace.ts`

- [ ] **Step 1: Add the `linkDocument` worker request function**

In `apps/studio/src/services/workspace.ts`, import the new types:

```typescript
import {
  isParseResponse,
  isParseWorkspaceResponse,
  isLinkDocumentResponse,
  type LinkDocumentRequest,
  type LinkDocumentResponse
} from '../workers/parser-worker.js';
```

Add a new function after `parseWorkspaceFiles`:

```typescript
/**
 * Request eager linking for a single document in the parser worker.
 * Called when the user selects a type or opens a file — resolves
 * cross-references for that document only (Phase 2 of ADR 007).
 */
export async function linkDocument(uri: string): Promise<{ linked: boolean; errors: string[] }> {
  try {
    const id = String(++requestId);
    const response = await workerRequest({
      type: 'linkDocument',
      id,
      uri
    } as LinkDocumentRequest);

    if (isLinkDocumentResponse(response)) {
      return { linked: response.linked, errors: response.errors };
    }
    return { linked: false, errors: ['Unexpected response from parser worker'] };
  } catch (error) {
    console.warn('[workspace] linkDocument failed:', error);
    return { linked: false, errors: [(error as Error).message] };
  }
}
```

Note: the `workerRequest` function needs to handle `LinkDocumentRequest` as an input type. Check the existing overloads and add one:

```typescript
function workerRequest(msg: LinkDocumentRequest): Promise<LinkDocumentResponse>;
```

Also update the response dispatch inside `workerRequest` to handle `linkDocumentResult`.

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test
```

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/services/workspace.ts
git commit -m "feat(studio): add linkDocument service for on-demand reference resolution"
```

---

### Task 4: Trigger linkDocument on node selection

**Files:**
- Modify: `apps/studio/src/pages/EditorPage.tsx`

- [ ] **Step 1: Import `linkDocument` and call it on selection**

In `apps/studio/src/pages/EditorPage.tsx`, import the new function:

```typescript
import { parseWorkspaceFiles, mergeModelFiles, linkDocument } from '../services/workspace.js';
```

Find the effect that fires when `selectedNodeId` changes (the one that navigates the source editor, around the `prevSelectedRef` logic). After the existing selection handling, add a `linkDocument` call:

```typescript
// After the source editor navigation logic:
const nodeData = selectedNodeData as unknown as Record<string, unknown>;
const docUri = (nodeData as any)?.$container?.$document?.uri?.toString();
if (docUri) {
  void linkDocument(docUri);
}
```

This triggers Phase 2 linking for the document containing the selected node. The call is fire-and-forget (`void`) — linking happens in the background and references resolve lazily in the meantime.

- [ ] **Step 2: Run tests**

```bash
pnpm --filter @rune-langium/studio run type-check && pnpm --filter @rune-langium/studio test
```

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/pages/EditorPage.tsx
git commit -m "feat(studio): trigger on-demand linking when a node is selected

When the user selects a type in the graph or explorer, fire a
linkDocument request to the parser worker. This eagerly resolves
cross-references for that document only, enabling features like
go-to-definition and accurate diagnostics for the active file.

Completes Phase 2 wiring of ADR 007."
```

---

### Task 5: Measure performance improvement

**Files:** None (manual verification)

- [ ] **Step 1: Build and run with CDM corpus**

```bash
pnpm --filter '@rune-langium/studio...' run build
pnpm --filter @rune-langium/studio dev
```

Open the Studio, load CDM (141 files). Measure:
- Time from click to interactive workspace (explorer + graph populated)
- Compare with the previous eager-linking baseline

The expected improvement:
- **Before**: Parse + index + scope + link for 141 files (~2-5 seconds depending on hardware)
- **After**: Parse + index + scope only (~0.5-1 second with serialized artifact)

- [ ] **Step 2: Verify graph renders correctly**

After CDM loads:
- Explorer shows all namespaces and types
- Graph shows nodes with names (via `$refText`, not `.ref`)
- Clicking a type triggers `linkDocument` in the background
- Inspector shows attribute names and type references correctly
- No console errors related to undefined references

- [ ] **Step 3: Verify codegen still works**

Select a CDM type → switch to the Code tab → verify generated TypeScript/Zod output appears. The codegen worker has its own Langium instance that does full linking independently.

- [ ] **Step 4: Document results**

Add a comment to the ADR with measured times, or update the status from "Proposed" to "Accepted" if the improvement is confirmed.

---

## Execution Order

Tasks 1–4 are sequential (each builds on the previous). Task 5 is manual verification.

1. **Task 1** — Switch to lazy linking (the core change, 1 line)
2. **Task 2** — Add `linkDocument` handler to worker
3. **Task 3** — Add `linkDocument` to workspace service
4. **Task 4** — Wire selection → linkDocument in EditorPage
5. **Task 5** — Measure and verify
