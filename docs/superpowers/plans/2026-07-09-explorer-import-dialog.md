# Explorer Import Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Explore's dead `Generate` topbar button with an `Import` action that opens a dialog for bringing an external schema (JSON Schema / OpenAPI / SQL DDL / XSD) into the workspace — as a new `.rune` file, or merged into an already-open file whose namespace matches — and extract the shell markup `ImportDialog` would otherwise duplicate into a shared `InteractiveDialog` component, retrofitting the two existing dialogs (`ExportDialog`, `DownloadConfigModal`) onto it in the same pass.

**Architecture:** `InteractiveDialog` (new, `packages/design-system`) is a thin, shell-only wrapper over the existing `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`Separator` primitives — standard sizing, header, scrollable body, and an optional Cancel/Confirm footer bar. `ImportDialog` (new, `apps/studio`) is built on it: a `phase` state machine (`idle → previewing → previewed | error | internal-error`) drives format select → source input → `importModel()` preview → namespace-match check (`namespaceToFile`, already computed in `ExplorePerspective`) → either "Add to workspace" (`createWorkspaceFile`) or "Merge into `<path>`" (`mergeImportedText`, new pure text+CST splice helper using `@rune-langium/core`'s `parse()`). Everything runs client-side; no new server endpoint.

**Tech Stack:** React 19, Zustand 5 (dialog open-state store, mirroring `export-dialog-store.ts`), `@rune-langium/design-system` (Radix-flavored `@base-ui/react` primitives), `@rune-langium/codegen/import` (`importModel`, already shipped spec 021 Phases 1–3), `@rune-langium/core` (`parse`).

## Global Constraints

- **No new server endpoint.** Everything runs client-side, same as the existing Code tab (see `feedback_code_tab_vs_export_button`). `ImportDialog` dynamically `import()`s `@rune-langium/codegen/import` on first Preview click — do not add it as a static top-level import.
- **`InteractiveDialog` is shell-only.** It does not generalize the phase-state-machine or error-banner pattern — each dialog keeps its own body content, phase state, and error rendering. See the design doc addendum for why (three different phase shapes across the three dialogs).
- **SPDX headers:** `packages/design-system/**` = MIT (`// SPDX-License-Identifier: MIT`); `apps/studio/**` = FSL-1.1-ALv2 (`// SPDX-License-Identifier: FSL-1.1-ALv2`). Every new file needs the correct header (copyright line: `// Copyright (c) 2026 Pradeep Mouli`).
- **Retrofits must be pure structural extraction** — no behavior, prop, or `data-testid` changes to `ExportDialog` or `DownloadConfigModal`. Existing tests (`DownloadConfigModal.test.tsx`, `app-header.test.tsx`, the e2e specs touching `export-dialog`/`export-dialog-overlay`) must pass with only the one deliberate `Generate` → `Import` text change called out in Task 7.
- **DRY reuse, not re-derivation:** `ImportDialog` must receive `ExplorePerspective`'s already-memoized `namespaceToFile: Map<namespace, filePath>` (line ~902) as a prop rather than recomputing it from scratch, and use `updateFileContent`/`createWorkspaceFile` from `apps/studio/src/services/workspace.ts` (both already exist, unmodified).
- **No dedicated `InteractiveDialog` unit test.** `packages/design-system` has no test harness today (no `test` script, no jsdom setup, zero test files) and the component has no logic of its own — it is exercised transitively through `DownloadConfigModal.test.tsx` and the new `ImportDialog.test.tsx`, both under `apps/studio`'s jsdom vitest environment. Do not add test infrastructure to `design-system` as part of this plan.
- **Design doc:** `docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md` (including its 2026-07-09 addendum) is the source of truth for the dialog flow, the merge algorithm, and the `InteractiveDialog` API. Read it before Task 6.

## File Structure

- **`packages/design-system/src/ui/interactive-dialog.tsx`** (new, MIT) — `InteractiveDialog` shell component.
- **`packages/design-system/package.json`** (modify) — add `./ui/interactive-dialog` export.
- **`packages/design-system/src/ui/index.tsx`** (modify) — barrel re-export.
- **`apps/studio/src/components/ExportDialog.tsx`** (modify) — retrofit onto `InteractiveDialog`.
- **`apps/studio/src/components/DownloadConfigModal.tsx`** (modify) — retrofit onto `InteractiveDialog`.
- **`apps/studio/src/shell/import-merge.ts`** (new, FSL) — `mergeImportedText` pure function.
- **`apps/studio/src/shell/import-dialog-store.ts`** (new, FSL) — Zustand open-state store.
- **`apps/studio/src/components/ImportDialog.tsx`** (new, FSL) — the dialog.
- **`apps/studio/src/shell/perspectives/explore-chrome.tsx`** (modify) — swap `Generate`/`Zap` for `Import`/`Wand2`.
- **`apps/studio/src/shell/ExplorePerspective.tsx`** (modify) — mount `<ImportDialog>`.
- **`apps/studio/src/app.css`** (modify) — rename `.studio-topbar__generate` → `.studio-topbar__import`.
- **`apps/studio/test/shell/app-header.test.tsx`** (modify) — update 3 `'Generate'` text assertions to `'Import'`.
- Tests: `apps/studio/test/shell/import-merge.test.ts`, `apps/studio/test/store/import-dialog-store.test.ts`, `apps/studio/test/components/ImportDialog.test.tsx`.

---

### Task 1: `InteractiveDialog` shared shell component

**Files:**
- Create: `packages/design-system/src/ui/interactive-dialog.tsx`
- Modify: `packages/design-system/package.json`
- Modify: `packages/design-system/src/ui/index.tsx`

**Interfaces:**
- Produces: `InteractiveDialog` component, `InteractiveDialogProps` type — consumed by Tasks 2, 3, 6.

- [ ] **Step 1: Create the component**

```tsx
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * InteractiveDialog — shared shell for Studio's single-screen confirm/cancel
 * dialogs (ExportDialog, DownloadConfigModal, ImportDialog). Standardizes
 * sizing, header, scrollable body, and an optional footer bar; each
 * consumer keeps its own phase state machine and error rendering — see
 * docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md's
 * 2026-07-09 addendum for why this stays shell-only.
 */

import * as React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogOverlay, DialogTitle } from './dialog';
import { Separator } from './separator';
import { cn } from '../utils';

export interface InteractiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Rendered as a visually-hidden DialogDescription (a11y only). */
  description: React.ReactNode;
  /** Tailwind width class, e.g. "w-[720px]" — combined with the shared max-w-[92vw] max-h-[80vh] sizing. */
  width: string;
  /** data-testid on the rendered DialogContent. */
  testId: string;
  /** Forwarded to DialogContent's overlayProps, e.g. { 'data-testid': 'export-dialog-overlay' }. */
  overlayProps?: React.ComponentProps<typeof DialogOverlay>;
  /** Extra classes merged onto the scrollable body div (default: 'flex-1 min-h-0 flex flex-col'). */
  bodyClassName?: string;
  /** Footer content, rendered after a Separator in a standard button-bar. Omit for dialogs whose actions live inline in the body. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function InteractiveDialog({
  open,
  onOpenChange,
  title,
  description,
  width,
  testId,
  overlayProps,
  bodyClassName,
  footer,
  children
}: InteractiveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('max-w-[92vw] max-h-[80vh] flex flex-col gap-0 p-0', width)}
        data-testid={testId}
        overlayProps={overlayProps}
      >
        <DialogHeader className="px-4 py-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <Separator />

        <div className={cn('flex-1 min-h-0 flex flex-col', bodyClassName)}>{children}</div>

        {footer && (
          <>
            <Separator />
            <div className="flex justify-end gap-2 px-4 py-3">{footer}</div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the package export**

In `packages/design-system/package.json`, inside `"exports"`, add a new line directly after the existing `"./ui/icon-button-group": "./src/ui/icon-button-group.tsx",` entry:

```json
    "./ui/interactive-dialog": "./src/ui/interactive-dialog.tsx",
```

- [ ] **Step 3: Add the barrel re-export**

In `packages/design-system/src/ui/index.tsx`, add alongside the existing `export * from './dialog.js';`:

```ts
export * from './interactive-dialog.js';
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @rune-langium/design-system run type-check`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/design-system/src/ui/interactive-dialog.tsx packages/design-system/package.json packages/design-system/src/ui/index.tsx
git commit -m "feat(design-system): add InteractiveDialog shared shell component"
```

---

### Task 2: Retrofit `ExportDialog` onto `InteractiveDialog`

**Files:**
- Modify: `apps/studio/src/components/ExportDialog.tsx`

**Interfaces:**
- Consumes: `InteractiveDialog` (Task 1).

- [ ] **Step 1: Replace the imports**

Replace:

```ts
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@rune-langium/design-system/ui/dialog';
```

with:

```ts
import { InteractiveDialog } from '@rune-langium/design-system/ui/interactive-dialog';
```

Remove the `import { Separator } from '@rune-langium/design-system/ui/separator';` line — it was only used for the header divider, which `InteractiveDialog` now owns, and nothing else in this file uses `Separator`.

- [ ] **Step 2: Replace the returned JSX shell**

Replace the `return (...)` block (currently):

```tsx
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="w-[720px] max-w-[92vw] max-h-[80vh] flex flex-col gap-0 p-0"
        data-testid="export-dialog"
        overlayProps={{ 'data-testid': 'export-dialog-overlay' }}
      >
        {/* Header */}
        <DialogHeader className="px-4 py-3">
          <DialogTitle>Export Code</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a target language, generate code, preview the output, and download files.
          </DialogDescription>
        </DialogHeader>
        <Separator />

        {/* Content */}
        <div className="flex-1 min-h-0 p-4 flex flex-col gap-4 overflow-hidden">
          {/* ... all existing body JSX unchanged ... */}
        </div>
      </DialogContent>
    </Dialog>
  );
```

with:

```tsx
  return (
    <InteractiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Export Code"
      description="Choose a target language, generate code, preview the output, and download files."
      width="w-[720px]"
      testId="export-dialog"
      overlayProps={{ 'data-testid': 'export-dialog-overlay' }}
      bodyClassName="p-4 gap-4 overflow-hidden"
    >
      {/* ... all existing body JSX unchanged, one indent level shallower ... */}
    </InteractiveDialog>
  );
```

Everything between the old `<div className="flex-1 min-h-0 p-4 flex flex-col gap-4 overflow-hidden">` and its closing `</div>` (the service-unavailable Alert, validation warnings, Turnstile widget, language selector row, generating/error/done states) moves unchanged into `InteractiveDialog`'s children, de-indented by one level.

- [ ] **Step 3: Type-check + run studio tests**

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS.

Run: `pnpm --filter @rune-langium/studio run test`
Expected: all existing suites pass unchanged (no `ExportDialog.test.tsx` exists today; regression coverage is `app-header.test.tsx`, the `test/pages/EditorPage*.test.tsx` suite, and later `test/e2e/export.spec.ts` / `codegen.spec.ts`, which assert `export-dialog` / `export-dialog-overlay` test-ids — both preserved verbatim above).

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/components/ExportDialog.tsx
git commit -m "refactor(studio): retrofit ExportDialog onto InteractiveDialog"
```

---

### Task 3: Retrofit `DownloadConfigModal` onto `InteractiveDialog`

**Files:**
- Modify: `apps/studio/src/components/DownloadConfigModal.tsx`

**Interfaces:**
- Consumes: `InteractiveDialog` (Task 1).

- [ ] **Step 1: Replace the imports**

Replace:

```ts
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@rune-langium/design-system/ui/dialog';
import { Separator } from '@rune-langium/design-system/ui/separator';
```

with:

```ts
import { InteractiveDialog } from '@rune-langium/design-system/ui/interactive-dialog';
```

- [ ] **Step 2: Replace the returned JSX shell**

Replace (currently, lines 236–364):

```tsx
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="w-[480px] max-w-[92vw] max-h-[80vh] flex flex-col gap-0 p-0"
        data-testid="download-config-modal"
      >
        <DialogHeader className="px-4 py-3">
          <DialogTitle>Generate {descriptor.label}</DialogTitle>
          <DialogDescription className="sr-only">
            Choose layout and namespace subset, then generate {descriptor.label} output.
          </DialogDescription>
        </DialogHeader>
        <Separator />

        <div className="studio-scroll flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-5">
          {/* ... Layout / Options / Namespaces sections, unchanged ... */}
        </div>
      </DialogContent>

        <Separator />
        <div className="flex justify-end gap-2 px-4 py-3">
          <Button variant="secondary" size="sm" onClick={onClose} data-testid="download-config-modal__cancel">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generateDisabled}
            data-testid="download-config-modal__generate"
          >
            Generate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
```

with:

```tsx
  return (
    <InteractiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={`Generate ${descriptor.label}`}
      description={`Choose layout and namespace subset, then generate ${descriptor.label} output.`}
      width="w-[480px]"
      testId="download-config-modal"
      bodyClassName="studio-scroll overflow-auto p-4 gap-5"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} data-testid="download-config-modal__cancel">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generateDisabled}
            data-testid="download-config-modal__generate"
          >
            Generate
          </Button>
        </>
      }
    >
      {/* ... Layout / Options / Namespaces sections, unchanged, one indent level shallower ... */}
    </InteractiveDialog>
  );
```

(Note the original had a stray nesting — the footer bar was inside the same `<DialogContent>` as the scrollable body, after its closing `</div>` but before `</DialogContent>`. `InteractiveDialog`'s `footer` prop reproduces that exact structure: body div, then Separator, then footer bar, all inside one `DialogContent`.)

- [ ] **Step 3: Run the existing test suite**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/DownloadConfigModal.test.tsx`
Expected: all existing assertions pass unchanged — `download-config-modal`, `download-config-modal__cancel`, `download-config-modal__generate`, and the `download-config-modal__layout`/`__options`/`__namespaces` section test-ids are untouched by this refactor.

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/components/DownloadConfigModal.tsx
git commit -m "refactor(studio): retrofit DownloadConfigModal onto InteractiveDialog"
```

---

### Task 4: `import-merge.ts` — text+CST merge helper

**Files:**
- Create: `apps/studio/src/shell/import-merge.ts`
- Test: `apps/studio/test/shell/import-merge.test.ts`

**Interfaces:**
- Consumes: `parse` from `@rune-langium/core`.
- Produces: `mergeImportedText(existingText, importedText): Promise<MergeResult>`, `MergeResult` type — consumed by Task 6.

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { mergeImportedText } from '../../src/shell/import-merge.js';

const EXISTING = `namespace example
version "0.0.0"

type Party:
  name string (1..1)
`;

const IMPORTED_NO_COLLISION = `namespace example
version "0.0.0"

type Trade:
  quantity number (1..1)
`;

const IMPORTED_ALL_COLLIDE = `namespace example
version "0.0.0"

type Party:
  id string (1..1)
`;

describe('mergeImportedText', () => {
  it('appends every imported element when there are no collisions', async () => {
    const result = await mergeImportedText(EXISTING, IMPORTED_NO_COLLISION);
    expect(result.skipped).toEqual([]);
    expect(result.mergedText).toContain('type Party');
    expect(result.mergedText).toContain('type Trade');
  });

  it('skips a colliding element and keeps the existing one', async () => {
    const result = await mergeImportedText(EXISTING, IMPORTED_ALL_COLLIDE);
    expect(result.skipped).toEqual(['Party']);
    expect(result.mergedText).toContain('name string (1..1)');
    expect(result.mergedText).not.toContain('id string (1..1)');
  });

  it('drops every imported element when all collide, leaving existingText unchanged', async () => {
    const result = await mergeImportedText(EXISTING, IMPORTED_ALL_COLLIDE);
    expect(result.mergedText).toBe(EXISTING);
  });

  it('always produces text that re-parses with zero errors', async () => {
    const { parse } = await import('@rune-langium/core');
    const result = await mergeImportedText(EXISTING, IMPORTED_NO_COLLISION);
    const reparsed = await parse(result.mergedText);
    expect(reparsed.hasErrors).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/import-merge.test.ts`
Expected: FAIL with "Cannot find module '../../src/shell/import-merge.js'".

- [ ] **Step 3: Write the implementation**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Text+CST-level merge for ImportDialog's "merge into an open file" path
 * (spec 021 Phase 4 consumer — see
 * docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md).
 * Operates only on top-level elements (types/enums/choices/functions);
 * never rewrites an existing declaration's body. A name collision always
 * means "keep what's already there, skip the incoming one."
 */

import { parse } from '@rune-langium/core';

export interface MergeResult {
  mergedText: string;
  /** Element names dropped due to a name collision with the target file. */
  skipped: string[];
}

/**
 * Merges `importedText`'s top-level elements into `existingText`, dropping
 * any element whose name already exists in `existingText`. Throws if either
 * input, or the merged result, fails to parse — that is this function's own
 * invariant (importModel() already guarantees importedText parses cleanly;
 * a failure here means a bug in this splice logic, not a user input error).
 */
export async function mergeImportedText(existingText: string, importedText: string): Promise<MergeResult> {
  const [existingParse, importedParse] = await Promise.all([parse(existingText), parse(importedText)]);
  if (existingParse.hasErrors) {
    throw new Error('mergeImportedText: existingText failed to parse.');
  }
  if (importedParse.hasErrors) {
    throw new Error('mergeImportedText: importedText failed to parse.');
  }

  const existingNames = new Set(
    existingParse.value.elements
      .map((el) => (el as { name?: string }).name)
      .filter((n): n is string => n !== undefined)
  );

  const skipped: string[] = [];
  const spans: string[] = [];
  for (const el of importedParse.value.elements) {
    const name = (el as { name?: string }).name;
    if (name !== undefined && existingNames.has(name)) {
      skipped.push(name);
      continue;
    }
    const cst = el.$cstNode;
    if (!cst) continue;
    spans.push(importedText.slice(cst.offset, cst.offset + cst.length));
  }

  const mergedText = spans.length === 0 ? existingText : `${existingText}\n\n${spans.join('\n\n')}`;

  const mergedParse = await parse(mergedText);
  if (mergedParse.hasErrors) {
    throw new Error('mergeImportedText: merged output failed to re-parse.');
  }

  return { mergedText, skipped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/import-merge.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/import-merge.ts apps/studio/test/shell/import-merge.test.ts
git commit -m "feat(studio): add mergeImportedText text+CST merge helper"
```

---

### Task 5: `import-dialog-store.ts` — open-state store

**Files:**
- Create: `apps/studio/src/shell/import-dialog-store.ts`
- Test: `apps/studio/test/store/import-dialog-store.test.ts`

**Interfaces:**
- Produces: `useImportDialogStore` — consumed by Tasks 6 and 7.

- [ ] **Step 1: Write the failing test**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * import-dialog-store tests. Mirrors export-dialog-store.test.ts — minimal
 * bar+body shared UI state: Explore's header Import button opens the
 * dialog; the body renders <ImportDialog> against the same open flag.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useImportDialogStore } from '../../src/shell/import-dialog-store.js';

describe('import dialog store', () => {
  beforeEach(() => {
    useImportDialogStore.setState({ open: false });
  });

  it('starts closed', () => {
    expect(useImportDialogStore.getState().open).toBe(false);
  });

  it('setOpen(true) opens it', () => {
    useImportDialogStore.getState().setOpen(true);
    expect(useImportDialogStore.getState().open).toBe(true);
  });

  it('setOpen(false) closes it', () => {
    useImportDialogStore.getState().setOpen(true);
    useImportDialogStore.getState().setOpen(false);
    expect(useImportDialogStore.getState().open).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/import-dialog-store.test.ts`
Expected: FAIL with "Cannot find module '../../src/shell/import-dialog-store.js'".

- [ ] **Step 3: Write the implementation**

```ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Import dialog open-state — mirrors export-dialog-store.ts. Shared between
 * Explore's header (the Import button, `ExploreActions`) and the body's
 * `<ImportDialog>` (ExplorePerspective).
 */

import { create } from 'zustand';

interface ImportDialogState {
  open: boolean;
}

interface ImportDialogActions {
  setOpen(open: boolean): void;
}

type ImportDialogStore = ImportDialogState & ImportDialogActions;

export const useImportDialogStore = create<ImportDialogStore>((set) => ({
  open: false,
  setOpen(open) {
    set({ open });
  }
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/store/import-dialog-store.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/import-dialog-store.ts apps/studio/test/store/import-dialog-store.test.ts
git commit -m "feat(studio): add import-dialog-store"
```

---

### Task 6: `ImportDialog` component

**Files:**
- Create: `apps/studio/src/components/ImportDialog.tsx`
- Test: `apps/studio/test/components/ImportDialog.test.tsx`

**Interfaces:**
- Consumes: `InteractiveDialog` (Task 1), `mergeImportedText`/`MergeResult` (Task 4), `importModel`/`ImportResult`/`ImportSourceKind` (from `@rune-langium/codegen/import`, already shipped), `parse` (from `@rune-langium/core`), `createWorkspaceFile`/`updateFileContent`/`WorkspaceFile` (from `apps/studio/src/services/workspace.ts`, already shipped).
- Produces: `ImportDialog` component, `ImportDialogProps` type — consumed by Task 7. Props: `open`, `onClose`, `files: WorkspaceFile[]`, `onFilesChange: (files: WorkspaceFile[]) => void`, `onFileFocused: (path: string) => void`, `namespaceToFile: ReadonlyMap<string, string>`.

Read `docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md` (Dialog Flow + Hard invariant sections) before writing this task — the code below implements it exactly.

- [ ] **Step 1: Write the failing test**

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportDialog } from '../../src/components/ImportDialog.js';
import type { WorkspaceFile } from '../../src/services/workspace.js';

vi.mock('@rune-langium/codegen/import', () => ({
  importModel: vi.fn()
}));
vi.mock('@rune-langium/core', () => ({
  parse: vi.fn()
}));
vi.mock('../../src/shell/import-merge.js', () => ({
  mergeImportedText: vi.fn()
}));

import { importModel } from '@rune-langium/codegen/import';
import { parse } from '@rune-langium/core';
import { mergeImportedText } from '../../src/shell/import-merge.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function baseProps(overrides: Partial<React.ComponentProps<typeof ImportDialog>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    files: [] as WorkspaceFile[],
    onFilesChange: vi.fn(),
    onFileFocused: vi.fn(),
    namespaceToFile: new Map<string, string>(),
    ...overrides
  };
}

describe('ImportDialog', () => {
  it('previews a new-file import and enables "Add to workspace"', async () => {
    (importModel as any).mockResolvedValue({
      text: 'namespace demo\nversion "0.0.0"\n\ntype Foo:\n  bar string (1..1)\n',
      model: { namespace: 'demo', types: [{ name: 'Foo' }], enums: [], funcs: [] },
      diagnostics: []
    });
    (parse as any).mockResolvedValue({ hasErrors: false });

    const props = baseProps();
    render(<ImportDialog {...props} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() => expect(screen.getByTestId('import-dialog__confirm')).not.toBeDisabled());
    expect(screen.getByTestId('import-dialog__confirm')).toHaveTextContent('Add to workspace');

    fireEvent.click(screen.getByTestId('import-dialog__confirm'));
    expect(props.onFilesChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'demo.rosetta', content: expect.stringContaining('type Foo') })
    ]);
    expect(props.onFileFocused).toHaveBeenCalledWith('demo.rosetta');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('previews a namespace match and offers "Merge into <path>"', async () => {
    (importModel as any).mockResolvedValue({
      text: 'namespace demo\nversion "0.0.0"\n\ntype Foo:\n  bar string (1..1)\n',
      model: { namespace: 'demo', types: [{ name: 'Foo' }], enums: [], funcs: [] },
      diagnostics: []
    });
    (mergeImportedText as any).mockResolvedValue({ mergedText: 'MERGED', skipped: ['Existing'] });

    const files: WorkspaceFile[] = [
      { name: 'demo.rosetta', path: 'demo.rosetta', content: 'ORIGINAL', dirty: false }
    ];
    const props = baseProps({ files, namespaceToFile: new Map([['demo', 'demo.rosetta']]) });
    render(<ImportDialog {...props} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() =>
      expect(screen.getByTestId('import-dialog__confirm')).toHaveTextContent('Merge into demo.rosetta')
    );
    expect(screen.getByTestId('import-dialog__merge-banner')).toHaveTextContent('1 declaration(s) skipped');

    fireEvent.click(screen.getByTestId('import-dialog__confirm'));
    expect(props.onFilesChange).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'demo.rosetta', content: 'MERGED', dirty: true })
    ]);
    expect(props.onFileFocused).toHaveBeenCalledWith('demo.rosetta');
  });

  it('shows a user-facing error when the reader throws', async () => {
    (importModel as any).mockRejectedValue(new Error('malformed JSON'));
    render(<ImportDialog {...baseProps()} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: 'not json' } });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() => expect(screen.getByTestId('import-dialog__error')).toHaveTextContent('malformed JSON'));
    expect(screen.getByTestId('import-dialog__confirm')).toBeDisabled();
  });

  it('resets the preview when the format is switched', async () => {
    (importModel as any).mockResolvedValue({
      text: 'namespace demo\nversion "0.0.0"\n',
      model: { namespace: 'demo', types: [{ name: 'Foo' }], enums: [], funcs: [] },
      diagnostics: []
    });
    (parse as any).mockResolvedValue({ hasErrors: false });

    render(<ImportDialog {...baseProps()} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Preview'));
    await waitFor(() => expect(screen.getByTestId('import-dialog__confirm')).not.toBeDisabled());

    const user = userEvent.setup({ writeToClipboard: false });
    await user.click(screen.getByRole('combobox', { name: 'Format:' }));
    await user.click(await screen.findByRole('option', { name: 'OpenAPI' }));

    expect(screen.getByTestId('import-dialog__confirm')).toBeDisabled();
    expect(screen.queryByTestId('import-dialog__preview')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/ImportDialog.test.tsx`
Expected: FAIL with "Cannot find module '../../src/components/ImportDialog.js'".

- [ ] **Step 3: Write the implementation**

```tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * ImportDialog — brings an external schema (JSON Schema / OpenAPI / SQL DDL /
 * XSD) into the workspace as a new `.rune` file, or merges it into an
 * already-open file whose namespace matches (spec 021 Phase 4 consumer —
 * see docs/superpowers/specs/2026-07-06-explorer-import-dialog-design.md).
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@rune-langium/design-system/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rune-langium/design-system/ui/select';
import { Input } from '@rune-langium/design-system/ui/input';
import { Textarea } from '@rune-langium/design-system/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@rune-langium/design-system/ui/alert';
import { InteractiveDialog } from '@rune-langium/design-system/ui/interactive-dialog';
import { parse } from '@rune-langium/core';
import type { ImportResult, ImportSourceKind } from '@rune-langium/codegen/import';
import type { WorkspaceFile } from '../services/workspace.js';
import { createWorkspaceFile, updateFileContent } from '../services/workspace.js';
import { mergeImportedText, type MergeResult } from '../shell/import-merge.js';

export interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  files: WorkspaceFile[];
  onFilesChange: (files: WorkspaceFile[]) => void;
  onFileFocused: (path: string) => void;
  /** namespace -> path, for every currently-open workspace file (ExplorePerspective's `namespaceToFile`). */
  namespaceToFile: ReadonlyMap<string, string>;
}

type ImportFormat = Extract<ImportSourceKind, 'json-schema' | 'openapi' | 'sql' | 'xsd'>;

const FORMAT_OPTIONS: Array<{ value: ImportFormat; label: string }> = [
  { value: 'json-schema', label: 'JSON Schema' },
  { value: 'openapi', label: 'OpenAPI' },
  { value: 'sql', label: 'SQL DDL' },
  { value: 'xsd', label: 'XSD' }
];

type Phase =
  | { kind: 'idle' }
  | { kind: 'previewing' }
  | { kind: 'previewed'; result: ImportResult; matchedPath: string | null; merge: MergeResult | null }
  | { kind: 'error'; message: string }
  | { kind: 'internal-error'; message: string };

export function ImportDialog({
  open,
  onClose,
  files,
  onFilesChange,
  onFileFocused,
  namespaceToFile
}: ImportDialogProps) {
  const [format, setFormat] = useState<ImportFormat>('json-schema');
  const [sourceText, setSourceText] = useState('');
  const [namespaceField, setNamespaceField] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    if (!open) return;
    setFormat('json-schema');
    setSourceText('');
    setNamespaceField('');
    setPhase({ kind: 'idle' });
  }, [open]);

  // Format switch invalidates any prior preview — it was run against a
  // different reader and no longer reflects the selected format.
  useEffect(() => {
    setPhase({ kind: 'idle' });
  }, [format]);

  const handlePreview = useCallback(async () => {
    setPhase({ kind: 'previewing' });
    try {
      const { importModel } = await import('@rune-langium/codegen/import');
      const result = await importModel(sourceText, {
        from: format,
        namespace: namespaceField.trim() || undefined
      });
      if (!namespaceField.trim()) setNamespaceField(result.model.namespace);

      const matchedPath = namespaceToFile.get(result.model.namespace) ?? null;
      if (matchedPath) {
        const existing = files.find((f) => f.path === matchedPath);
        if (existing) {
          const merge = await mergeImportedText(existing.content, result.text);
          setPhase({ kind: 'previewed', result, matchedPath, merge });
          return;
        }
      }
      // New-file path: importModel() already guarantees result.text parses
      // cleanly, but we re-verify explicitly rather than trusting that blindly.
      const check = await parse(result.text);
      if (check.hasErrors) {
        setPhase({ kind: 'internal-error', message: 'Imported text failed re-parse — please file a bug.' });
        return;
      }
      setPhase({ kind: 'previewed', result, matchedPath: null, merge: null });
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [sourceText, format, namespaceField, namespaceToFile, files]);

  const handleConfirm = useCallback(() => {
    if (phase.kind !== 'previewed') return;
    const { result, matchedPath, merge } = phase;
    if (matchedPath && merge) {
      onFilesChange(updateFileContent(files, matchedPath, merge.mergedText));
      onFileFocused(matchedPath);
    } else {
      const file = createWorkspaceFile(`${result.model.namespace}.rosetta`, result.text);
      onFilesChange([...files, file]);
      onFileFocused(file.path);
    }
    onClose();
  }, [phase, files, onFilesChange, onFileFocused, onClose]);

  const handleFileDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    void file.text().then(setSourceText);
  }, []);

  const nothingToImport =
    phase.kind === 'previewed' &&
    phase.result.model.types.length === 0 &&
    phase.result.model.enums.length === 0 &&
    phase.result.model.funcs.length === 0;

  const confirmDisabled = phase.kind !== 'previewed' || nothingToImport;
  const confirmLabel =
    phase.kind === 'previewed' && phase.matchedPath ? `Merge into ${phase.matchedPath}` : 'Add to workspace';

  return (
    <InteractiveDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Import Model"
      description="Pick a source format, provide the source, preview the generated model, and add it to the workspace."
      width="w-[640px]"
      testId="import-dialog"
      bodyClassName="p-4 gap-4 overflow-auto"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} data-testid="import-dialog__cancel">
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} disabled={confirmDisabled} data-testid="import-dialog__confirm">
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="import-dialog-format">
          Format:
        </label>
        <Select value={format} onValueChange={(v) => setFormat(v as ImportFormat)} disabled={phase.kind === 'previewing'}>
          <SelectTrigger id="import-dialog-format" size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMAT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div
        className="border border-dashed border-border rounded p-3 text-xs text-muted-foreground"
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        data-testid="import-dialog__dropzone"
      >
        Drop a file here, or paste the source below.
      </div>

      <Textarea
        value={sourceText}
        onChange={(e) => setSourceText(e.target.value)}
        placeholder="Paste source text…"
        className="min-h-32 font-mono text-xs"
        data-testid="import-dialog__source"
      />

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium" htmlFor="import-dialog-namespace">
          Namespace:
        </label>
        <Input
          id="import-dialog-namespace"
          value={namespaceField}
          onChange={(e) => setNamespaceField(e.target.value)}
          placeholder="(derived from source)"
          className="flex-1"
          data-testid="import-dialog__namespace"
        />
        <Button size="sm" onClick={() => void handlePreview()} disabled={!sourceText || phase.kind === 'previewing'}>
          Preview
        </Button>
      </div>

      {phase.kind === 'error' && (
        <Alert variant="destructive" data-testid="import-dialog__error">
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      )}

      {phase.kind === 'internal-error' && (
        <Alert variant="destructive" data-testid="import-dialog__internal-error">
          <AlertTitle>Internal error</AlertTitle>
          <AlertDescription>{phase.message}</AlertDescription>
        </Alert>
      )}

      {phase.kind === 'previewed' && (
        <>
          <p className="text-xs text-muted-foreground" data-testid="import-dialog__summary">
            {phase.result.model.types.length} type(s), {phase.result.model.enums.length} enum(s),{' '}
            {phase.result.model.funcs.length} func(s) · {phase.result.diagnostics.length} diagnostic(s)
          </p>
          {nothingToImport && (
            <Alert data-testid="import-dialog__empty">
              <AlertDescription>
                Nothing to import — the source produced no types, enums, or functions.
              </AlertDescription>
            </Alert>
          )}
          {phase.matchedPath && phase.merge && (
            <Alert data-testid="import-dialog__merge-banner">
              <AlertDescription>
                Will merge into <span className="font-mono">{phase.matchedPath}</span>
                {phase.merge.skipped.length > 0 &&
                  ` — ${phase.merge.skipped.length} declaration(s) skipped, already exist: ${phase.merge.skipped.join(', ')}`}
              </AlertDescription>
            </Alert>
          )}
          <pre
            className="studio-scroll flex-1 min-h-0 border border-border rounded bg-muted/30 p-3 text-xs font-mono whitespace-pre overflow-auto"
            data-testid="import-dialog__preview"
          >
            {phase.matchedPath && phase.merge ? phase.merge.mergedText : phase.result.text}
          </pre>
        </>
      )}
    </InteractiveDialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/components/ImportDialog.test.tsx`
Expected: PASS, 4/4.

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/components/ImportDialog.tsx apps/studio/test/components/ImportDialog.test.tsx
git commit -m "feat(studio): add ImportDialog"
```

---

### Task 7: Wire the Import button + mount `ImportDialog`

**Files:**
- Modify: `apps/studio/src/shell/perspectives/explore-chrome.tsx`
- Modify: `apps/studio/src/shell/ExplorePerspective.tsx`
- Modify: `apps/studio/src/app.css`
- Modify: `apps/studio/test/shell/app-header.test.tsx`

**Interfaces:**
- Consumes: `useImportDialogStore` (Task 5), `ImportDialog` (Task 6).

- [ ] **Step 1: Update the failing assertions first (TDD for the rename)**

In `apps/studio/test/shell/app-header.test.tsx`, change all three occurrences of the literal `'Generate'` to `'Import'`:

- Line 120: `expect(screen.getByText('Generate')).toBeInTheDocument();` → `expect(screen.getByText('Import')).toBeInTheDocument();`
- Line 128: `expect(screen.queryByText('Generate')).not.toBeInTheDocument();` → `expect(screen.queryByText('Import')).not.toBeInTheDocument();`
- Line 165: `expect(screen.queryByText('Generate')).not.toBeInTheDocument();` → `expect(screen.queryByText('Import')).not.toBeInTheDocument();`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/app-header.test.tsx`
Expected: FAIL — the topbar still renders "Generate", not "Import".

- [ ] **Step 3: Update `explore-chrome.tsx`**

Change the icon import (currently `import { Check, Download, Share2, Zap, Plus } from 'lucide-react';`):

```ts
import { Check, Download, Share2, Wand2, Plus } from 'lucide-react';
```

Add the store import alongside the existing one:

```ts
import { useExportDialogStore } from '../export-dialog-store.js';
import { useImportDialogStore } from '../import-dialog-store.js';
```

Replace `ExploreActions` (currently lines 166–191):

```tsx
export function ExploreActions() {
  const setShowExportDialog = useExportDialogStore((s) => s.setOpen);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Validate" title="Validate">
        <Check />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Export code"
        title="Export code"
        onClick={() => setShowExportDialog(true)}
      >
        <Download />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Share" title="Share">
        <Share2 />
      </Button>
      <button type="button" className="studio-topbar__generate" onClick={() => setShowExportDialog(true)}>
        <Zap className="size-3.5" />
        Generate
      </button>
    </>
  );
}
```

with:

```tsx
export function ExploreActions() {
  const setShowExportDialog = useExportDialogStore((s) => s.setOpen);
  const setShowImportDialog = useImportDialogStore((s) => s.setOpen);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Validate" title="Validate">
        <Check />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Export code"
        title="Export code"
        onClick={() => setShowExportDialog(true)}
      >
        <Download />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Share" title="Share">
        <Share2 />
      </Button>
      <button type="button" className="studio-topbar__import" onClick={() => setShowImportDialog(true)}>
        <Wand2 className="size-3.5" />
        Import
      </button>
    </>
  );
}
```

- [ ] **Step 4: Rename the CSS class**

In `apps/studio/src/app.css`, rename all three `.studio-app .studio-topbar__generate` selectors (base, `:hover`, `:active`) to `.studio-app .studio-topbar__import`:

```css
  .studio-app .studio-topbar__import {
    appearance: none;
    border: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 28px;
    padding: 0 var(--space-4);
    border-radius: var(--radius);
    font-size: var(--text-xs);
    font-weight: 600;
    background: var(--primary);
    color: var(--primary-foreground);
    cursor: pointer;
    box-shadow:
      0 0 0 0.5px color-mix(in oklch, var(--primary), transparent 60%),
      0 6px 18px -6px color-mix(in oklch, var(--primary), transparent 50%);
    transition: filter 0.15s ease, transform 0.05s ease, box-shadow 0.15s ease;
  }

  .studio-app .studio-topbar__import:hover {
    filter: brightness(1.1);
    box-shadow:
      0 0 0 0.5px color-mix(in oklch, var(--primary), transparent 50%),
      0 8px 22px -6px color-mix(in oklch, var(--primary), transparent 35%);
  }

  /* :focus-visible ring covered by the global baseline. */

  .studio-app .studio-topbar__import:active {
    transform: translateY(0.5px) scale(0.99);
    filter: brightness(0.96);
  }
```

- [ ] **Step 5: Mount `ImportDialog` in `ExplorePerspective.tsx`**

Add the imports alongside the existing `ExportDialog`/`useExportDialogStore` ones:

```ts
import { ImportDialog } from '../components/ImportDialog.js';
import { useImportDialogStore } from './import-dialog-store.js';
```

Add the store reads alongside the existing `showExportDialog`/`setShowExportDialog` (around line 409):

```ts
  const showImportDialog = useImportDialogStore((s) => s.open);
  const setShowImportDialog = useImportDialogStore((s) => s.setOpen);
```

Add the mount, right after the existing `<ExportDialog .../>` (around line 1900):

```tsx
      <ExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        getUserFiles={getSerializedFiles}
        validateModel={validateModelForExport}
      />

      <ImportDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        files={files}
        onFilesChange={(next) => onFilesChange?.(next)}
        onFileFocused={openFileInSource}
        namespaceToFile={namespaceToFile}
      />
```

`files`, `onFilesChange`, `openFileInSource`, and `namespaceToFile` are all already in scope in `ExplorePerspective` (the same values `handleModelChanged`/`ExploreCenterSlot`'s wiring already use) — no new derivation needed.

- [ ] **Step 6: Run tests + type-check**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/app-header.test.tsx`
Expected: PASS, all 3 previously-failing assertions now pass.

Run: `pnpm --filter @rune-langium/studio run test`
Expected: full suite passes (no other suite asserts the topbar's `'Generate'` text or `.studio-topbar__generate` class — verified during planning).

Run: `pnpm --filter @rune-langium/studio run type-check`
Expected: PASS.

Run: `pnpm run type-check` (root)
Expected: PASS across all packages — this is the cross-package seam check ([[feedback_ve_actions_interface_studio_seam]]): confirm nothing outside `apps/studio` references the old `Generate` topbar button or `.studio-topbar__generate` class.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/shell/perspectives/explore-chrome.tsx apps/studio/src/shell/ExplorePerspective.tsx apps/studio/src/app.css apps/studio/test/shell/app-header.test.tsx
git commit -m "feat(studio): replace dead Generate button with Import, mount ImportDialog"
```

---

## Final Verification (after all 7 tasks)

- [ ] Run `pnpm run type-check` (root) — all packages clean.
- [ ] Run `pnpm --filter @rune-langium/studio run test` — full suite green.
- [ ] Run `pnpm --filter @rune-langium/codegen run test` — unaffected, sanity check only (this plan touches no codegen files).
- [ ] Manually smoke-test in the dev server (`pnpm --filter @rune-langium/studio run dev`): open Explore, click Import, paste a small JSON Schema document, Preview, confirm "Add to workspace" creates and focuses a new file; then re-open Import with a source targeting the same namespace and confirm the banner + "Merge into `<path>`" path works.
