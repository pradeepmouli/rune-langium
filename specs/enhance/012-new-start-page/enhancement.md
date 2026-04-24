# Enhancement 012 — Add "New" option to the Studio start page

**Status**: Draft
**Priority**: Medium
**Branch**: `enhance/012-new-start-page`
**Created**: 2026-04-24

## What & Why

Rune Studio's start page (rendered when the workspace has no user files — `apps/studio/src/components/FileLoader.tsx`) currently offers **two** ways to enter the app:

- **Select Files** — native file picker, `.rosetta` only
- **Select Folder** — native directory picker

Both require the user to *already have* Rune source on their machine. A visitor landing on `www.daikonic.dev/rune-studio/studio/` with no existing model has no way to try the editor; they bounce.

This enhancement adds a third option — **New** — that creates an empty scratch `.rosetta` file in the in-memory workspace and drops the user into the three-panel editor immediately. No file system access, no samples to pick, no friction.

## Proposed changes

1. **Workspace helper** — add `createBlankWorkspaceFile(name?: string)` to `apps/studio/src/services/workspace.ts` (alongside `readFileList`). Returns a `WorkspaceFile` with:
   - `path`: a unique unsaved name like `untitled.rosetta` (or `untitled-2.rosetta` if the name collides with an existing workspace file)
   - `content`: a minimal starter template — just a `namespace example` line and a commented-out `type` stub so the editor has something to render without being empty
   - `readOnly: false` and any other fields consumed by the editor

2. **UI** — extend `FileLoader.tsx`:
   - Add a third button: **New**, rendered as the primary action (`variant="default"`) with **Select Files** / **Select Folder** demoted to secondary.
   - Clicking it calls `createBlankWorkspaceFile()` and passes the resulting single-file array to the existing `onFilesLoaded` callback — the same path Select Files uses, so the editor opens the file without any other wiring.
   - Update the heading/subcopy: "Start a new Rune file, or load existing ones" (replace "Load Rune DSL Models").

3. **Language server sync** — the existing `onFilesLoaded` handler in `App.tsx` already syncs new files with the LSP client (`handleFilesChange`). Verify the new in-memory file is accepted by the LSP without a file-system backing; if not, mark its path with a virtual-file prefix the LSP tolerates.

4. **Tests** — unit test for `createBlankWorkspaceFile` (name collision, template content). Smoke test that clicking **New** from the start page enters the editor with one untitled file.

## Out of scope

- Saving the new file to disk (the workspace already has save/export paths; not changing them here).
- A "recent files" list or welcome-screen redesign — just adding the third option.
- Picker for starter templates (e.g. "Empty / CDM example / DRR example") — this enhancement adds one template. Template variants can come later.

## Implementation plan (single phase)

Order reflects dependency: service helper → UI consumes it → wire into app → tests verify.

## Tasks

1. **[X] T001** — Add `createBlankWorkspaceFile` helper + a `uniqueUntitledName` util in `apps/studio/src/services/workspace.ts`. Export both. Unit-test name collision and the returned WorkspaceFile shape.
2. **T002** — Extend `FileLoader` (`apps/studio/src/components/FileLoader.tsx`) with a **New** button as the primary action. Accept the existing set of workspace files via a new prop (to compute the next untitled name) or take a factory callback.
3. **T003** — Wire the **New** handler in `App.tsx` to call the helper and pass the single-file array to `handleFilesLoaded`, reusing the existing LSP sync path. Verify the LSP client accepts the virtual path (prefix or flag if needed).
4. **T004** — Update start-page copy in `FileLoader`: heading "Start a new Rune file, or load existing ones" (or similar), subcopy adjusted to mention the three options.
5. **T005** — Add a Playwright smoke test (`apps/studio/tests/`) that loads the empty-workspace state, clicks **New**, and asserts the editor panel renders with one untitled file open.

## Acceptance criteria

- [ ] From an empty workspace, a **New** button is visible as the primary action.
- [ ] Clicking **New** creates exactly one `untitled.rosetta` file with the starter template and opens the editor without reloading the page.
- [ ] Clicking **New** a second time (with the first file still open) produces `untitled-2.rosetta`, not a duplicate.
- [ ] The LSP parses the new virtual file without errors; switching to the Source panel shows the starter template, graph panel shows whatever that template implies.
- [ ] Select Files / Select Folder still work as before (regression check).
- [ ] Playwright smoke test passes.

## Risks

- **LSP acceptance of virtual paths**: if `@rune-langium/lsp-server` rejects files without a real FS backing, T003 grows into a small LSP change. Mitigation: use a documented virtual-file prefix (e.g. `inmemory://`) that the LSP already tolerates; if not, fall back to a sentinel path in the user-file space.
- **Workspace uniqueness collisions**: user could rename the untitled file and then click New again; T001's uniqueness check must look at *current* workspace files, not a counter.
