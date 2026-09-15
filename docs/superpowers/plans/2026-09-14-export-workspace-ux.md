# Export Workspace UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select declarations through the shared type explorer, configure exports on the right, and inspect/download the same generated artifact below.

**Architecture:** Consume the [shared workbench foundation](2026-09-14-workbench-foundation.md). Add declaration-root selection to authoritative codegen after the existing namespace hydration closure, without mutating linked documents. A versioned artifact envelope carries generated files and selection diagnostics; Export previews and downloads that same artifact independently of Explore's preview store.

**Tech Stack:** TypeScript 7, Langium 4, existing codegen emitters, React 19, Dockview 8, Zustand 5, JSZip, CodeMirror, Vitest/Playwright; Node >=22.13.0, pnpm@11.5.0.

**Spec:** [Export workspace UX design](../specs/2026-09-14-export-workspace-ux-design.md).

## Global Constraints

- “The shared type explorer selects what to export. Settings remain visible on the right.”
- “Keep export inclusion separate from Explore visibility and navigation selection.”
- “Search/filter does not silently clear selections.”
- “Use the existing authoritative dependency closure, including cross-bundle references. Do not implement a second closure approximation in the UI.”
- “Individual-type selection therefore requires extending the authoritative generation/packaging contract and closure handling.”
- “An older asynchronous result must never replace a newer result or be downloaded as if it represented current settings.”
- “Non-text targets such as Excel need an honest output summary or suitable structured preview.”
- Existing library/API callers without the new selection/envelope options retain existing output behavior.
- No generated source patching or emitter-output text deletion. Preserve linking identity, fatal diagnostics, deterministic output, and immutable curated cohorts.
- New package source uses MIT headers; Studio source uses FSL-1.1-ALv2. No new dependencies.

---

## Scope, dependencies, and file responsibilities

Run the shared-foundation plan first. This plan does not depend on Prototype implementation. Use an isolated worktree from current master at execution; preserve the planning documents. Read `docs/agents/architecture.md` and workflow before modifying codegen. Rebuild codegen after changes so Studio consumes current dist.

| File(s) | Responsibility |
| --- | --- |
| `packages/codegen/src/selection/{types.ts,declaration-selection.ts}` (new) | Canonical declaration identities and dependency-closed emission selection |
| `packages/codegen/src/{generator.ts,types.ts,export.ts}` | Public selection contract and selection before emitters |
| `apps/studio/src/services/{export-artifact.ts,export-request.ts}` (new) | Artifact manifest, decoding, captured workspace request |
| `apps/studio/src/services/codegen-download-handler.ts` | Shared Pages/browser generation and artifact envelope |
| `apps/studio/src/services/codegen-download-client.ts` | Existing transport plus cancellation |
| `apps/studio/src/store/export-workbench-store.ts` (new) | Workspace selection/configuration/result state |
| `apps/studio/src/shell/panels/{ExportSelectionPanel.tsx,ExportSettingsPanel.tsx,ExportPreviewPanel.tsx}` (new) | Selection, settings, and generated file/code UI |
| `apps/studio/src/shell/perspectives/screens/ExportPerspective.tsx` | Workbench composition only |
| `apps/studio/src/components/{DownloadConfigDialog.tsx,CodePreviewPanel.tsx}` | Shared settings extraction and navigation handoff |

### Task 1: Add canonical declaration-root closure to codegen

**Files:** Create `packages/codegen/src/selection/{types.ts,declaration-selection.ts}`, `packages/codegen/test/declaration-selection.test.ts`; modify `packages/codegen/src/{types.ts,generator.ts,export.ts}`. Read `emit/namespace-walker.ts`, `namespace-registry.ts`, `cycle-detector.ts`, and core's linked-AST reference utilities first.

**Interfaces:**

```ts
import type { AstNode, LangiumDocument } from 'langium';
export interface DeclarationKey { namespace: string; name: string; kind: string }
export interface ExportSelection {
  namespaces: readonly string[];
  declarations: readonly DeclarationKey[];
}
export interface ResolvedSelection {
  explicit: readonly DeclarationKey[];
  included: readonly DeclarationKey[];
  requiredBy: ReadonlyMap<string, readonly string[]>;
  elements: ReadonlySet<AstNode>;
}
export function declarationKey(key: DeclarationKey): string {
  return JSON.stringify([key.namespace, key.kind, key.name]);
}
export function resolveExportSelection(docs: readonly LangiumDocument[], selection: ExportSelection): ResolvedSelection;
```

Add optional `selection?: ExportSelection` to GeneratorOptions. `kind` is validated against actual top-level `$type` values in the loaded model, not trusted from client input. Keep old `namespaces` compatibility; reject simultaneous legacy `namespaces` and new `selection` rather than guessing precedence. Empty explicit selection generates no content; unknown roots are fatal diagnostics. Namespace roots expand to actual declarations in that namespace.

- [ ] **Step 1: Add linked Rune fixtures and a subset regression.** Test helper defined in this file:

```ts
async function parseSources(sources: string[]) {
  const { RuneDsl } = createRuneDslServices();
  const docs = sources.map((source, i) => RuneDsl.shared.workspace.LangiumDocumentFactory
    .fromString(source, URI.parse(`inmemory:///selection-${i}.rosetta`)));
  for (const doc of docs) RuneDsl.shared.workspace.LangiumDocuments.addDocument(doc);
  await RuneDsl.shared.workspace.DocumentBuilder.build(docs);
  return docs;
}
it('includes a selected type dependency and excludes an unrelated sibling', async () => {
  const docs = await parseSources([
    'namespace test\ntype Address:\n  city string (1..1)\ntype Party:\n  address Address (1..1)\ntype Unrelated:\n  other string (1..1)\n'
  ]);
  const selection = resolveExportSelection(docs, {
    namespaces: [], declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }]
  });
  expect(selection.included.map(x => x.name).sort()).toEqual(['Address', 'Party']);
  const output = await generate(docs, { target: 'typescript', selection: {
    namespaces: [], declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }]
  }});
  expect(output.map(x => x.content).join('\n')).not.toContain('class Unrelated');
});
```

Import `createRuneDslServices` from core, `URI` from Langium, `generate` from the public codegen entry, and the new resolver/types. Assert parser/linker diagnostics are empty in the helper, throwing their messages if not; malformed fixtures must not accidentally prove closure behavior.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/codegen exec vitest run test/declaration-selection.test.ts`.
- [ ] **Step 3: Build a declaration identity index over linked AST objects.** Index all top-level elements per namespace, including functions, dispatch variants, aliases, annotations, enums, rules, and Choice. Group same-kind/same-name function dispatch declarations under one key; preserve all members. A type and function with the same name have different keys. Walk each element and `AstUtils.streamAllContents(element)`, then `AstUtils.streamReferences(node)` for linked references. Climb a reference target's containment chain to its top-level element; local parameter/attribute references resolve to their owner and do not become new roots. Traverse with Sets to terminate cycles. Record requiring explicit roots for every transitive dependency, including diamond/cycle paths. Missing linked refs are fatal with source diagnostics; do not silently discard them.
- [ ] **Step 4: Integrate selection before registry/walk/emission.** Preserve full linked docs for resolution, and build per-request read-only emission document views whose root `elements` arrays contain only included AST objects. Never change original `model.elements`, `$container`, references, or document caches. Pass those same views to registry, walker, TypeScript function extraction, and whole-model emitters. If a current emitter bypasses the supplied views, route its declaration enumeration through the selected walk; do not filter generated text. Keep the existing Data/Choice cycle graph for ordering; it is not a complete export-closure graph and must not be reused as one.
- [ ] **Step 5: Add closure edge regressions.** Reuse `parseSources` for cross-namespace duplicate names, aliases, inheritance, enums, conditions calling functions, a function calling another function, constructors, Choice arms, annotations, recursive types, and dispatch variants. Verify requiredBy against original roots, same-name type/function identities, fatal unknown roots, empty selection, and unchanged legacy namespace-only output. Compare source AST array identities before/after two different subset generations to catch cached-document mutation.
- [ ] **Step 6: Run green and commit.** Run Step 2, full codegen tests/type-check, then `pnpm --filter @rune-langium/codegen run build`. Document the new selection contract in `packages/codegen/README.md`. Commit `feat(codegen): support dependency-closed declaration exports`.

### Task 2: Carry exact selection through hydration and return an inspectable artifact

**Files:** Create `apps/studio/src/services/export-artifact.ts`; modify `apps/studio/src/services/{codegen-download-handler.ts,codegen-download-client.ts}`; tests `apps/studio/functions/test/codegen.test.ts`, `apps/studio/test/services/export-artifact.test.ts`, `apps/studio/functions/test/codegen-bundle-dependencies.test.ts`, and `apps/studio/test/services/codegen-download-client.test.ts`. Also modify `packages/codegen/src/{generator.ts,export.ts}` to expose the generation receipt.

**Interfaces:** Extend the validated codegen request with `selection?: ExportSelection` and `artifactEnvelope?: 1`. Absence retains the existing single-file/ZIP behavior. Envelope mode always returns a ZIP containing the generated files and reserved metadata entry `.rune/export.json`:

```ts
export interface ExportArtifactManifest {
  version: 1;
  target: Target;
  resolvedSelection: {
    explicit: DeclarationKey[];
    included: DeclarationKey[];
    requiredBy: Record<string, string[]>;
  };
  files: Array<{ path: string; kind: 'text' | 'binary'; mimeType?: string; bytes: number }>;
  diagnostics: GeneratorDiagnostic[];
  resolvedCohorts: Record<string, string>;
}
export interface ExportArtifact {
  blob: Blob;
  filename: string;
  manifest: ExportArtifactManifest;
  readText(path: string): Promise<string>;
}
export function decodeExportArtifact(response: Response): Promise<ExportArtifact>;
```

Read actual `manifest.cohort` values from `loadCuratedWorkspace(...).bundles`, never the client's floating versions. Omit entries for legacy manifests without an immutable cohort; do not mislabel `latest` as an immutable receipt. The same `ResolvedSelection` feeds generator and manifest; expose `generateSelected` from codegen returning `{ outputs: GeneratorOutput[]; selection: ResolvedSelection }` to avoid two resolver passes. Both public functions call one internal generation implementation; `generate` unwraps outputs and preserves its old return shape. Define the additional public signature explicitly:

```ts
export function generateSelected(
  docs: LangiumDocument[],
  options: GeneratorOptions & { selection: ExportSelection }
): Promise<{ outputs: GeneratorOutput[]; selection: ResolvedSelection }>;
```

- [ ] **Step 1: Add an artifact byte-correspondence test.** Use a real Response from `handleCodegenDownload` with the Task 1 fixture and envelope selection:

```ts
const response = await handleCodegenDownload({ request: new Request('http://localhost/api/codegen', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ files: [{ path: 'party.rosetta', content: source }],
    target: 'typescript', artifactEnvelope: 1,
    selection: { namespaces: [], declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }] } })
}) });
expect(response.status).toBe(200);
const artifact = await decodeExportArtifact(response);
const zip = await JSZip.loadAsync(await artifact.blob.arrayBuffer());
const file = artifact.manifest.files.find(file => file.kind === 'text')!;
expect(await artifact.readText(file.path)).toBe(await zip.file(file.path)!.async('string'));
```

Define `source` as the literal Task 1 Rune fixture in this test. Also assert no `.rune/export.json` entry appears in generated source-file list.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run functions/test/codegen.test.ts test/services/export-artifact.test.ts`.
- [ ] **Step 3: Extend request validation and hydration seeds.** Validate arrays, namespace/name/kind strings, envelope version, supported target, and legacy/new selection exclusivity before loading docs. Compute namespace seeds from selected namespaces plus declaration namespaces; feed the existing `loadCuratedWorkspace` namespace/cross-bundle closure, retaining dependency cohorts and current document-cache reservation behavior. Namespace hydration may load more declarations than emitted; the codegen resolver chooses the final subset. Include normalized seed sets in cache identity. Never filter or mutate the cached documents themselves.
- [ ] **Step 4: Package the shared result.** Call `generateSelected` with strict fatal-diagnostic handling. For envelope mode, serialize its resolved selection and diagnostics, and package `output.binary ?? output.content` with the existing JSZip infrastructure. Reject absolute/traversal paths, duplicates, and collision with `.rune/export.json`. Include runtime/helper files just as normal generation does. Return error responses before publishing partial ZIPs. Legacy mode remains byte/filename compatible where previously deterministic.
- [ ] **Step 5: Decode without generating again.** Validate manifest version/shape, file membership, kind and path, and byte lengths. `readText` only decodes a manifest-listed text file. Keep original ZIP Blob for Download; inspect text lazily to avoid retaining every decoded curated file. Non-text preview shows path/MIME/bytes. Add AbortSignal to `requestCodegenDownload(body, signal?)`: abort fetch or terminate the disposable browser worker, remove listeners and clear timers on every finish path.
- [ ] **Step 6: Run green and commit.** Run Step 2, existing codegen download/curated closure tests, and Studio type-check. Test curated browser and Pages user-file routes against the same subset fixture, binary Excel, errors, abort, and two concurrent selections. Commit `feat(studio): return inspectable export artifacts`.

### Task 3: Introduce workspace-scoped export configuration and artifact state

**Files:** Create `apps/studio/src/{store/export-workbench-store.ts,services/export-request.ts}`, `apps/studio/test/{store/export-workbench-store.test.ts,services/export-request.test.ts}`; modify `apps/studio/src/components/DownloadConfigDialog.tsx` to export/reuse existing layout choices and option forms through new `apps/studio/src/components/ExportSettingsForm.tsx`.

**Interfaces:**

```ts
export interface ExportConfig {
  target: Target;
  selection: ExportSelection;
  options: Omit<GeneratorOptions, 'target' | 'selection' | 'namespaces'>;
}
export interface ExportInput {
  workspaceId: string;
  sourceRevision: number;
  config: ExportConfig;
  files: readonly WorkspaceFile[];
}
export type ExportRunState =
  | { status: 'idle' }
  | { status: 'generating'; requestId: string }
  | { status: 'ready' | 'stale'; inputKey: string; artifact: ExportArtifact }
  | { status: 'failed'; message: string; diagnostics: GeneratorDiagnostic[] };
export function exportInputKey(input: ExportInput): string;
export function generateExport(input: ExportInput, signal: AbortSignal): Promise<ExportArtifact>;
```

`createExportWorkbench(generate: typeof generateExport)` returns a Zustand store with `{ config, run, configure(next: ExportConfig), invalidate(sourceRevision: number), generate(input: ExportInput): Promise<void>, cancel(): void }`. Define the hook singleton `useExportWorkbenchStore` through this factory. The injected generator makes request races testable without mocking emitters.

- [ ] **Step 1: Write the obsolete-result regression.**

```ts
it('rejects a completed result after its inputs change', async () => {
  let finish!: (artifact: ExportArtifact) => void;
  const generate = vi.fn(() => new Promise<ExportArtifact>(resolve => { finish = resolve; }));
  const store = createExportWorkbench(generate);
  const pending = store.getState().generate(input);
  store.getState().invalidate(input.sourceRevision + 1);
  finish(artifact);
  await pending;
  expect(store.getState().run.status).not.toBe('ready');
});
```

Define `input` in the test as workspace `test`, revision 1, one user file and default TypeScript config with selected namespace test. Define `artifact` with an empty Blob and a valid version-1 manifest containing an empty files list; this test exercises ownership, not artifact validation. Add reverse reply order, target/options/selection changes, cancellation, and workspace change. Switch TypeScript → Excel → TypeScript and assert each target restores its own supported options while the generated request excludes options for inactive targets.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run test/store/export-workbench-store.test.ts test/services/export-request.test.ts`.
- [ ] **Step 3: Implement normalized input identity.** Stable-sort selection roots and recursively sort option-object keys; retain array order where option semantics depend on it. Identity includes workspace ID, source revision, target, options, selection, and actual captured file contents/serialized curated inputs or their content hashes. Clone the config at generation start. Store the resolved cohort receipt with the artifact; a notified source/cohort change invalidates it. A floating latest changing remotely cannot silently change an already generated ZIP: Download saves the captured Blob until the user refreshes source input.
- [ ] **Step 4: Implement request ownership.** Each generation gets a monotonically increasing generation ID plus AbortController. Increment ownership on config/source/workspace changes; a late reply is ignored even if transport abort loses the race. Keep at most one artifact per workspace active in memory; release Blob/text references when replaced. Persist only selection/settings and active file path using the shared workbench settings API, never artifacts or source content. Empty selection disables Generate/Download. Failed and stale results show clear status; stale Blob is not downloaded via the normal Download action.
- [ ] **Step 5: Extract settings controls and build requests once.** Move current target layout choices and Excel option form wiring into ExportSettingsForm, used by both legacy DownloadConfigDialog and the new pane. Preserve per-target option records in configuration when switching targets; project only the active target's options into the request. Use the existing OpenAPI/Excel option schemas and shared target descriptors; do not advertise unimplemented targets or layouts. `generateExport` reuses `collectCuratedSourcesForCodegen`, the existing user-file filter, `requestCodegenDownload`, and decoder. Export must no longer read `useCodegenStore.snapshot` for its own output.
- [ ] **Step 6: Run green and commit.** Run Step 2, existing DownloadConfigDialog tests, Studio type-check. Commit `feat(studio): own export configuration and artifact state`.

### Task 4: Wire the shared explorer to explicit export roots and dependencies

**Files:** Create `apps/studio/src/shell/panels/ExportSelectionPanel.tsx`, `apps/studio/test/shell/panels/ExportSelectionPanel.test.tsx`; modify `apps/studio/src/store/export-workbench-store.ts`.

**Interfaces:** `ExportSelectionPanel(): ReactElement` consumes the shared node repository and export store. Use the foundation `ExplorerSelection` prop for checkboxes. Add `selectionSummary: { state: 'unresolved' | 'resolved'; explicitCount: number; includedCount?: number }` derived from configuration/artifact, not independent mutable truth.

- [ ] **Step 1: Test focus versus inclusion and retained hidden selections.**

```tsx
await userEvent.click(screen.getByRole('checkbox', { name: 'Export test.Party' }));
await userEvent.type(screen.getByRole('textbox', { name: 'Filter types or namespaces...' }), 'Address');
expect(useExportWorkbenchStore.getState().config.selection.declarations)
  .toContainEqual({ namespace: 'test', name: 'Party', kind: 'Data' });
expect(screen.getByText(/1 selected/)).toBeVisible();
```

Use real seeded node-repository fixtures; add namespace partial-selection and offscreen virtual-row tests. Export checkboxes never call Explore's graph visibility actions.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run test/shell/panels/ExportSelectionPanel.test.tsx`.
- [ ] **Step 3: Implement root mapping and dependencies.** Map UI node identity to `{namespace, name, kind: node.data.$type}` and canonical declarationKey, not bare names. Pass this adapter as foundation `ExplorerSelection.getSelectionId` so row and bulk-selection keys match the receipt. Verify the shared repository retains same-named type/function entries; if its current FQN index collapses them, extend that authoritative index and its navigation adapters with kind-aware lookup and regression tests before enabling those roots, rather than constructing a second Export catalog. Namespace selection stores a namespace root even when descendants are deferred. Display selected root count immediately and “Dependencies resolved on generation” until the authoritative artifact receipt arrives. After generation, use receipt.requiredBy to mark required items and explain inclusion. Any selection change invalidates the receipt rather than retaining misleading dependency counts. If receipt declarations are absent from the current visible catalog, render a read-only required-dependencies list by qualified key; do not silently omit them.
- [ ] **Step 4: Support mixed roots and removals.** Selected namespaces include all declarations; unchecking an individual child converts that namespace root into explicit declaration roots for its other eligible children using complete namespace inventory, not viewport rows. If the inventory is incomplete, require resolution first and explain why the action is pending. Required-only children remain included until requiring roots are removed. Preserve independent focus, search, and selection across perspective switches.
- [ ] **Step 5: Run green and commit.** Run Step 2 and foundation explorer tests, Studio/visual-editor type-check. Commit `feat(studio): select export roots in the shared explorer`.

### Task 5: Compose settings-right and generated-output-below workbench

**Files:** Create `apps/studio/src/shell/panels/{ExportSettingsPanel.tsx,ExportPreviewPanel.tsx}`; modify `apps/studio/src/shell/perspectives/screens/ExportPerspective.tsx`, `apps/studio/src/shell/perspectives/PerspectiveHost.tsx`; tests `apps/studio/test/shell/ExportPerspective.test.tsx`, `apps/studio/test/shell/panels/ExportPreviewPanel.test.tsx`.

**Interfaces:** Stable panel IDs `export.selection`, `export.settings`, `export.preview`. `ExportSettingsPanel` reads/writes ExportConfig through ExportSettingsForm. `ExportPreviewPanel` renders ExportRunState and `activeFile: string | null`; active-file changes do not generate again. Pass workspaceId/files from workspace context; preserve existing public ExportPerspective files prop during migration.

- [ ] **Step 1: Test two output files and no duplicate generation.**

```tsx
await userEvent.click(screen.getByRole('button', { name: 'Generate', exact: true }));
await waitFor(() => expect(screen.getByRole('button', { name: 'Download', exact: true })).toBeEnabled());
await userEvent.selectOptions(screen.getByLabelText('Generated file'), 'test/party.ts');
await userEvent.click(screen.getByRole('button', { name: 'Download', exact: true }));
expect(generate).toHaveBeenCalledTimes(1);
expect(downloadBlob).toHaveBeenCalledWith(artifact.blob, artifact.filename);
```

Here `generate` is the Task 3 injected client, `artifact` is a decoded ZIP fixture with two files, and `downloadBlob` is the extracted shared browser-download utility dependency. Define that utility as `downloadBlob(blob: Blob, filename: string): void` in `apps/studio/src/services/export-artifact.ts`, using an anchor and revoked object URL. Add an Excel fixture asserting a file summary instead of a code editor.
- [ ] **Step 2: Run red.** `pnpm --filter @rune-langium/studio exec vitest run test/shell/ExportPerspective.test.tsx test/shell/panels/ExportPreviewPanel.test.tsx`.
- [ ] **Step 3: Replace the target table/modal composition.** Use WorkbenchHost with explorer upper-left, settings upper-right, preview below spanning both. Register stable React panel components, shared heading/actions, and per-workspace native layout. Generate uses captured current input; Download uses only ready current artifact. Show progress, Cancel, Retry, source revision/cohort receipt, selection summary, and diagnostics. Keep the old dialog for old entry points until Task 6 redirects them; do not render it from the new perspective. At constrained widths allow Selection and Settings as upper-pane tabs with Preview below; preserve values and focused controls across this arrangement. Test keyboard access and reset at 768px as well as desktop widths.
- [ ] **Step 4: Build generated file browsing.** Use an accessible file selector/tree with full relative paths. Reuse the existing read-only CodeMirror presentation used for code preview, allowing syntax mode per extension. Keep files lazy, show copy-active-file and diagnostic navigation, and render binary path/MIME/size without converting binary to text. Selection/options changes show stale output and disable normal Download until regeneration. Output/error lines flow to shared logging once, not separately from each panel.
- [ ] **Step 5: Run green and commit.** Run Step 2 and Studio type-check. Commit `feat(studio): compose export selection settings and preview workbench`.

### Task 6: Link Explore export actions and verify real artifacts

**Files:** Modify `apps/studio/src/{shell/ExplorePerspective.tsx,components/CodePreviewPanel.tsx,shell/export-dialog-store.ts}`; create `apps/studio/src/services/export-navigation.ts`, `apps/studio/test/services/export-navigation.test.ts`, `apps/studio/test/e2e/export-workbench.spec.ts`; extend `apps/studio/test/prod-ux/journeys/j13-export-perspective.spec.ts`; update `docs/{agents/architecture.md,TESTING.md}` and `packages/codegen/README.md`.

**Interfaces:** `openExport(selection: ExportSelection): void` captures current workspace, initializes export roots, and activates Export. It preserves other perspective state and marks prior artifacts stale if selection changes. Add stable IDs `export-selection`, `export-settings`, `export-preview`, `export-run-status`. Retain `export-perspective`.

- [ ] **Step 1: Write navigation tests.** Select a type in Explore, invoke Export, assert the exact DeclarationKey is selected while Explore's node remains selected when returning. A namespace action seeds that namespace; ordinary opening of Export restores prior roots instead of replacing them with whichever type happens to be focused. Repeated navigation must not start generation automatically.
- [ ] **Step 2: Add a real downloaded subset journey.** Upload the Task 1 Rune fixture, select Party through the explorer, choose TypeScript, Generate, inspect both root and dependency output, then download. Test code:

```ts
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Download', exact: true }).click()
]);
const path = await download.path();
expect(path).toBeTruthy();
const zip = await JSZip.loadAsync(await readFile(path!));
const manifest = JSON.parse(await zip.file('.rune/export.json')!.async('string'));
expect(manifest.resolvedSelection.included.map((key: DeclarationKey) => key.name).sort())
  .toEqual(['Address', 'Party']);
```

Compile every downloaded TypeScript source with strict settings and installed runtime dependencies by invoking the existing CLI `node scripts/verify-codegen-corpus.mjs --zip <download-path>` from repository root (pass the actual path as a process argument, never interpolate it into shell text); do not merely search ZIP text for a name. For Zod, execute a generated schema against valid and invalid input. Check Excel binary ZIP entry loads with the existing workbook test reader. Verify settings changes require a new result and Download never issues another generation request for an unchanged artifact.
- [ ] **Step 3: Run red then wire handoff.** Run `pnpm --filter @rune-langium/studio exec vitest run test/services/export-navigation.test.ts`; implement `openExport` and redirect Explore type/namespace/code-preview export actions into the shared workbench. Retain explicit legacy API consumers. Run the test again and confirm PASS.
- [ ] **Step 4: Verify complete scopes and races.** Use real curated CDM→FpML/Rune cross-bundle inputs, namespace versus declaration roots, annotations and called functions, mixed user+curated roots, unavailable type, aborted generation, failed generation/retry, switching targets, reload of settings, and workspace isolation. Run `pnpm --filter @rune-langium/studio exec playwright test test/e2e/export-workbench.spec.ts` with local services from TESTING. Inspect dark/light and 1280px/wide screenshots. No networkidle waits.
- [ ] **Step 5: Complete package checks and commit.** Run codegen full tests/type-check/build, Studio tests/type-check/lint, affected visual-editor tests, and format check. Update architecture to distinguish hydration closure, emission selection, and captured artifact identity. Commit `test(studio): verify exact export selection and artifact parity`. Production verification follows a separately authorized deployment using the updated J13 harness; do not label local results as production-tested.

## Self-review coverage

Exact selected declarations/dependencies: Task 1. Cross-bundle hydration and artifact/preview parity: Task 2. Settings/source identity, cancellation, workspace persistence: Task 3. Shared selection explorer and inclusion semantics: Task 4. Settings-right/output-below layout and non-text output: Task 5. Explore navigation, actual artifact compilation/execution, accessibility/layout and docs: Task 6. No Prototype state or implementation dependency is introduced.
