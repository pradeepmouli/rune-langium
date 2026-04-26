# Contract — Studio Live-Preview Integration

**Surface**: Integration between `@rune-langium/codegen` and the
Studio's live-preview panel.
**Spec hooks**: FR-016, FR-017, FR-018, US4, SC-004, SC-008.

---

## Overview

The Studio mounts a `CodePreviewPanel` on the right-hand dockview
panel group. The panel:

1. Shows a read-only Monaco editor with the generated output for the
   currently-active Rune document.
2. Provides a `TargetSwitcher` (Zod | JSON Schema | TypeScript).
3. Updates within 500ms of a successful build phase (FR-017).
4. Retains the last-known-good output when the source has parser
   errors (FR-017 fallback).
5. Supports click-to-navigate via source mapping for all three targets
   (FR-018).

---

## When generation runs

Generation is triggered by the Studio's **build-phase listener** — the
Langium document lifecycle event fired after a successful
`DocumentBuilder.build()` in the LSP Worker. The sequence:

```
LSP Worker                     Main Thread
───────────                    ────────────
1. DocumentBuilder.build()
   succeeds (doc is valid)
2. generate(doc, { target })
   runs in the same worker
   (no extra Worker spawn)
3. postMessage({
     type: 'codegen:result',
     target,
     content,
     sourceMap,
   })
                                4. CodePreviewPanel receives message
                                5. Renders content in Monaco read-only editor
                                6. Stores sourceMap in panel state
```

**Debounce**: The worker debounces generation calls with a 200ms
window. Rapid edits (< 200ms apart) coalesce into a single generation
run. This keeps the 500ms end-to-end budget (SC-004) achievable: up
to 200ms debounce + up to ~300ms for generation on a 1000-type model.

**Lazy per-target generation**: The worker generates only the
currently-visible target on each build phase. When the user switches
targets, the worker generates the new target on demand (one additional
generation, not three). This avoids tripling the per-build generation
cost.

---

## Target-switcher protocol

### UI shape

```tsx
// apps/studio/src/components/TargetSwitcher.tsx
type Target = 'zod' | 'json-schema' | 'typescript';

interface TargetSwitcherProps {
  value: Target;
  onChange: (t: Target) => void;
}
```

A segmented-button control with three options. Labels: "Zod",
"JSON Schema", "TypeScript". Default: "Zod".

### State location

Target selection is stored in the Studio's zustand workspace store:

```ts
// apps/studio/src/store — existing store, add:
interface WorkspaceState {
  // ... existing fields
  codePreviewTarget: Target; // persisted per workspace
}
```

Persisted to IndexedDB via the existing workspace persistence layer
so the target selection survives page reload.

### On target switch

When the user selects a new target:

1. The `CodePreviewPanel` sends a message to the LSP Worker:
   ```ts
   { type: 'codegen:generate', target: newTarget }
   ```
2. The worker runs `generate(currentDocuments, { target: newTarget })`
   and posts a `codegen:result` message back.
3. The panel renders the new output; source map is updated.

If the current source has parser errors:
- The worker skips generation and posts:
  ```ts
  { type: 'codegen:outdated', target: newTarget }
  ```
- The panel shows "outdated — fix errors to refresh" status indicator
  and leaves the previously-rendered content for the new target
  blank (there is no prior good output for this target in the error
  state). If a prior good output exists (user edited after a
  successful build), that is retained.

---

## Source-mapping protocol (FR-018)

### Data shape (delivered from worker to panel)

```ts
// Delivered in the 'codegen:result' message
interface CodegenResult {
  type: 'codegen:result';
  target: Target;
  relativePath: string;  // which namespace's output is shown
  content: string;
  sourceMap: SourceMapEntry[]; // from GeneratorOutput.sourceMap
}

interface SourceMapEntry {
  outputLine: number;  // zero-based line in `content`
  sourceUri: string;   // document URI
  sourceLine: number;  // one-based
  sourceChar: number;  // one-based
}
```

### Click-to-navigate handler

```ts
// Pseudocode for the Monaco onMouseDown handler in CodePreviewPanel:
previewEditor.onMouseDown((e) => {
  const clickedLine = e.target.position?.lineNumber; // 1-based Monaco
  if (!clickedLine) return;
  const entry = sourceMap.find(
    m => m.outputLine === clickedLine - 1 // sourceMap is 0-based
  );
  if (!entry) return;
  sourceEditor.revealLineInCenter(entry.sourceLine);
  sourceEditor.setSelection(new monaco.Range(
    entry.sourceLine, entry.sourceChar,
    entry.sourceLine, entry.sourceChar
  ));
});
```

This handler is installed fresh each time a new `codegen:result`
message arrives (replacing any previous handler on the same preview
editor instance).

### Source-map coverage per target

| Target | What gets a source-map entry |
|--------|------------------------------|
| `zod` | Every `<TypeName>Schema` declaration line → the `type TypeName:` Rune line. Every attribute Zod field line → the `attribute` Rune line. Every `.superRefine()` opening line → the first `condition` Rune line on the type. |
| `json-schema` | Every `"$defs/<TypeName>"` key line → the `type TypeName:` Rune line. Every `"properties/<attr>"` key line → the `attribute` Rune line. |
| `typescript` | Every `class <TypeName>` line → the `type TypeName:` Rune line. Every field declaration line → the `attribute` Rune line. Every `validate<CondName>()` method line → the `condition CondName` Rune line. |

---

## Status indicator

The `CodePreviewPanel` renders a one-line status bar above the Monaco
read-only editor:

| State | Indicator text | Colour |
|-------|---------------|--------|
| Last build succeeded; output current | "Generated (Zod)" | green |
| Source has parser errors; showing last good | "Outdated — fix errors to refresh" | amber |
| No output yet (first load, no successful build) | "Generating…" | grey |
| Worker crashed | "Preview unavailable — reload Studio" | red |

The "Worker crashed" state is triggered when the LSP Worker posts an
`error` event or when no `codegen:result` or `codegen:outdated` is
received within 10 seconds of a `codegen:generate` request.

**Studio offline** (edge case in spec): if the LSP Worker crashes
entirely, the `CodePreviewPanel` retains the last-rendered content
and switches to the "Preview unavailable" status. It does NOT blank
(spec edge case requirement).

---

## Integration files

| File | Status | Notes |
|------|--------|-------|
| `apps/studio/src/components/CodePreviewPanel.tsx` | NEW | Panel container; Monaco read-only editor; status indicator |
| `apps/studio/src/components/TargetSwitcher.tsx` | NEW | Segmented control |
| `apps/studio/src/workers/lsp-worker.ts` (or equivalent) | MODIFIED | Add `codegen:generate` / `codegen:result` / `codegen:outdated` message handlers |
| `apps/studio/src/store/workspace-store.ts` | MODIFIED | Add `codePreviewTarget` field |
| `apps/studio/src/shell/layout-factory.ts` | MODIFIED | Register `CodePreviewPanel` in the dockview layout |

---

## Build-phase listener wiring (pseudocode)

```ts
// In the LSP Worker, after DocumentBuilder.build() succeeds:
const currentTarget = getState().codePreviewTarget; // from shared state
const outputs = generate(builtDocuments, { target: currentTarget });
const primary = outputs[0]; // show the first namespace by default
self.postMessage({
  type: 'codegen:result',
  target: currentTarget,
  relativePath: primary.relativePath,
  content: primary.content,
  sourceMap: primary.sourceMap,
});
```

For multi-file workspaces, the preview shows the namespace
corresponding to the **active editor tab**. The tab-change event
triggers a `codegen:generate` message to the worker.
