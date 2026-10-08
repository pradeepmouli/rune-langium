# Function and Condition Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task, inline as previously requested by the user. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix wrong-operation saves and replace fragmented expression panels with continuous Rune editing, a scoped builder dialog and truthful language projections.

**Architecture:** Core provides source regions and canonical scope. Studio binds those regions to the owning workspace file, reuses CodeMirror/LSP and the codegen worker, and hosts one shared expression workspace. Visual-editor remains an embeddable form/builder package with host slots. Python projection is a separate backend deliverable with its own [plan](2026-10-08-python-expression-projections.md).

**Tech Stack:** Existing React, CodeMirror 6, Langium, Base UI design-system, RHF/zod-to-form, Mutative/zundo, browser workers and hosted LSP. No new JavaScript dependencies.

**Spec:** [Function and Condition Editing Redesign](../specs/2026-10-08-expression-editing-design.md).

## Global Constraints

- DRY is the primary correctness rule; reuse authoritative parse, source, scope and codegen paths.
- Runtime engines: `^22.22.2 || ^24.15.0 || >=26.0.0`; package manager: `pnpm@11.5.0`.
- No dependency upgrades or generated AST/schema edits are part of this redesign.
- New `packages/` source is MIT; new `apps/studio/` source is FSL-1.1-ALv2. Studio is source-available.
- Preserve dirty primary checkouts, attached peer edits, `.resources` and user browser tabs.
- Invalid drafts and unsupported reverse edits never silently become different Rune logic.
- Documentation and continuity changes travel with their implementation task.

## Review Focus

- Two files sharing one namespace: changing a body changes only its owning file (Task 2).
- Temporarily invalid text and out-of-order parses: retain typed text and reject stale model/projection results (Tasks 2 and 5).
- Source and Inspector mounted together: one LSP change owner, correct offsets and no lost final edit on disposal (Task 3).
- Condition reorder/delete, declaration rename and workspace switch while a dialog is open: stale Apply never targets another expression (Task 4).
- Curated/source-less/dispatch functions: hydrate before display, retain read-only capabilities and resolve the actual signature/output (Tasks 2–5).

## File and responsibility map

| Area | Files | Responsibility |
| --- | --- | --- |
| Interim save fix | `packages/visual-editor/src/{types.ts,store/editor-store.ts,components/editors/FunctionForm.tsx}` | Correctly indexed legacy operation commits |
| Source location | new `packages/core/src/utils/source-regions.ts`, core barrel | CST-based function implementation and expression regions |
| File binding | new `apps/studio/src/services/expression-document.ts` | Revision-checked file edits and source ownership |
| CodeMirror view | new `apps/studio/src/components/editing/RuneRegionEditor.tsx`, new `apps/studio/src/lang/document-extensions.ts`, `SourceEditor.tsx`, `services/lsp-client.ts` | Shared editor extensions, protected region, LSP ownership |
| Forms | `FunctionForm.tsx`, `ConditionSection.tsx`, `EditorFormPanel.tsx`, visual-editor public barrels/types | Function-body and condition host slots, compact rule selection |
| Shared UX | new `apps/studio/src/components/editing/{ExpressionWorkspace,ExpressionBuilderDialog}.tsx`, `ExplorePerspective.tsx` | Toolbar, dialog draft, source/projection views |
| Builder | existing `packages/visual-editor/src/components/editors/expression-builder/*`, adapters and hook | Canvas/draft reuse, correct scope, exact-text unsupported leaves |
| Projection | new `packages/codegen/src/projection/{types,typescript}.ts`, `types.ts`, TS emitter, export barrel; worker/service/store in Studio | Canonical generated code with region provenance and capabilities |

The new projection directory also houses the Python backend from the companion plan. Avoid moving unrelated editor, graph or workbench code.

Before implementation, refresh the target branch from current master in the attached or a suitable isolated checkout. Recheck the listed interfaces against that revision and coordinate with any ongoing visual work; do not copy or reset the dirty primary checkout. This plan was grounded in the reviewed 709f8583 tree, not a claim that the target branch cannot change.

## Shared contracts

Define these once in Task 2; subsequent tasks consume them without alternate forms:

```ts
// packages/core/src/utils/source-regions.ts
type SourceRegion = Readonly<{ from: number; to: number }>;
type ExpressionRegion = Readonly<{
  region: SourceRegion;
  kind: 'alias' | 'precondition' | 'operation' | 'postcondition';
  index: number;
  expression: RosettaExpression;
}>;
getFunctionImplementationRegion(func: RosettaFunction, source: string): SourceRegion;
getExpressionRegions(owner: Data | RosettaFunction): readonly ExpressionRegion[];

// apps/studio/src/services/expression-document.ts
type DocumentBinding = Readonly<{
  workspaceGeneration: number; uri: string; nodeId: string;
  revision: number; source: string; region: SourceRegion; readOnly: boolean;
}>;
type DocumentEdit = Readonly<{
  binding: DocumentBinding; region: SourceRegion;
  expectedText: string; replacement: string;
}>;
type CommitResult = { ok: true } | {
  ok: false; reason: 'stale' | 'read-only' | 'missing-source' | 'invalid-range';
};
applyDocumentEdit(edit: DocumentEdit): CommitResult;
```

The service is constructed once per active workspace with current generation/file lookup and the existing source-change callback; it does not import React or own another model store. Revisions are monotonically increasing controller metadata for file-content changes, not wall-clock timestamps. Builder commit checks both revision and expected range text. Live text transactions map regions while parsing is pending. A new parse rebases only against that same file revision, never a newer draft.

## Task 1: Correct legacy operation commits

**Files:** Modify `packages/visual-editor/src/types.ts`, `src/store/editor-store.ts`, `src/components/editors/FunctionForm.tsx`; test `test/store/editor-store-actions.test.ts` and `test/editors/FunctionForm.test.tsx`; create `packages/visual-editor/test/fixtures/function-multi-operation.rosetta` with upstream source/revision attribution, retaining the corpus's Apache licensing.

**Interfaces:** Change `updateExpression(nodeId: string, expressionText: string, operationIndex?: number): void`; omission retains the existing operation-0/empty-function compatibility behavior. Existing operations use their explicit index. An explicit invalid index throws RangeError before mutation. Each operation's draft/error is independently keyed; do not reuse a single form field for multiple bodies.

- [ ] Add regression `editing operation 1 leaves operation 0 and sibling operations unchanged` using the actual component and builder; move the verified CDM reproduction into normal tests, with a checked-in fixture so CI does not depend on `.resources`.
- [ ] Add assertions for `add`, nested assignment paths, empty function creation, out-of-range RangeError with zero mutations and undo/redo. Store calls must preserve operation target/path/add and unchanged expression bytes.

  Core regression assertions after editing the second expression to `42`:
  `expect(after.operations[0]).toEqual(before.operations[0]);`
  `expect(after.operations[1].expression.text).toBe('42');`
  `expect(after.operations.slice(2)).toEqual(before.operations.slice(2));`
- [ ] Run `pnpm --filter @rune-langium/visual-editor exec vitest run test/store/editor-store-actions.test.ts test/editors/FunctionForm.test.tsx`; the new multi-operation assertion must fail before the fix.
- [ ] Implement the indexed action and per-operation commit state. Display complete targets using the canonical operation renderer/path helpers, rather than root-only strings.
- [ ] Rerun the two tests and `pnpm --filter @rune-langium/visual-editor run type-check`; all pass. Commit `fix(visual-editor): target the edited function operation` with only this task's files.

This is a bounded correctness deliverable. It does not claim to provide complete body editing; Task 3 removes the fragmented Studio path.

## Task 2: Bind implementation and condition regions to their owning file

**Files:** Create `packages/core/src/utils/source-regions.ts` and `packages/core/test/utils/source-regions.test.ts`; modify `packages/core/src/index.ts`. Create `apps/studio/src/services/expression-document.ts` and `apps/studio/test/services/expression-document.test.ts`; modify workspace parsing to retain exact input snapshots. Host integration in `ExplorePerspective.tsx` and its source-sync tests belongs to Task 3, together with the editor that consumes the binding.

**Interfaces:** Produce the contracts above. Bind by existing `nodeIdToFilePath`/`resolveNodeFile` and parsed document identity, not `namespaceToFile`. Commit through `handleSourceChange(path, content)`. Use core CST utilities and original-source offsets; never search for a function name with regex or reconstruct existing source with a renderer.

- [ ] Write failing region tests for aliases → preconditions → operations → postconditions; comments before/among statements; CRLF; non-BMP text; a native/empty body; no output; dispatch/extends; neighboring declarations. Exact region slicing retains original text and excludes the signature and next declaration. Empty bodies get a zero-length insertion region.
- [ ] Write service tests asserting byte-identical prefix/suffix and sibling files, especially two files with one namespace. Add stale revision, wrong workspace, missing source, read-only and invalid-range rejection; rejection performs zero writes. While a newer/invalid body draft exists, signature and rule-list structural actions are unavailable with an explanation and cannot trigger an old graph-source overwrite; text editing remains enabled.

  `stale revision does not write`: `expect(applyDocumentEdit(staleEdit)).toEqual({ok: false, reason: 'stale'}); expect(writes).toHaveLength(0);`
  `same namespace retains the other file`: `expect(filesAfter.get(siblingPath)).toBe(filesBefore.get(siblingPath));`
- [ ] Run `pnpm --filter @rune-langium/core exec vitest run test/utils/source-regions.test.ts` and `pnpm --filter @rune-langium/studio exec vitest run test/services/expression-document.test.ts test/pages/EditorPage-source-sync.test.tsx`; new APIs/tests fail until implemented.
- [ ] Implement the region helpers and binding service. Use existing workspace generations and parser reconciliation; expose current source immediately on typing, including invalid drafts. Do not send new body edits through namespace-wide graph serialization. Preserve dirty text across pending parses and selection changes.
- [ ] Guard missing/unhydrated source at the service boundary; host-level lazy curated-source recovery and structural-action guards are validated in Task 3, where the region editor exists. Rerun the tests, build core and run affected type checks. Commit `feat(studio): bind expression edits to source document regions`.

## Task 3: Continuous CodeMirror editing and independent data rules

Consume Task 2 snapshot metadata: stale/invalid drafts disable structural forms without disabling Rune typing. Validate lazy curated-source recovery, missing-source behavior, and same-namespace file locality through the actual host.

**Files:** Create `apps/studio/src/components/editing/RuneRegionEditor.tsx`, `apps/studio/src/lang/document-extensions.ts` and tests `apps/studio/test/components/RuneRegionEditor.test.tsx`; modify `SourceEditor.tsx`, `services/lsp-client.ts` and existing LSP tests. Add `FunctionBodyEditorSlotProps`/`renderFunctionBodyEditor` in visual-editor `types.ts`, FunctionForm, EditorFormPanel and public barrels. Modify ConditionSection and add condition/editor tests. Create `ExpressionWorkspace.tsx` and integrate ExplorePerspective.

**Interfaces:** `RuneRegionEditor` consumes a `DocumentBinding`, `onContentChange(path, fullSource)` and selection notifications in full-file offsets. `FunctionBodyEditorSlotProps` is `{nodeId: string; readOnly: boolean}`; Studio resolves the source binding. Existing `renderExpressionEditor` remains supported for external embedders. Add optional `target: {nodeId: string; kind: 'precondition'|'postcondition'; index: number}` to condition slot props. The host resolves this to a file-revision/region identity; a captured index alone never authorizes a later commit. Add `structuralEditsDisabled?: boolean` to host form props for pending/invalid drafts, distinct from actual source read-only capability.

Add `LspClientService.claimDocumentView(uri, view, configurePlugin): () => void`, where `configurePlugin` accepts `Extension | null`. Focus transfers the single plugin owner, flushing outgoing unsynced changes before detaching it. Disposal checks view identity before untracking a URI. Reuse `getPlugin`, LspProvider's lifecycle and `StudioWorkspace.nextFileVersion`.

- [ ] Write a CodeMirror test showing ten operations plus aliases/pre/postconditions in one buffer, editable paths, paste across statements, indentation, selection/search and undo. Assertions inspect `EditorState.doc`, not virtualized `.cm-content` text.

  `one implementation editor`: `expect(screen.getAllByTestId('implementation-editor')).toHaveLength(1); expect(view.state.doc.toString()).toContain('alias relativeDate:');`
- [ ] Add simultaneous Source/Inspector LSP tests: one didChange owner, monotonically increasing versions, correct full-file completion/diagnostic coordinates, reconnect, focus transfer, and closing one view leaves the other synchronized. External updates do not add duplicate undo history; the final edit survives immediate unmount.
- [ ] Add data-rule tests: select/reorder/remove/add preserves identity, only one expression editor mounts, names/descriptions retain schema validation, and mode state does not leak between rules. Test invalid Rune text survives a failed parse and workspace switches invalidate pending results.
- [ ] Run `pnpm --filter @rune-langium/studio exec vitest run test/components/RuneRegionEditor.test.tsx test/components/SourceEditor.test.tsx test/services/lsp-client.test.ts` and the affected visual-editor form tests; confirm new assertions fail.
- [ ] Extract the existing extension configuration. Keep the full file in each CM document; conceal/protect outside-region text, map region changes using transactions and reject user changes across the boundary. Authoritative workspace updates can update the full file. Reuse theme, Rune language, diagnostics, navigation and drop behavior. Provide Open in Source for changes outside the implementation region.
- [ ] Mount one function Implementation host slot, replacing Studio's operation/alias cards and duplicate function Conditions section. Keep external fallback functionality correct. Mount the compact data-rule list and active editor. Remove Explore's global builder/lens toggle and duplicate text surfaces.
- [ ] Run affected suites, builds and type checks. Commit `feat(studio): provide continuous Rune implementation editing`.

## Task 4: Scoped builder dialog with safe Apply/Cancel

**Files:** Create `apps/studio/src/components/editing/ExpressionBuilderDialog.tsx` and `apps/studio/test/components/ExpressionBuilderDialog.test.tsx`; modify ExpressionWorkspace, existing visual-editor ExpressionBuilder/useExpressionBuilder/ReferencePicker and adapter tests. Create `packages/visual-editor/src/adapters/expression-scope.ts` and its tests; add a core scope utility only where the authoritative scope service lacks a public entry point.

**Interfaces:** Dialog consumes `{binding, target: ExpressionRegion, scope, onApply(DocumentEdit), onClose}`. `ExpressionScope` gains data attributes with canonical declaration identities; function scope uses core `getFunctionSignature` and the real output name. A new open session owns a draft store; workspace callbacks are invoked only by Apply. The builder canvas is shared with the existing component, not copied.

- [ ] Add tests for editing a later operation/alias/condition, Apply as one undo entry, Cancel/Escape as zero edits, reopen reseeding, keyboard focus return, read-only guards and the exact stale-source message in the spec. Cover reordered/deleted conditions and workspace changes while open.

  `Cancel leaves the source unchanged`: `expect(writes).toHaveLength(0); expect(currentSource).toBe(sourceBeforeOpening);`
  `stale Apply preserves the draft`: `expect(writes).toHaveLength(0); expect(screen.getByText('The source changed. Reopen the builder to apply this draft.')).toBeVisible();`
- [ ] Add scope cases for an actual output named `adjustableOrRelativeDate`, inherited/dispatch inputs, earlier aliases, own/inherited Data attributes, enum members and cross-namespace calls. Use canonical core resolution; never add a parallel React resolver.
- [ ] Add an unsupported-node round-trip test: unchanged dialog Apply preserves its exact Rune text, including comments, and editing a supported sibling preserves that opaque node. Add builder/text switching tests that catch stale internal tree overwriting the draft.
- [ ] Run `pnpm --filter @rune-langium/studio exec vitest run test/components/ExpressionBuilderDialog.test.tsx` and `pnpm --filter @rune-langium/visual-editor exec vitest run test/expression-builder`; confirm new behavior is red.
- [ ] Implement the dialog, isolated draft lifecycle and scope. Use the caret/selection's parsed expression region. Apply validates current revision/text and parses the candidate expression using core before committing through Task 2. Invalid drafts stay visible with diagnostics. Opaque nodes cannot be silently serialized differently.
- [ ] Apply the spec's 1120px/16px sizing, responsive stacking and design-system primitives. Keep operator/reference popovers inside the dialog. Rerun tests/type checks; commit `feat(studio): edit scoped expressions in a builder dialog`.

Rendering ruling (2026-10-08): Task 5 also specializes the canonical emitter to prefer native scalar operators and faithful collection expressions, shared by display and export. Do not create a second approximate display transpiler. Add execution regressions for scalar, nullable, collection, structured and metadata equality. Existing semantics remain protected by the pinned execution corpus.

## Task 5: Complete TypeScript display with separate reverse-edit capability

**Files:** Create `packages/codegen/src/projection/types.ts` and `typescript.ts`; modify `types.ts`, `emit/ts-emitter.ts`, `export.ts` and relevant source-map tests. Modify `apps/studio/src/workers/codegen-worker.ts`, `services/codegen-service.ts`, `store/codegen-store.ts`, ExpressionWorkspace and LanguageLensEditor. Create `packages/codegen/test/projection/typescript.test.ts` and `apps/studio/test/components/ExpressionWorkspace.test.tsx`.

**Interfaces:** Define `GeneratedProjection` with `{language: 'typescript'|'python'; subject: {uri,nodeId,region}; code: string; sourceMap: SourceMapEntry[]; requiredHelpers: readonly string[]}`. Condition projection metadata is recorded during authoritative emitter traversal using its complete transpiler context. Function projection selection reads `GeneratedFunc.fileContents` and actual `exportName`; do not scrape generated text by regex.

Define `ProjectionState` using a `status` discriminant: `loading`, `ready` (projection, revision, `editable: false`), `stale` (last valid projection), or `error` (actual diagnostics). Optional foreign expression editing is an explicit dialog action using existing renderTs/renderPy/parseTs/parsePy contracts; it is never inferred from GeneratedProjection availability.

- [ ] Add pinned linked fixtures for Abs, Min, FilterQuantityByCurrency, a function call, constructor, choice rule, alias chain, nested set/add and pre/postconditions. Assert full typed function output equals actual GeneratedFunc output and condition output uses the same emitted predicate. None receives a reversible-subset display refusal.

  `Abs display uses generated code`: `expect(projection.code).toBe(generatedFunc.fileContents); expect(state.status).toBe('ready');`
- [ ] Add worker/UI tests for cache reuse across tab clicks, invalidation when dependencies or source change, ignored out-of-order responses, inherited signatures, callable/type name collisions and read-only curated display. A failed generation exposes its actual diagnostics.
- [ ] Add safety tests for the reverse-edit action: an out-of-subset foreign draft performs zero writes; accepted edits reparse/schema-validate and replace only the captured region. Whole foreign function-body editing remains disabled and is labelled as generated/read-only, not unrenderable.
- [ ] Run `pnpm --filter @rune-langium/codegen exec vitest run test/projection/typescript.test.ts test/func-fidelity-matrix.test.ts` and `pnpm --filter @rune-langium/studio exec vitest run test/components/ExpressionWorkspace.test.tsx test/components/LanguageLensEditor.test.tsx`; confirm new display assertions fail first.
- [ ] Implement projection metadata/selection and worker request reuse. Consume the valid linked model snapshot, not isolated text. Cache by the full identity in the spec, expose stale projections without overwriting drafts, and remove the misleading blanket message from the shared workspace. Keep strict lens refusal only on attempted reverse edits.
- [ ] Rebuild codegen, rerun tests and strict pinned compilation, and run Studio's worker reference parity test. Commit `feat(codegen): expose authoritative expression projections`.

## Task 6: Corpus, browser and delivery gates

**Files:** Add `apps/studio/test/e2e/expression-workspace.spec.ts`; extend `apps/studio/test/prod-ux/journeys/j10-expression-lens.spec.ts`; add `packages/codegen/test/projection/corpus-coverage.test.ts`. Update `docs/agents/architecture.md`, workflow, and the older lens design/Phase 2 plan with concise links to the superseding contract.

**Interfaces:** Consume all main tasks and the companion Python backend. Report display coverage separately from accepted reverse-edit coverage. Derive the expression-kind census from the generated AST reflection/grammar, not a second hand-maintained type list.

- [ ] Add browser journeys using checked-in pinned CDM slices plus their linked dependencies: ten-operation editing, an alias/condition/body edit in one buffer, data-choice rule, supported TS/Python projection, builder Apply/Cancel/stale draft, file-local byte checks and undo. Include separate Source/Inspector panes and curated read-only cases.
- [ ] Add 1280px and narrow-pane screenshots, keyboard-only navigation and axe checks for toolbar/dialog. Confirm no clipping, repeated mode/scope controls, textarea-only fallback, ResizeObserver error or lost focus. Exercise theme/zoom using existing production UX conventions.
- [ ] Run scoped lint, formatting and type checks for changed packages; run core, visual-editor, codegen and Studio affected suites. Rebuild consumers after generator changes. Run `pnpm run verify:codegen-corpus` after TS generation changes, and the companion Python parse/execution gate. Record commands, skips, pins and measured coverage.
- [ ] Require zero unexplained display refusals for valid linked corpus expressions and no unknown expression kinds. Parser/linking failures remain separately reported; neither aggregate percentages nor expected READ_ONLY lens classifications substitute for this gate.
- [ ] Commit documentation/test changes as `test(studio): verify corpus expression editing and projections`. Review the implementation branch against this spec, preserving unrelated edits.
- [ ] Open independently reviewable PRs: Task 1 correctness fix; Tasks 2–5 document/UI/TS redesign; companion Python backend and final cross-target gates. Do not merge/deploy without authorization for those PRs. After authorized deployment, run the targeted production journey and existing checkout guidance in isolated contexts.

## Self-review and handoff

- The design's seven acceptance points map to Tasks 1, 2/3, 4, 3/4, 5 plus the Python companion, 6, and 3/6 respectively.
- All five Review Focus cases have explicit regression ownership. Source range offsets stay full-file UTF-16; projections and builder identities include the owning file and workspace generation.
- No task declares full Python display done merely by relabelling read-only refusals. No task expands safe reverse editing to arbitrary generated bodies.
- Existing schema-backed form validation, normal source reconciliation, codegen semantics and LSP lifecycle retain ownership.
- Inline execution authorized; task progress and verification evidence live in the implementation ledger and Infigraph session.
