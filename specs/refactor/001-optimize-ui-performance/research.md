# Research: Optimize UI Performance

## Decision 1: Virtualization Library

**Decision**: Use `@tanstack/react-virtual` (v3.x) with `useVirtualizer` hook

**Rationale**:
- Headless, framework-agnostic core with first-class React bindings
- Supports variable-height rows via `estimateSize` + `measureElement`
- Works with any scrollable container (not just window scroll)
- Active maintenance, high community adoption
- Already used in similar tree virtualization scenarios

**Alternatives Considered**:
- `react-virtualized` — heavier, class-based API, less maintained
- `react-window` — lighter but fixed-size rows only, no dynamic measurement
- Custom IntersectionObserver — too much boilerplate for tree structures

## Decision 2: Tree Flattening Strategy

**Decision**: Flatten the namespace tree into a single array of rows where each row is either a "namespace-header" or a "type-item". The virtualizer operates on this flat array. Expand/collapse toggles filter which rows appear in the flat array.

**Rationale**:
- `useVirtualizer` expects a flat `count` of items — it cannot natively handle nested trees
- Flattening at render time (via `useMemo`) is cheap for 10K items
- Existing `buildNamespaceTree()` returns `NamespaceGroup[]` with nested `types[]` — flatten this
- Row type determines height: namespace headers ~36px, type items ~28px

**Alternatives Considered**:
- Nested virtualizers (one per namespace) — complex, breaks scroll continuity
- Keep current DOM structure, just add lazy rendering — doesn't solve the DOM node count problem

## Decision 3: LSP Batch Notification Mechanism

**Decision**: Keep the existing `syncWorkspaceFiles()` pattern but optimize the refresh logic. Instead of sending N individual `didOpen` calls sequentially, batch them with a single post-batch revalidation trigger.

**Rationale**:
- The current `syncWorkspaceFiles()` already batches conceptually — it iterates files and sends `didOpen`/`didChange`/`didClose` in a loop
- The real performance issue is the **refresh loop** at the end that sends `didChange` to ALL unchanged files when new files are added (lines 179-189 of lsp-client.ts)
- True LSP workspace folders (`workspace/didChangeWorkspaceFolders`) won't help in the browser — Langium's `DefaultWorkspaceManager` expects file system access
- Better approach: debounce the refresh, or use a single custom notification to trigger revalidation

**Alternatives Considered**:
- Custom LSP notification `workspace/revalidate` — requires server-side changes, more invasive
- Remove refresh entirely — breaks cross-file reference diagnostics for early-loaded files
- Langium workspace folders — not feasible in browser environment (no FS)

## Decision 4: Progress Indication Pattern

**Decision**: Use a simple progress bar with file count (e.g., "Loading 42/142 files...") in the FileLoader component. Track progress via callback from chunked `readFileList()`.

**Rationale**:
- File reading is the blocking operation (File API is async per-file)
- Chunked reading (e.g., 10 files at a time) allows progress updates between chunks
- Progress bar is more informative than a spinner for operations with known total count

**Alternatives Considered**:
- Indeterminate spinner — less informative, no sense of progress
- Streaming progress with percentage — overly complex for file count operations

## Decision 5: DiagnosticsPanel Virtualization

**Decision**: Apply the same `@tanstack/react-virtual` pattern to DiagnosticsPanel. Flatten diagnostics into a single list of rows and virtualize.

**Rationale**:
- Same problem as namespace explorer — all diagnostics rendered as DOM elements
- Same solution works — flat list of diagnostic items with `useVirtualizer`
- Simpler than the tree case since diagnostics are already a flat list (grouped by file)
- Existing tests cover rendering behavior; virtualization preserves the same props API

**Alternatives Considered**:
- Pagination — worse UX, breaks Ctrl+F search expectations
- Lazy loading on scroll — more complex than virtualization with no real benefit
