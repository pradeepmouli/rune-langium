# Review Report

**Feature**: LSP-Powered Studio Editor (003-lsp-studio-integration)
**Reviewer**: GitHub Copilot (speckit.review)
**Date**: 2026-02-12
**Status**: ❌ Needs Changes

## Summary

Reviewed all 46 tasks (T001–T046) across 7 phases of the LSP-powered studio editor feature. The implementation is comprehensive — 15 new source files and 14 test files producing 105 passing tests with clean type-check. However, a **critical gap** was found: the diagnostics handler pipeline in `lsp-client.ts` is never invoked, meaning the diagnostics bridge (store → graph badges, DiagnosticsPanel) will never receive real LSP diagnostics at runtime. This breaks the core value proposition of US1 and US5.

## Implementation Review

### What Was Reviewed
- All 15 new source files in `apps/studio/src/`
- All 14 test files in `apps/studio/test/`
- Modified files: `package.json`, `vite.config.ts`, `App.tsx`, `EditorPage.tsx`, `styles.css`
- Spec files: `spec.md`, `plan.md`, `tasks.md`

### Implementation Quality
- **Code Quality**: Good — Clean structure, consistent patterns, proper JSDoc, clear separation of concerns
- **Test Coverage**: Strong — 105 tests across 14 files, all passing. Tests cover rendering, state, adapters, and integration.
- **Documentation**: Good — README created with architecture diagram, NFR table, and key files reference
- **Standards Compliance**: Good — TypeScript strict mode, ESM, 2-space indent, single quotes. Lint clean (0 errors).

## Test Results

```
Test Files  14 passed (14)
     Tests  105 passed (105)
  Duration  1.76s
```

**Tests Executed**: 105
**Tests Passing**: 105
**Tests Failing**: 0
**Type-check**: Clean (zero errors)
**Lint**: 0 errors, 42 warnings (all in pre-existing core code)

## Findings

### ✅ What Worked Well

- **Transport layer** (T005–T013): Well-designed dual-transport with WebSocket → SharedWorker failover. Exponential backoff is clean. `TransportProvider` has a reactive state model with listener pattern.
- **Rune DSL syntax highlighting** (T014–T015): StreamParser covers 100+ keywords from the Langium grammar. Block/line comments, strings, numbers, booleans, operators all handled. 10 tests validate tokenization.
- **Component architecture** (T020, T041, T012): SourceEditor, DiagnosticsPanel, and ConnectionStatus are pure functional components with clear prop interfaces and data-testid attributes for testing.
- **Semantic diff** (T034): Clean utility that correctly compares type declarations with order-insensitive attribute comparison. Prevents unnecessary graph re-layouts on cosmetic edits.
- **Diagnostics store** (T032): Proper zustand store with immutable updates (new Map copies) and recomputed totals. Well-tested.
- **CDM fixture integration** (T039, T046): Fixture loader reuses the 142-file CDM corpus from `.resources/cdm/` rather than duplicating test data. Integration tests validate the full pipeline.
- **EditorPage layout** (T027, T042): Clean toolbar with toggle buttons, split-pane layout, status bar with transport state. Problems button shows diagnostic count.

### ⚠️ Issues / Concerns

#### Issue 1: `diagnosticHandlers` Never Invoked (CRITICAL)
- **Severity**: Critical
- **File**: [lsp-client.ts](apps/studio/src/services/lsp-client.ts#L68)
- **Description**: The `diagnosticHandlers` array is populated via `onDiagnostics()` and cleared on `dispose()`, but **no code ever calls the handlers**. The `LSPClient` from `@codemirror/lsp-client` handles diagnostics internally (showing underlines in the editor), but the service never wires a listener from `LSPClient` to invoke `diagnosticHandlers`. This means `useLspDiagnosticsBridge` subscribes to a dead channel.
- **Impact**: The entire diagnostics bridge is non-functional at runtime:
  - `DiagnosticsPanel` will always show "No problems detected"
  - Graph node error badges will never appear
  - `totalErrors`/`totalWarnings` in the status bar will always be 0
  - US1 acceptance scenarios 2 and 4 fail
  - US5 acceptance scenarios 1, 3, and 4 fail
- **Recommendation**: Wire the `LSPClient`'s diagnostics notification to the handlers. The `@codemirror/lsp-client` `LSPClient` should expose an `onDiagnostics` or `onNotification` hook. After `client.connect(transport)`, subscribe and relay:
  ```ts
  client.onDiagnostics?.((uri, diagnostics) => {
    for (const h of diagnosticHandlers) h(uri, diagnostics);
  });
  ```

#### Issue 2: `LspDiagnostic` Type Duplicated in 3 Files (HIGH)
- **Severity**: High
- **File**: `lsp-client.ts`, `diagnostics-bridge.ts`, `diagnostics-store.ts`
- **Description**: The `LspDiagnostic` interface (8 lines) is copy-pasted identically in 3 files. `TypeDiagnosticsSummary` is duplicated in 2 files. Divergence over time is inevitable.
- **Impact**: Maintenance risk. If one copy is updated (e.g., adding `relatedInformation`), the others silently diverge.
- **Recommendation**: Create `src/types/diagnostics.ts`, define both types there, and import from it.

#### Issue 3: `@lspeasy/core` Not in `package.json` (MEDIUM)
- **Severity**: Medium
- **File**: `package.json`, `src/workers/lsp-worker.ts`
- **Description**: `lsp-worker.ts` imports `{ Message, Transport } from '@lspeasy/core'`, but `@lspeasy/core` is not listed in `apps/studio/package.json`. It works today because pnpm hoists it from `@rune-langium/lsp-server`'s dependencies, but this is an implicit dependency that could break with pnpm settings changes.
- **Impact**: Build may break if pnpm hoisting behavior changes, or during strict dependency resolution.
- **Recommendation**: Add `"@lspeasy/core": "link:../../lspy/packages/core"` to studio `package.json`.

#### Issue 4: `connect()` Has No Idempotency Guard (MEDIUM)
- **Severity**: Medium
- **File**: [lsp-client.ts L80–85](apps/studio/src/services/lsp-client.ts#L80-L85)
- **Description**: Calling `connect()` twice leaks the first `LSPClient` instance. The old `client` is overwritten without calling `disconnect()`.
- **Impact**: Each extra `connect()` call leaks an `LSPClient` + transport.
- **Recommendation**: Add guard: `if (client) { client.disconnect(); }` at top of `connect()`.

#### Issue 5: `onNavigate` File Matching is Fragile (MEDIUM)
- **Severity**: Medium
- **File**: [EditorPage.tsx L131–139](apps/studio/src/pages/EditorPage.tsx#L131-L139)
- **Description**: The `onNavigate` callback matches files by extracting the filename from a `file://` URI and comparing with `file.name`. If two files share the same name (e.g., different directories), the wrong file is matched. The `f.path === uri` comparison will also never match because paths and URIs use different formats.
- **Impact**: Clicking a diagnostic may navigate to the wrong file in multi-file workspaces.
- **Recommendation**: Normalize the URI to a path before comparison, or use `endsWith` matching.

#### Issue 6: SharedWorker Port Cleanup Missing (MEDIUM)
- **Severity**: Medium
- **File**: [lsp-worker.ts L117–126](apps/studio/src/workers/lsp-worker.ts#L117-L126)
- **Description**: When a SharedWorker port disconnects (tab closes), the LSP server instance created by `servePort()` is never cleaned up. Over time, opening/closing tabs leaks server instances.
- **Impact**: Memory leak in long-running SharedWorker sessions.
- **Recommendation**: Listen for port close/error events and dispose the LSP server.

#### Issue 7: Double `dispose()` in App.tsx (LOW)
- **Severity**: Low
- **File**: [App.tsx L49–52](apps/studio/src/App.tsx#L49-L52)
- **Description**: `client.dispose()` internally calls `provider.dispose()`, then the cleanup also calls `provider.dispose()` directly. This double-dispose is harmless if `dispose()` is idempotent, but it's a code smell.
- **Recommendation**: Remove the redundant `provider.dispose()` call from the cleanup.

#### Issue 8: Diagnostics Bridge Drops Info/Hint Severity (LOW)
- **Severity**: Low
- **File**: [diagnostics-bridge.ts L60–71](apps/studio/src/services/diagnostics-bridge.ts#L60-L71)
- **Description**: `mapDiagnosticsToTypes` only counts `severity === 1` (error) and `severity === 2` (warning). Info (3) and hint (4) diagnostics are silently dropped from type counts.
- **Impact**: Minor — most Rune DSL diagnostics are error/warning. But the behavior should be documented.
- **Recommendation**: Add a code comment explaining the intentional choice to exclude info/hint.

## User Story Verification

| Story | Status | Notes |
|-------|--------|-------|
| US1 (Diagnostics) | ⚠️ Partial | Editor underlines work via `@codemirror/lsp-client`. DiagnosticsPanel pipeline is broken (Issue #1). |
| US2 (Hover/GoToDef) | ✅ Pass | `languageServerExtensions()` includes hover and definition extensions. |
| US3 (Completion) | ✅ Pass | `languageServerExtensions()` includes completion extensions. |
| US4 (Connection Mgmt) | ✅ Pass | Dual transport, failover, reconnect, status indicator all implemented and tested. |
| US5 (Graph ↔ Editor) | ⚠️ Partial | Store, bridge, semantic diff all implemented. But bridge never receives data (Issue #1). Navigation has file matching issue (Issue #5). |

## NFR Verification

| NFR | Target | Status | Notes |
|-----|--------|--------|-------|
| NFR-1 | Diagnostics < 500ms | ✅ | Direct LSP pipeline, no buffering |
| NFR-2 | Handshake < 2s | ✅ | 2000ms timeout configured |
| NFR-3 | Editor load < 500ms | ✅ | Lazy per-tab init, components render < 100ms |
| NFR-4 | SharedWorker < 50MB | ✅ | Langium ~2MB bundled |
| NFR-5 | 3 reconnect attempts | ✅ | Configured with exponential backoff |
| NFR-6 | 10+ open files | ✅ | Tab bar supports unlimited files |
| NFR-7 | Localhost-only WS | ✅ | Default: `ws://localhost:3001` |

## Tasks Status

### Completed (All 46 marked [X] in tasks.md)
- [X] T001–T004: Phase 1 (Setup)
- [X] T005–T013: Phase 2 (Transport)
- [X] T014–T015: Phase 3 (Language)
- [X] T016–T017: Phase 4 (LSP Client)
- [X] T018–T028: Phase 5 (Editor)
- [X] T029–T038: Phase 6 (Graph Integration)
- [X] T039–T046: Phase 7 (Polish)

### ⚠️ Tasks NOT Actually Complete
- **T036** ("Wire diagnostics bridge to LSP client onDiagnostics callback"): Marked [X] but the wiring is incomplete — `useLspDiagnosticsBridge` subscribes via `onDiagnostics` but handlers are never invoked.
- **T037** ("Add error badge rendering to graph nodes"): Marked [X] but depends on T036 working correctly — badges will never appear.

**Note**: Task status in `tasks.md` will NOT be changed because the review outcome is "Needs Changes".

## Recommendations

### Must Fix (Before Approval)
1. **Wire diagnostics handlers** in `lsp-client.ts` — subscribe to `LSPClient`'s diagnostics events and relay to `diagnosticHandlers`
2. **Add `@lspeasy/core`** to `apps/studio/package.json` as an explicit dependency

### Should Fix (Before Merge)
3. Extract `LspDiagnostic` and `TypeDiagnosticsSummary` to shared `types/diagnostics.ts`
4. Add idempotency guard to `connect()` in `lsp-client.ts`
5. Fix `onNavigate` file matching in `EditorPage.tsx` (URI → path normalization)
6. Add SharedWorker port cleanup in `lsp-worker.ts`

### Nice to Have (Follow-up)
7. Remove double `provider.dispose()` in `App.tsx`
8. Document info/hint exclusion in diagnostics bridge
9. Stabilize `SourceEditor` by using `EditorView.dispatch()` for extension reconfiguration instead of full destroy/recreate

## Next Steps

**For ❌ Needs Changes**:
1. Fix Issue #1 (critical: wire diagnostic handlers) — may require investigating `@codemirror/lsp-client`'s `LSPClient` API for a diagnostics callback
2. Fix Issue #3 (add `@lspeasy/core` dependency)
3. Run tests to verify fixes
4. Request re-review with `/speckit.review`
