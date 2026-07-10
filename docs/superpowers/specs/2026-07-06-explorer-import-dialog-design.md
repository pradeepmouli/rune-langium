# Explorer Import Dialog — Design

**Created**: 2026-07-06
**Status**: Approved (pending spec self-review + user review)
**Relates to**: `specs/021-codegen-inbound/spec.md` (spec 021, Phases 1–3, all merged) — this is the studio-side "Phase 4" consumer of the already-shipped `json-schema-reader`/`openapi-reader`/`sql-reader`/`xsd-reader` + `importModel()` entry point in `@rune-langium/codegen/import`.

## Context

`apps/studio/src/shell/perspectives/explore-chrome.tsx`'s `ExploreActions` renders four topbar buttons: Validate (no handler), Export code (opens `ExportDialog`, calls `/api/codegen`), Share (no handler), and **Generate** (`explore-chrome.tsx:185–188`) — which calls the exact same `setShowExportDialog(true)` as Export code. `Generate` is a dead duplicate: it does nothing Export code doesn't already do.

Separately, spec 021 shipped a complete two-way codegen surface (JSON Schema, OpenAPI, SQL DDL, XSD readers + emitters), but studio has no UI for the *inbound* direction — there is no way to bring an external schema into a workspace as a `.rune` model without using the CLI. This design replaces the dead `Generate` button with that missing capability.

## Goal

Replace `Generate` with an **Import** action that opens a dialog: pick a source format, provide the source (file drop or paste), preview the generated `.rune` model, and add it to the current workspace — either as a new file, or merged into an already-open file whose namespace matches.

## Architecture

- **Trigger**: `ExploreActions` (`explore-chrome.tsx`) — the `Generate` button (`Zap` icon, `studio-topbar__generate` class, lines 185–188) is replaced with an `Import` button (a wand/sparkles icon — `Wand2` from `lucide-react`, matching the existing `lucide-react` icon set already imported in this file) that calls a new `useImportDialogStore`'s `setOpen(true)`, mirroring `useExportDialogStore`/`ExportDialog`'s existing wiring exactly.
- **New files**:
  - `apps/studio/src/shell/import-dialog-store.ts` — Zustand store, structurally identical to `export-dialog-store.ts` (an `open: boolean` + `setOpen`).
  - `apps/studio/src/components/ImportDialog.tsx` — the dialog component (parallel to `ExportDialog.tsx`).
  - `apps/studio/src/shell/import-merge.ts` — pure functions for the merge/collision logic (no React, no store — see Data Flow below).
- **Execution is 100% client-side.** The four readers (`json-schema-reader`, `openapi-reader`, `sql-reader`, `xsd-reader`) and `importModel()` are already plain browser-safe TypeScript (this is how the existing Code tab already runs codegen client-side — see the `feedback_code_tab_vs_export_button` project convention: prefer client execution over the flaky `/api/codegen` server path). `ImportDialog` dynamically `import()`s `@rune-langium/codegen/import` on first open, and the SQL reader's `web-tree-sitter` WASM grammar loads lazily only when SQL is the selected format (it's already lazy-loaded internally by `sql-reader.ts`'s `sql-grammar-loader.ts` — no extra work needed here beyond not eagerly importing the whole `/import` barrel before the dialog is opened).
- **No new server endpoint.** This sidesteps the `/api/codegen` 503-flakiness class entirely for the inbound direction, same as the Code tab already does for outbound.

## Public API gap: `importModel()` isn't enough for merging

`@rune-langium/codegen/import`'s only public entry point, `importModel(source, options): Promise<{text, model, diagnostics}>`, returns the **final rendered text** for a brand-new file — it does not expose the intermediate element list, and `buildModel`/`renderModel` themselves are not re-exported from the `./import` subpath. For the **new-file** case this is exactly what's needed (`ImportDialog` calls `importModel()` directly, unmodified). For the **merge** case, domain-model-level splicing was considered and rejected: `packages/codegen/src/import/ast-builder.ts`'s element shape and `packages/visual-editor/src/adapters/ast-to-model.ts`'s domain-model shape are two different representations serving different consumers, and grafting one into the other would repeat the exact "synthesized/mismatched AST-shaped data" mistake recorded in this project's history (`feedback_no_synthesized_ast_data`).

Instead, merging happens at the **text + CST level**, using only `@rune-langium/core`'s already-public `parse()`:

1. Call `importModel()` to get the imported model's full rendered text (as for the new-file case).
2. `parse()` both the **target file's current text** and the **imported text** with the real Langium parser (the same parser every reader's own hard-invariant test already uses).
3. Walk each parse result's top-level `RosettaModel.elements`; for each element, read its name (`.name`) and its exact source span from `$cstNode.offset`/`$cstNode.length` (the same CST-span-extraction convention already used by the CST-reuse renderer for exact-text preservation — see `project_schema_validity_trigger`/`rune-cst-reuse-renderer`).
4. Any imported element whose name already exists among the target file's top-level element names is **dropped**, and a `"<Name> already exists in <path> — skipped"` entry is added to the collision list.
5. Surviving elements' exact source spans (from step 3) are appended, each preceded by a blank line, onto the end of the target file's text.
6. The merged text is re-`parse()`d — this is the same hard-gate as the new-file case (see below) — before "Merge" is enabled.

This is deliberately **not** a general declaration-merge engine: it operates only on top-level elements (types/enums/choices/functions), never rewrites an existing declaration's body, and a collision always means "keep what's already there, skip the incoming one" (never overwrite, per your explicit choice below).

`import-merge.ts` exposes this as one pure, testable function:

```ts
export interface MergeResult {
  mergedText: string;
  skipped: string[]; // element names dropped due to name collision
}

export function mergeImportedText(existingText: string, importedText: string): Promise<MergeResult>;
```

(`Promise` because it calls `@rune-langium/core`'s `parse()`, which is async.)

## Dialog Flow

1. **Format select** — a `Select` with four options: JSON Schema, OpenAPI, SQL DDL, XSD.
2. **Source input** — a drop-zone (single file) + textarea, both feeding the same `sourceText` state. A fresh, minimal implementation local to `ImportDialog` — not extracted from or shared with `FileLoader.tsx`'s drag-and-drop handler, which carries multi-file/curated-corpus concerns this dialog doesn't have.
3. **Namespace field** — a text input, empty by default. Left blank, `importModel()` derives a namespace from the source itself (`$id`/`info.title`/`targetNamespace`, per format); the field is not required before the first Preview.
4. **Preview** (explicit button; a `phase` state machine — `idle → previewing → previewed | error` — mirroring `ExportDialog`'s own `DialogState`, not a live-as-you-type/debounced run):
   - Calls `importModel(sourceText, { from: selectedFormat, namespace: namespaceField || undefined })`.
   - On success, if the namespace field was left blank, it is populated with the resulting `model.namespace` so the user can see and, if they choose, override it before re-running Preview (e.g. to target a different existing file's namespace on purpose).
   - On success: shows a summary line (counts of types/enums/errors/warnings from `diagnostics`) and the rendered `.rune` text, read-only.
   - Checks `model.namespace` (or the resolved namespace) against every currently-open workspace file's `namespace` field.
     - **No match** → confirm button reads **"Add to workspace"**.
     - **Match** → runs `mergeImportedText` against the matched file's current text, shows a banner ("Will merge into `<path>` — N declaration(s) skipped, already exist: `<names>`" when `skipped.length > 0`), confirm button reads **"Merge into `<path>`"**.
   - On thrown error (malformed source): `phase: 'error'`, inline error message, no further action possible until the user changes the input and re-runs Preview.
5. **Confirm**:
   - New-file path: `createWorkspaceFile(name, text)` (from `workspace.ts`) with a name derived from the namespace, appended to the files list, then focused — the same shape as the existing "+" blank-file button (`handleCreateFile` in `explore-chrome.tsx:149–153`).
   - Merge path: `updateFileContent(files, matchedPath, mergedText)` (from `workspace.ts`), then focus the matched file.
   - Dialog closes on either path.

## Hard invariant (defense-in-depth)

Before "Add to workspace"/"Merge" is ever enabled, the exact text that would be written is passed through `@rune-langium/core`'s real `parse()` and must return zero errors:
- New-file path: `importModel()` already guarantees this internally (documented on `ImportResult.text`), but `ImportDialog` re-checks it explicitly rather than trusting the guarantee blindly — one `parse()` call is cheap, and this is the same "never trust, always verify the render" discipline every reader's own test suite already applies.
- Merge path: the *merged* text is a new artifact `importModel()` never validated (it only validated the imported text alone) — re-parsing it after splicing is the only point that catches a — theoretically impossible, but unverified — bad splice.

A `parse()` failure at this point is a bug in this dialog's own logic, not a user-facing "your source was invalid" error (that's what step 4's `phase: 'error'` already covers) — so it renders a distinct "internal error, please file a bug" state rather than pretending to be an input problem.

## Error Handling

- Reader/parser throw (malformed XML/SQL/JSON/YAML) → caught in the Preview step, `phase: 'error'`, no partial state ever touches workspace files.
- Structurally valid but empty source (0 types/enums) → preview succeeds but is flagged "nothing to import," confirm button disabled.
- Collision (merge path) → never blocks the import; the colliding declaration is dropped and listed, the rest proceeds (per your "skip + diagnostic" choice — not "abort whole import," not "overwrite").

## Testing

- `import-merge.test.ts` — unit tests for `mergeImportedText`: no collisions (simple append), one collision (skipped + reported, rest merged), all-collide (empty merge, all skipped), and a re-`parse()` sanity check that the merged output is always valid `.rune` text.
- `ImportDialog.test.tsx` — component test covering the state machine: format switch resets preview state, preview success/error, new-file vs. merge-detected banner switching, confirm wiring (mocked `createWorkspaceFile`/`updateFileContent` calls).
- `import-dialog-store.test.ts` — trivial store test, mirroring the existing `export-dialog-store.test.ts`.

## Addendum (2026-07-09): Shared `InteractiveDialog` shell

Studio already has three dialogs that duplicate the same shell markup:
`ExportDialog` and `DownloadConfigModal` both wrap `Dialog`/`DialogContent`
with a fixed `max-w-[92vw] max-h-[80vh]` sizing, a `DialogHeader` +
`DialogTitle` + `sr-only` `DialogDescription`, a `Separator`, a scrollable
body `div`, and (for `DownloadConfigModal`) a trailing `Separator` + a
`flex justify-end gap-2 px-4 py-3` Cancel/Confirm footer bar.
`GitHubConnectDialog`/`GitHubWorkspaceFlow` are architecturally different
(a multi-screen wizard that swaps whole screens, not a single-screen
confirm/cancel dialog) and are explicitly NOT part of this consolidation.

Rather than have `ImportDialog` duplicate this shell a fourth time, this
work extracts it into `packages/design-system/src/ui/interactive-dialog.tsx`
(`InteractiveDialog`) — a thin, shell-only wrapper over the existing
`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/
`Separator` primitives. It does **not** generalize the phase-state-machine
or error-banner pattern each dialog uses internally
(`ExportDialog`'s `idle/validating/generating/done/error`,
`GitHubConnectDialog`'s `init/pending/expired/access_denied/error`, and
`ImportDialog`'s `idle → previewing → previewed | error` are three
different shapes; forcing them into one generic shape would be a leaky
abstraction) — each dialog keeps its own body content, phase state, and
error rendering exactly as today.

**Location:** `packages/design-system` (MIT), alongside the primitives it
composes, not `apps/studio` — matches the existing pattern of composable
UI living in the shared design-system package, and keeps it available if
`@rune-langium/visual-editor` ever needs a dialog (no VE dialog exists
today).

**Scope:** this plan retrofits all three current consumers —
`ExportDialog`, `DownloadConfigModal`, and the new `ImportDialog` — onto
`InteractiveDialog`, so the duplication is removed immediately rather than
left for a future cleanup.

**API** (shell-only, no phase/loading semantics):

```ts
export interface InteractiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Rendered as a visually-hidden DialogDescription (a11y only, matches every current consumer). */
  description: React.ReactNode;
  /** Tailwind width class, e.g. "w-[720px]" or "w-[480px]" — combined with the shared max-w-[92vw] max-h-[80vh] sizing. */
  width: string;
  /** data-testid on the rendered DialogContent. */
  testId: string;
  /** Forwarded to DialogContent's overlayProps, e.g. { 'data-testid': 'export-dialog-overlay' }. */
  overlayProps?: React.ComponentProps<typeof DialogOverlay>;
  /** Extra classes merged onto the scrollable body div (default: 'flex-1 min-h-0 flex flex-col'). */
  bodyClassName?: string;
  /** Footer content, rendered after a Separator in a standard 'flex justify-end gap-2 px-4 py-3' bar. Omit for dialogs whose actions live inline in the body (ExportDialog's Generate/Cancel row). */
  footer?: React.ReactNode;
  children: React.ReactNode;
}
```

`ExportDialog` retrofit: `width="w-[720px]"`, `testId="export-dialog"`,
`overlayProps={{ 'data-testid': 'export-dialog-overlay' }}`, no `footer`
(its Generate/Cancel row stays inline in the body, unchanged), body
retains its existing `flex flex-col gap-4 overflow-hidden` via
`bodyClassName`.

`DownloadConfigModal` retrofit: `width="w-[480px]"`, `testId="download-config-modal"`,
body retains `studio-scroll ... overflow-auto gap-5` via `bodyClassName`,
`footer` carries the existing Cancel (`download-config-modal__cancel`) /
Generate (`download-config-modal__generate`) buttons unchanged.

Both retrofits are pure structural extraction — no behavior, prop, or
test-id changes; existing tests (`DownloadConfigModal.test.tsx`, the e2e
specs touching `export-dialog`/`export-dialog-overlay`) must pass
unmodified.

No dedicated `InteractiveDialog` unit test is added: `packages/design-system`
has no test harness today (no `test` script, no jsdom/testing-library
setup, zero existing test files), and the component has no logic of its
own to test in isolation — it's exercised transitively through
`DownloadConfigModal.test.tsx` and the new `ImportDialog.test.tsx`, both of
which already run under `apps/studio`'s jsdom vitest environment.

## Explicitly Out of Scope (v1)

- Editing the generated `.rune` text before commit (beyond the namespace field) — the preview is read-only; further edits happen in the editor after commit, like any other file.
- Multi-format batch import (one source document per dialog run).
- Any change to `@rune-langium/codegen`'s public `./import` export surface — this design deliberately stays within `importModel()` + `@rune-langium/core`'s existing `parse()`, adding zero new codegen-package exports.

**Correction (2026-07-10):** an earlier version of this section listed "merging into a file that isn't currently open in the workspace" as deferred, on the assumption that namespace-matching only checked open files. That assumption was wrong — `namespaceToFile` (`ExplorePerspective.tsx`) is built from the studio's full workspace file list (`parseWorkspaceFiles` parses every file regardless of tab state), so merging into any workspace file — open or not — already worked as shipped. See `docs/superpowers/specs/2026-07-10-import-options-schema-design.md`.
