# Studio Provider Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple current-model state, the LSP transport, and the codegen/preview worker from `EditorPage`/`App` into a single `StudioProviders` composition root, and split `EditorPage` into the app shell + an `ExplorePerspective`.

**Architecture:** A `StudioProviders` root mounts (sibling) the reserved `GithubProvider` slot and `WorkspaceProvider`; `WorkspaceProvider` publishes current-model **data** via `WorkspaceStateContext` (and re-exposes the existing `WorkspaceActionsContext`), with peer children `LspProvider` and `CodegenProvider` that read `useWorkspace()`. App keeps workspace *selection/boot/persistence* (Approach B); only `WorkspaceProvider`'s context **value** changes per model — no provider remounts. `EditorPage` becomes the app shell (lifted) + `ExplorePerspective` (the `DockShell` content).

**Tech Stack:** React 19, zustand 5 (module singletons, NOT in the root), TypeScript 5.9 ESM, Vitest 4, @testing-library/react. Spec: `docs/superpowers/specs/2026-05-22-provider-architecture-design.md`.

---

## How to read the relocation tasks

This is an **in-place refactor**, not greenfield. Two task kinds appear:

- **New-unit tasks** (contexts, hooks, providers): full code is given — type it as written.
- **Relocation tasks** (move logic out of `App.tsx`/`EditorPage.tsx`): given as a precise **move manifest** — exact source line ranges, the symbols/effects/refs/imports that move, the destination file's resulting skeleton, and a **guard test** that must stay green. The relocation must be **behavior-preserving**: do not rewrite logic, only move it and rewire its inputs (props → `useWorkspace()`/`useLsp()`). The existing test suite is the guardrail; run the full studio suite (`pnpm --filter @rune-langium/studio test`, ~9s) after every relocation task — a curated subset is not sufficient (sibling tests assert old behavior).

**SPDX header** on every new file: `// SPDX-License-Identifier: FSL-1.1-ALv2` then `// Copyright (c) 2026 Pradeep Mouli`.

**Commit discipline:** `SKIP_SIMPLE_GIT_HOOKS=1 git commit` (not `--no-verify`). Branch `refactor/studio-providers` is already created off `master`.

---

## File structure

**Create:**
- `apps/studio/src/shell/providers/workspace-context.ts` — `WorkspaceState` type, `WorkspaceStateContext`, `useWorkspace()`.
- `apps/studio/src/shell/providers/WorkspaceProvider.tsx` — owns loaded-model data; provides `WorkspaceStateContext` + `WorkspaceActionsContext`.
- `apps/studio/src/shell/providers/lsp-context.ts` — `LspContextValue` type, `LspContext`, `useLsp()`.
- `apps/studio/src/shell/providers/LspProvider.tsx` — owns `lspClient`/`transportState`/`reconnect`; re-syncs docs on model change.
- `apps/studio/src/shell/providers/CodegenProvider.tsx` — owns the one Worker + `preview:*` & `codegen:*` channels (the lifted EditorPage effects).
- `apps/studio/src/shell/providers/StudioProviders.tsx` — composition root.
- `apps/studio/src/shell/ExplorePerspective.tsx` — the `DockShell` workbench content (former EditorPage body), reading `useWorkspace()`/`useLsp()`.
- Test files mirroring each (under `apps/studio/test/shell/providers/`).

**Modify:**
- `apps/studio/src/App.tsx` — keep selection/boot/persistence + action handlers; render `StudioProviders`; drop the threaded props + the moved LSP/worker/state.
- `apps/studio/src/pages/EditorPage.tsx` — split: shell chrome lifts to App/StudioProviders; body becomes `ExplorePerspective`. File is deleted at the end of Task 6.
- `apps/studio/src/shell/perspectives/PerspectiveHost.tsx` — `explore` slot now renders `<ExplorePerspective />` directly (no prop threading).
- `apps/studio/src/shell/perspectives/workspace-actions-context.ts` — unchanged shape; re-homed import path tolerated (keep where it is).

**Do NOT touch:** the four zustand stores (`model-store`, `codegen-store`, `preview-store`, `perspective-store`) — they stay module singletons; dockview/visual-editor-local contexts.

---

## Task 1: WorkspaceStateContext + useWorkspace

**Files:**
- Create: `apps/studio/src/shell/providers/workspace-context.ts`
- Test: `apps/studio/test/shell/providers/workspace-context.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// apps/studio/test/shell/providers/workspace-context.test.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkspaceStateContext, useWorkspace, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';

function Probe() {
  const ws = useWorkspace();
  return <span data-testid="probe">{ws.workspaceId ?? 'none'}:{ws.fileCount}</span>;
}

const value: WorkspaceState = {
  workspaceId: 'ws-1', workspaceKind: 'browser-only', workspaceName: 'P', fileCount: 2,
  files: [], models: [], parsedModels: [], deferredExports: []
};

describe('useWorkspace', () => {
  it('throws outside a provider', () => {
    expect(() => render(<Probe />)).toThrow(/within a WorkspaceProvider/);
  });
  it('reads the provided value', () => {
    render(<WorkspaceStateContext.Provider value={value}><Probe /></WorkspaceStateContext.Provider>);
    expect(screen.getByTestId('probe').textContent).toBe('ws-1:2');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found)**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/workspace-context.test.tsx`
Expected: FAIL — cannot resolve `workspace-context.js`.

- [ ] **Step 3: Implement the context**

```ts
// apps/studio/src/shell/providers/workspace-context.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createContext, useContext } from 'react';
import type { WorkspaceKind } from '../../workspace/persistence.js';
import type { WorkspaceFile } from '../../services/workspace.js';
import type { RosettaModel } from '@rune-langium/core';
import type { DeferredExportEntry } from '../../types/model-types.js';

/** Current loaded-model data published by WorkspaceProvider. Value swaps per
 *  workspace; the provider component never remounts. */
export interface WorkspaceState {
  workspaceId?: string;
  workspaceKind?: WorkspaceKind;
  workspaceName?: string;
  fileCount: number;
  files: ReadonlyArray<WorkspaceFile>;
  models: RosettaModel[];
  parsedModels: Array<{ filePath: string; model: RosettaModel }>;
  deferredExports: DeferredExportEntry[];
}

export const WorkspaceStateContext = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceStateContext);
  if (ctx === null) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
```

> **Note:** confirm the exact import paths/type names by reading `apps/studio/src/pages/EditorPage.tsx:241-274` (the current `EditorPageProps` uses `RosettaModel`, `DeferredExportEntry`/`deferredExports`, `WorkspaceFile`, `WorkspaceKind`). Match them verbatim — if `deferredExports` is typed `Record<string, ExportQueueEntry>` there, use that type here instead. Do not invent a shape.

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/workspace-context.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/providers/workspace-context.ts apps/studio/test/shell/providers/workspace-context.test.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): WorkspaceStateContext + useWorkspace hook"
```

---

## Task 2: WorkspaceProvider (state half + re-export actions)

**Files:**
- Create: `apps/studio/src/shell/providers/WorkspaceProvider.tsx`
- Test: `apps/studio/test/shell/providers/WorkspaceProvider.test.tsx`

**Design:** `WorkspaceProvider` is a *presentational* provider — it receives the current-model data + the actions value as props (App computes them, Approach B) and supplies both contexts. This keeps App as the state owner while moving the *provision* into one place. Its value is memoized so an atomic swap is a single new object.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/studio/test/shell/providers/WorkspaceProvider.test.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { WorkspaceProvider } from '../../../src/shell/providers/WorkspaceProvider.js';
import { useWorkspace } from '../../../src/shell/providers/workspace-context.js';
import { useWorkspaceActions } from '../../../src/shell/perspectives/workspace-actions-context.js';

const noopActions = {
  files: [], onFilesLoaded: () => {}, createGitBackedWorkspace: () => {},
  onGitHubWorkspaceCreated: () => {}, onOpenWorkspace: () => {},
  onCreateWorkspace: () => {}, onDeleteWorkspace: () => {}
};
function stateFor(id: string) {
  return { workspaceId: id, workspaceKind: 'browser-only' as const, workspaceName: id, fileCount: 0,
    files: [], models: [], parsedModels: [], deferredExports: [] };
}

let actionRenderCount = 0;
function ActionsProbe() { useWorkspaceActions(); actionRenderCount += 1; return null; }
function StateProbe() { return <span data-testid="id">{useWorkspace().workspaceId}</span>; }

describe('WorkspaceProvider', () => {
  it('publishes state + actions to consumers', () => {
    render(
      <WorkspaceProvider state={stateFor('ws-A')} actions={noopActions}>
        <StateProbe />
      </WorkspaceProvider>
    );
    expect(screen.getByTestId('id').textContent).toBe('ws-A');
  });

  it('swaps the published model atomically on a workspace change', () => {
    function Host() {
      const [id, setId] = useState('ws-A');
      return (
        <>
          <button onClick={() => setId('ws-B')}>switch</button>
          <WorkspaceProvider state={stateFor(id)} actions={noopActions}><StateProbe /></WorkspaceProvider>
        </>
      );
    }
    render(<Host />);
    expect(screen.getByTestId('id').textContent).toBe('ws-A');
    act(() => screen.getByText('switch').click());
    expect(screen.getByTestId('id').textContent).toBe('ws-B');
  });

  it('does not re-render action-only consumers when state changes but actions are stable', () => {
    function Host() {
      const [id, setId] = useState('ws-A');
      return (
        <>
          <button onClick={() => setId('ws-B')}>switch</button>
          <WorkspaceProvider state={stateFor(id)} actions={noopActions}><ActionsProbe /></WorkspaceProvider>
        </>
      );
    }
    actionRenderCount = 0;
    render(<Host />);
    const after1 = actionRenderCount;
    act(() => screen.getByText('switch').click());
    expect(actionRenderCount).toBe(after1); // actions context value unchanged → no re-render
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found)**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/WorkspaceProvider.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the provider**

```tsx
// apps/studio/src/shell/providers/WorkspaceProvider.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { WorkspaceStateContext, type WorkspaceState } from './workspace-context.js';
import { WorkspaceActionsContext, type WorkspaceActions } from '../perspectives/workspace-actions-context.js';

interface Props {
  state: WorkspaceState;
  actions: WorkspaceActions;
  children: React.ReactNode;
}

/**
 * Supplies the two workspace contexts. App (the workspace-selection/boot owner,
 * Approach B) computes `state` (current-model data) and `actions` (handlers) and
 * passes them here; this is the single seam consumers read from. Splitting state
 * and actions keeps action-only consumers (WorkspacesPerspective) from
 * re-rendering on state churn. The component never remounts on a workspace
 * switch — only the `state` value object changes.
 */
export function WorkspaceProvider({ state, actions, children }: Props): React.ReactElement {
  return (
    <WorkspaceActionsContext.Provider value={actions}>
      <WorkspaceStateContext.Provider value={state}>{children}</WorkspaceStateContext.Provider>
    </WorkspaceActionsContext.Provider>
  );
}
```

> **Prerequisite:** `workspace-actions-context.ts` must export its value type. Read `apps/studio/src/shell/perspectives/workspace-actions-context.ts`; if the interface is named differently (e.g. inline), add `export interface WorkspaceActions { ... }` matching the existing shape (`files` + the 6 handlers) and have the context use it. Make that edit in this step.

- [ ] **Step 4: Run it — expect PASS (3 tests)**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/WorkspaceProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/shell/providers/WorkspaceProvider.tsx apps/studio/src/shell/perspectives/workspace-actions-context.ts apps/studio/test/shell/providers/WorkspaceProvider.test.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): WorkspaceProvider supplies state + actions contexts"
```

---

## Task 3: LspProvider + useLsp

**Files:**
- Create: `apps/studio/src/shell/providers/lsp-context.ts`, `apps/studio/src/shell/providers/LspProvider.tsx`
- Test: `apps/studio/test/shell/providers/LspProvider.test.tsx`
- Read first: `apps/studio/src/App.tsx` for `lspClientRef`, `providerRef = createTransportProvider(...)`, `transportState`/`setTransportState`, `handleReconnect`, and the effect that connects the LSP + the `syncWorkspaceFiles` calls (search `lspClientRef`, `createTransportProvider`, `onStateChange`, `syncWorkspaceFiles`, `reconnect`).

**Design:** `LspProvider` is created **once** (refs + a connect effect on mount), reads `files` from `useWorkspace()`, and on `files` change calls `lspClient.syncWorkspaceFiles(...)` (the doc-set re-sync — NOT a reconnect). It exposes `{ lspClient, transportState, reconnect }` via `useLsp()`. The transport-selection/connect/`onStateChange` wiring moves verbatim from App.

- [ ] **Step 1: Write the failing test** (transport + client are mocked, mirroring `test/components/App-restore.test.tsx:44-58`)

```tsx
// apps/studio/test/shell/providers/LspProvider.test.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';

const connect = vi.fn().mockResolvedValue(undefined);
const reconnect = vi.fn().mockResolvedValue(undefined);
const syncWorkspaceFiles = vi.fn();
const dispose = vi.fn();
vi.mock('../../../src/services/lsp-client.js', () => ({
  createLspClientService: () => ({ connect, reconnect, syncWorkspaceFiles, dispose })
}));
vi.mock('../../../src/services/transport-provider.js', () => ({
  createTransportProvider: () => ({ onStateChange: () => () => {}, dispose: () => {} })
}));

import { LspProvider } from '../../../src/shell/providers/LspProvider.js';
import { useLsp } from '../../../src/shell/providers/lsp-context.js';
import { WorkspaceStateContext, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';

function wsState(files: WorkspaceState['files']): WorkspaceState {
  return { workspaceId: 'w', workspaceKind: 'browser-only', workspaceName: 'w', fileCount: files.length,
    files, models: [], parsedModels: [], deferredExports: [] };
}
function LspProbe() { const { transportState } = useLsp(); return <span data-testid="t">{transportState?.status ?? 'none'}</span>; }

beforeEach(() => { connect.mockClear(); reconnect.mockClear(); syncWorkspaceFiles.mockClear(); });

describe('LspProvider', () => {
  it('creates one client, connects once, and re-syncs docs when files change (no reconnect)', () => {
    function Host() {
      const [files, setFiles] = useState<WorkspaceState['files']>([]);
      return (
        <WorkspaceStateContext.Provider value={wsState(files)}>
          <button onClick={() => setFiles([{ name: 'a.rosetta', path: 'a.rosetta', content: 'namespace a', dirty: false }])}>add</button>
          <LspProvider><LspProbe /></LspProvider>
        </WorkspaceStateContext.Provider>
      );
    }
    render(<Host />);
    act(() => screen.getByText('add').click());
    expect(syncWorkspaceFiles).toHaveBeenCalled();   // doc-set re-sync on file change
    expect(reconnect).not.toHaveBeenCalled();        // switch is NOT a reconnect
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found)**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/LspProvider.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `lsp-context.ts`**

```ts
// apps/studio/src/shell/providers/lsp-context.ts
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { createContext, useContext } from 'react';
import type { LspClientService } from '../../services/lsp-client.js';
import type { TransportState } from '../../services/transport-provider.js';

export interface LspContextValue {
  lspClient: LspClientService | null;
  transportState: TransportState;
  reconnect: () => void;
}

export const LspContext = createContext<LspContextValue | null>(null);

export function useLsp(): LspContextValue {
  const ctx = useContext(LspContext);
  if (ctx === null) throw new Error('useLsp must be used within an LspProvider');
  return ctx;
}
```

> Confirm `LspClientService` and `TransportState` are exported from those modules (read `services/lsp-client.ts` and `services/transport-provider.ts`). Match the exact exported names/locations.

- [ ] **Step 4: Implement `LspProvider.tsx` — RELOCATION**

Move out of `App.tsx` into this provider (behavior-preserving):
- `lspClientRef` + `providerRef = useRef(createTransportProvider(...))` creation.
- the connect effect (mount): create the client via `createLspClientService(...)`, subscribe `onStateChange` → `setTransportState`, `await connect()`. Keep cleanup (`dispose`).
- `transportState`/`setTransportState` `useState`.
- `handleReconnect` → exposed as `reconnect`.
- the **doc-set sync**: an effect on `useWorkspace().files` calling `lspClientRef.current?.syncWorkspaceFiles(files.filter(... not BUNDLE_MARKER_SUFFIX && not refOnly))`. (Today this lives in App's `handleFilesChange` (App.tsx ~667) and the loaded-models effect (~930). Move the *sync-on-files-change* responsibility here; App keeps writing files but no longer calls `syncWorkspaceFiles`.)

Resulting skeleton (fill the moved bodies verbatim from App):

```tsx
// apps/studio/src/shell/providers/LspProvider.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { LspContext, type LspContextValue } from './lsp-context.js';
import { useWorkspace } from './workspace-context.js';
import { createLspClientService, type LspClientService } from '../../services/lsp-client.js';
import { createTransportProvider, type TransportState } from '../../services/transport-provider.js';
import { BUNDLE_MARKER_SUFFIX } from '../../workspace/<confirm-path>.js'; // grep BUNDLE_MARKER_SUFFIX for the export

export function LspProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { files } = useWorkspace();
  const lspClientRef = useRef<LspClientService | null>(null);
  const providerRef = useRef(createTransportProvider(/* same args as App today */));
  const [transportState, setTransportState] = useState<TransportState>(/* same initial as App */);

  useEffect(() => {
    // <move App's connect effect verbatim: create client, onStateChange→setTransportState, connect(); cleanup dispose>
  }, []);

  useEffect(() => {
    lspClientRef.current?.syncWorkspaceFiles(
      files.filter((f) => !f.path.endsWith(BUNDLE_MARKER_SUFFIX) && !f.refOnly)
    );
  }, [files]);

  const reconnect = useCallback(() => { void lspClientRef.current?.reconnect(); }, []);

  const value: LspContextValue = { lspClient: lspClientRef.current, transportState, reconnect };
  return <LspContext.Provider value={value}>{children}</LspContext.Provider>;
}
```

> **Do not** delete App's LSP code yet — that happens in Task 6 (App slimming) once the provider is wired. For now the provider is standalone + tested. Keeping both temporarily is fine (the provider isn't mounted until Task 5).

- [ ] **Step 5: Run it — expect PASS**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/LspProvider.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/shell/providers/lsp-context.ts apps/studio/src/shell/providers/LspProvider.tsx apps/studio/test/shell/providers/LspProvider.test.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): LspProvider owns transport+client; doc-set re-sync on model change"
```

---

## Task 4: CodegenProvider (lift the worker + both channels)

**Files:**
- Create: `apps/studio/src/shell/providers/CodegenProvider.tsx`
- Test: `apps/studio/test/shell/providers/CodegenProvider.test.tsx`
- Source to relocate: `apps/studio/src/pages/EditorPage.tsx:413` (`codegenWorker` state) and the five effects at `884-903` (create/terminate), `911-937` (`setFiles` both channels), `941-954` (`preview:generate`), `956-1003` (preview listener), `1019-1063` (codegen listener), `1069-1085` (`codegen:generate` trigger). Plus the helper/ref dependencies declared earlier in EditorPage: `handlePreviewWorkerFailure`, `previewRequestSequenceRef`, `codegenRequestSequenceRef`, `currentPreviewRequestIdRef`, `codegenCurrentRequestIdRef`, `previewSelectedTargetId` (from `usePreviewStore`), the message helpers (`createPreviewSetFilesMessage`, `createPreviewGenerateMessage`, `isPreviewWorkerMessage`, `isPreviewExecuteResultMessage`, `isPreviewExecuteErrorMessage`), store actions (`setWorkerRef`, `receivePreviewResult`, `receivePreviewStale`, `receiveExecutionResult`, `receiveExecutionError` from `usePreviewStore`; `useCodegenStore` actions), and constants `BUNDLE_MARKER_SUFFIX`, `pathToUri`, `EMPTY_DEFERRED_EXPORTS`. **Grep each symbol in EditorPage.tsx to capture its exact import/declaration before moving.**

**Design:** A stable provider that creates the worker once, reads `files` from `useWorkspace()`, reads selected targets from `usePreviewStore`/`useCodegenStore`, and hosts all five effects verbatim. It renders children only (results flow through the stores). No new context unless a caller needs imperative posts — see Task 4b.

- [ ] **Step 1: Write the failing guard test** (regression for the P2 single-owner invariant)

```tsx
// apps/studio/test/shell/providers/CodegenProvider.test.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useState } from 'react';

// Fake worker capturing postMessage + listeners.
class FakeWorker {
  static instances: FakeWorker[] = [];
  posted: any[] = [];
  listeners: Record<string, Function[]> = {};
  terminated = false;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(m: any) { this.posted.push(m); }
  addEventListener(t: string, cb: Function) { (this.listeners[t] ||= []).push(cb); }
  removeEventListener(t: string, cb: Function) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== cb); }
  terminate() { this.terminated = true; }
}

beforeEach(() => { FakeWorker.instances = []; window.__runeStudioTestApi = { createCodegenWorker: () => new FakeWorker() as unknown as Worker }; });

import { CodegenProvider } from '../../../src/shell/providers/CodegenProvider.js';
import { WorkspaceStateContext, type WorkspaceState } from '../../../src/shell/providers/workspace-context.js';

function wsState(id: string): WorkspaceState {
  return { workspaceId: id, workspaceKind: 'browser-only', workspaceName: id, fileCount: 1,
    files: [{ name: 'a.rosetta', path: 'a.rosetta', content: 'namespace a', dirty: false }],
    models: [], parsedModels: [], deferredExports: [] };
}

describe('CodegenProvider', () => {
  it('creates exactly ONE worker and re-posts setFiles across a workspace switch (single owner, P2)', () => {
    function Host() {
      const [id, setId] = useState('ws-A');
      return (
        <WorkspaceStateContext.Provider value={wsState(id)}>
          <button onClick={() => setId('ws-B')}>switch</button>
          <CodegenProvider><div /></CodegenProvider>
        </WorkspaceStateContext.Provider>
      );
    }
    render(<Host />);
    expect(FakeWorker.instances.length).toBe(1);
    const setFilesBefore = FakeWorker.instances[0].posted.filter((m) => m.type === 'codegen:setFiles').length;
    act(() => document.querySelector('button')!.click());
    expect(FakeWorker.instances.length).toBe(1); // NOT re-created on switch
    const setFilesAfter = FakeWorker.instances[0].posted.filter((m) => m.type === 'codegen:setFiles').length;
    expect(setFilesAfter).toBeGreaterThan(setFilesBefore); // re-posted on model change
  });
});
```

- [ ] **Step 2: Run it — expect FAIL (module not found)**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/CodegenProvider.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement `CodegenProvider.tsx` — RELOCATION**

Move the five effects + `codegenWorker` state + the listed refs/helpers/store-hooks out of EditorPage **verbatim**, replacing the `files` prop reference with `const { files } = useWorkspace();`. Resulting skeleton:

```tsx
// apps/studio/src/shell/providers/CodegenProvider.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from './workspace-context.js';
import { usePreviewStore } from '../../store/preview-store.js';
import { useCodegenStore } from '../../store/codegen-store.js';
// + the message helpers, isX guards, pathToUri, BUNDLE_MARKER_SUFFIX, getRuneStudioTestApi,
//   CodegenWorkerMessage type — copy the exact import lines from EditorPage.tsx.

export function CodegenProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { files } = useWorkspace();
  const [codegenWorker, setCodegenWorker] = useState<Worker | null>(null);
  const previewRequestSequenceRef = useRef(0);
  const codegenRequestSequenceRef = useRef(0);
  const currentPreviewRequestIdRef = useRef('');
  const codegenCurrentRequestIdRef = useRef('');
  const previewSelectedTargetId = usePreviewStore((s) => s.selectedTargetId);
  const setWorkerRef = usePreviewStore((s) => s.setWorkerRef);
  const receivePreviewResult = usePreviewStore((s) => s.receivePreviewResult);
  const receivePreviewStale = usePreviewStore((s) => s.receivePreviewStale);
  const receiveExecutionResult = usePreviewStore((s) => s.receiveExecutionResult);
  const receiveExecutionError = usePreviewStore((s) => s.receiveExecutionError);
  const codegenActiveTarget = useCodegenStore((s) => s.activeTarget);
  const codegenPreviewTarget = useCodegenStore((s) => s.codePreviewTarget);

  // handlePreviewWorkerFailure: move EditorPage's definition (it dispatches
  // receivePreviewStale + logs). Read EditorPage for its exact body.
  const handlePreviewWorkerFailure = /* move verbatim from EditorPage */;

  // <Effect: create/terminate worker — EditorPage 884-903>
  // <Effect: setFiles both channels — EditorPage 911-937 (files dep)>
  // <Effect: preview:generate — EditorPage 941-954>
  // <Effect: preview listener — EditorPage 956-1003>
  // <Effect: codegen listener — EditorPage 1019-1063>
  // <Effect: codegen:generate trigger — EditorPage 1069-1085>

  return <>{children}</>;
}
```

> **Critical:** the `setFiles` effect uses `files` (now from `useWorkspace()`) and the preview effect filters/maps exactly as today (`!f.readOnly`, `!endsWith(BUNDLE_MARKER_SUFFIX)`, `serializedModelJson` passthrough). Do not alter the filtering. Keep the stale-requestId guards (`currentPreviewRequestIdRef`, `codegenCurrentRequestIdRef`) — they prevent the P2 race.

- [ ] **Step 4: Run it — expect PASS**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/CodegenProvider.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the existing worker tests to confirm parity**

Run: `pnpm --filter @rune-langium/studio exec vitest run test/workers/ test/pages/EditorPage-codegen-preview.test.tsx`
Expected: PASS (the worker contract is unchanged; only its owner moved). If `EditorPage-codegen-preview.test.tsx` asserts EditorPage ownership directly, note it for Task 6 (it will be re-pointed at CodegenProvider).

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/shell/providers/CodegenProvider.tsx apps/studio/test/shell/providers/CodegenProvider.test.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): CodegenProvider owns the preview+codegen worker and both channels"
```

---

## Task 4b: (conditional) useStudioWorker imperative hook

**Decision gate — do this ONLY if a current caller needs imperative worker posts.** Grep for `dispatchExecute` and any direct `worker.postMessage` from a component that is NOT one of the moved effects (e.g. form execution from `FormPreviewPanel`).

Run: `rg -n "dispatchExecute|setWorkerRef|workerRef" apps/studio/src`

- [ ] **If `usePreviewStore.setWorkerRef` already routes imperative posts** (the worker ref is handed to the store via `setWorkerRef`, and components call `dispatchExecute` on the store): **no hook needed** — skip Task 4b. Record in the commit message of Task 4 that the worker stays store-driven.
- [ ] **If a component imports the worker directly:** add `CodegenWorkerContext` exposing `{ post(msg) }` and a `useStudioWorker()` hook, mirroring Task 3's context pattern; wire that one caller to it. (Write the failing test first: a probe calls `useStudioWorker().post(...)` and asserts the fake worker received it.)

> Per spec §15 this is intentionally deferred to a real call site. Do not build speculative API.

---

## Task 5: StudioProviders composition root + wire into App

**Files:**
- Create: `apps/studio/src/shell/providers/StudioProviders.tsx`
- Test: `apps/studio/test/shell/providers/StudioProviders.test.tsx`
- Modify: `apps/studio/src/App.tsx` (wrap render; pass `state`/`actions`)

**Design:** `StudioProviders` takes the current-model `state` + `actions` as props and composes the tree. `GithubProvider`/`SettingsProvider`/`CuratedModelProvider` are **reserved comment slots** (not built). App computes `state` from its existing useState and passes it down; the providers mount once.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/studio/test/shell/providers/StudioProviders.test.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
vi.mock('../../../src/services/lsp-client.js', () => ({ createLspClientService: () => ({ connect: vi.fn().mockResolvedValue(undefined), reconnect: vi.fn(), syncWorkspaceFiles: vi.fn(), dispose: vi.fn() }) }));
vi.mock('../../../src/services/transport-provider.js', () => ({ createTransportProvider: () => ({ onStateChange: () => () => {}, dispose: () => {} }) }));
beforeEach(() => { window.__runeStudioTestApi = { createCodegenWorker: () => ({ postMessage(){}, addEventListener(){}, removeEventListener(){}, terminate(){} }) as unknown as Worker }; });

import { StudioProviders } from '../../../src/shell/providers/StudioProviders.js';
import { useWorkspace } from '../../../src/shell/providers/workspace-context.js';
import { useLsp } from '../../../src/shell/providers/lsp-context.js';

const noopActions = { files: [], onFilesLoaded(){}, createGitBackedWorkspace(){}, onGitHubWorkspaceCreated(){}, onOpenWorkspace(){}, onCreateWorkspace(){}, onDeleteWorkspace(){} };
const state = { workspaceId: 'w', workspaceKind: 'browser-only' as const, workspaceName: 'w', fileCount: 0, files: [], models: [], parsedModels: [], deferredExports: [] };
function Probe() { return <span data-testid="ok">{useWorkspace().workspaceId}-{String(useLsp() != null)}</span>; }

describe('StudioProviders', () => {
  it('composes Workspace+Lsp+Codegen so descendants read both contexts', () => {
    render(<StudioProviders state={state} actions={noopActions}><Probe /></StudioProviders>);
    expect(screen.getByTestId('ok').textContent).toBe('w-true');
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `pnpm --filter @rune-langium/studio exec vitest run test/shell/providers/StudioProviders.test.tsx`

- [ ] **Step 3: Implement `StudioProviders.tsx`**

```tsx
// apps/studio/src/shell/providers/StudioProviders.tsx
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { WorkspaceProvider } from './WorkspaceProvider.js';
import { LspProvider } from './LspProvider.js';
import { CodegenProvider } from './CodegenProvider.js';
import type { WorkspaceState } from './workspace-context.js';
import type { WorkspaceActions } from '../perspectives/workspace-actions-context.js';

interface Props {
  state: WorkspaceState;
  actions: WorkspaceActions;
  children: React.ReactNode;
}

/**
 * App-level composition root. Reserved app-global sibling slots (insertion
 * contract, spec §10) — built by follow-up specs, NOT here:
 *   - <GithubProvider/>  sibling; auth state from the github-auth service singleton
 *   - <SettingsProvider/> sibling; lands with .runestudio config
 *   - <CuratedModelProvider/> not warranted (registry + service + useModelStore own it)
 * Rule: nest only on context-consumption; otherwise sibling. Lsp/Codegen nest
 * under Workspace because they consume useWorkspace(); they are peers.
 * zustand stores stay module singletons — NOT mounted here.
 */
export function StudioProviders({ state, actions, children }: Props): React.ReactElement {
  return (
    <WorkspaceProvider state={state} actions={actions}>
      <LspProvider>
        <CodegenProvider>{children}</CodegenProvider>
      </LspProvider>
    </WorkspaceProvider>
  );
}
```

- [ ] **Step 4: Run it — expect PASS.** Same command as Step 2.

- [ ] **Step 5: Wire into App — RELOCATION (additive; App keeps its state for now)**

In `App.tsx`, build the `state` object from existing useState and wrap the render. Replace the current top-level `<WorkspaceActionsContext.Provider value={workspaceActionsValue}>` (App.tsx ~981) with `<StudioProviders state={workspaceStateValue} actions={workspaceActionsValue}>`. Add, near `workspaceActionsValue` (App.tsx ~959):

```tsx
const workspaceStateValue = useMemo(
  () => ({
    workspaceId: restoredWorkspace?.id,
    workspaceKind: restoredWorkspace?.kind,
    workspaceName: restoredWorkspace?.name,
    fileCount: files.filter((f) => !f.readOnly).length,
    files,
    models,
    parsedModels,
    deferredExports
  }),
  [restoredWorkspace, files, models, parsedModels, deferredExports]
);
```

Remove the now-duplicate `createTransportProvider`/`createLspClientService`/`syncWorkspaceFiles` ownership from App in Task 6 (not yet — keeping both mounted briefly would double-connect the LSP). **To avoid a double LSP/worker during this step**, gate App's old LSP connect effect + worker behind a temporary `if (false)` OR remove them in the SAME commit as wiring (preferred). Read App to confirm there is exactly one LSP connect effect and remove it here, relying on `LspProvider`.

- [ ] **Step 6: Run the FULL studio suite — expect PASS**

Run: `pnpm --filter @rune-langium/studio test`
Expected: all green. If `EditorPage` still owns a worker (not yet split), the worker now lives in BOTH EditorPage and CodegenProvider → the P2 double-owner returns. **Therefore Task 5 Step 5 must also remove EditorPage's worker effects** (they were copied to CodegenProvider in Task 4). Delete EditorPage.tsx:413 + effects 884-1085 in this commit and have EditorPage read nothing worker-related. Re-run until green.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src/shell/providers/StudioProviders.tsx apps/studio/test/shell/providers/StudioProviders.test.tsx apps/studio/src/App.tsx apps/studio/src/pages/EditorPage.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "feat(studio): StudioProviders root; App provides workspace state/actions; single LSP+worker owner"
```

---

## Task 6: EditorPage → ExplorePerspective + shell single-source

**Files:**
- Create: `apps/studio/src/shell/ExplorePerspective.tsx`
- Modify: `apps/studio/src/shell/perspectives/PerspectiveHost.tsx`, `apps/studio/src/App.tsx`
- Delete: `apps/studio/src/pages/EditorPage.tsx`
- Read first: EditorPage's render (the DockShell + toolbar) and App's two render branches (1032-1077) to identify the shell vs content boundary.

**Design:** The Explore *content* (DockShell workbench + its toolbar/topbar pieces) becomes `ExplorePerspective`, reading `useWorkspace()` (models/parsedModels/files/workspaceId/etc.) and `useLsp()` (lspClient/transportState/reconnect) instead of props. The app shell (header/ActivityBar/PerspectiveHost) lives once in App. `PerspectiveHost`'s `explore` slot renders `<ExplorePerspective />`.

- [ ] **Step 1: Write the failing test** — ExplorePerspective renders from context (no props)

```tsx
// apps/studio/test/shell/ExplorePerspective.test.tsx — mirror test/components/App-restore.test.tsx mocks
// Assert: given a WorkspaceStateContext + LspContext value with N user files,
// ExplorePerspective renders the DockShell region (assert a stable testid that
// the current EditorPage body already exposes — grep EditorPage for a
// data-testid on the DockShell container; reuse it).
```

> Read EditorPage for an existing stable `data-testid` on the workbench container and assert it here. If none exists, add one (`data-testid="explore-workbench"`) to the lifted markup.

- [ ] **Step 2: Run it — expect FAIL.**

- [ ] **Step 3: Create `ExplorePerspective.tsx` — RELOCATION**

Move EditorPage's body (the workbench: DockShell mount, the dockview layout, the graph/source/structure panes, the in-editor topbar) into `ExplorePerspective`. Replace prop reads with hooks:
- `models`, `parsedModels`, `files`, `workspaceId`, `workspaceKind`, `workspaceName`, `fileCount`, `deferredExports`, `onFilesChange` → `const { ... } = useWorkspace();` (for `onFilesChange`, see note) ; 
- `lspClient`, `transportState`, `onReconnect` → `const { lspClient, transportState, reconnect } = useLsp();`
- `onClose`, `onSwitchWorkspace`, `onCreateWorkspace`, `onFilesChange` → from `useWorkspaceActions()` (map: `onClose`→a reset action; confirm these exist in the actions context — if `onFilesChange`/`onClose` are not in `WorkspaceActions`, add them to that context's shape in Task 2's file and supply from App, since ExplorePerspective needs them and no longer gets props).

> **Decision:** `onFilesChange`/`onClose`/`onSwitchWorkspace`/`onCreateWorkspace` are App handlers ExplorePerspective needs. Add them to `WorkspaceActions` (the actions context) so ExplorePerspective reads them via `useWorkspaceActions()`. Update `workspaceActionsValue` in App + the `WorkspaceActions` interface + `noopActions` in tests accordingly. This keeps ExplorePerspective prop-free.

- [ ] **Step 4: Point PerspectiveHost's explore slot at ExplorePerspective**

In `apps/studio/src/shell/perspectives/PerspectiveHost.tsx`, change the `explore` prop usage. Either (a) keep the `explore` prop and have App pass `<ExplorePerspective/>`, or (b) drop the prop and render `<ExplorePerspective/>` directly in the slot. Prefer (b) — the host now knows its Explore content:

```tsx
// PerspectiveHost.tsx — slot body
<div data-perspective-slot="explore" className="h-full" style={{ display: effective === 'explore' ? undefined : 'none' }}>
  <ExplorePerspective />
</div>
```

Remove the `explore: React.ReactNode` prop from `Props` and update all call sites. Keep the `requiresWorkspace` fallback (Codex P2 fix) intact — `ExplorePerspective` is only *visible* when `effective === 'explore'`, which only holds when `hasWorkspace` (else the fallback swaps to workspaces). When hidden, `ExplorePerspective` is still mounted (keep-alive) but reads an empty workspace value harmlessly.

> **Keep-alive caution:** `ExplorePerspective` must remain mounted across perspective switches (display:none), exactly as the DockShell does today. Confirm the existing keep-alive test (`test/shell/perspectives-integration.test.tsx` mount-count) still passes — update its `explore={<ExploreProbe/>}` usage if the prop is removed (the probe pattern must move inside a mocked `ExplorePerspective`).

- [ ] **Step 5: Collapse App's two render branches into one shell**

In `App.tsx` (1032-1077), today there are: a no-workspace shell (`!showEditorPage`) with `ActivityBar`+`PerspectiveHost(explore=null)`, and `EditorPage` (which carries its own shell). Replace BOTH with a single shell inside `StudioProviders`:

```tsx
{bootState !== 'checking' && bootState !== 'restoring' && !loading && (
  <div className="flex h-full w-full min-h-0">
    <ActivityBar hasWorkspace={hasWorkspace} />
    <PerspectiveHost hasWorkspace={hasWorkspace} workspaceId={restoredWorkspace?.id} workspaceKind={restoredWorkspace?.kind} files={files} />
  </div>
)}
```

Delete the two `<EditorPage .../>` blocks. The header/footer that EditorPage used to render in-workbench move into `ExplorePerspective` (its toolbar) or the single App header — preserve current visual behavior (read EditorPage's toolbar vs App's header at 993 and keep one coherent header per the current UX).

- [ ] **Step 6: Delete EditorPage.tsx + fix imports**

```bash
git rm apps/studio/src/pages/EditorPage.tsx
rg -n "pages/EditorPage" apps/studio/src apps/studio/test   # update/redirect every importer
```

Re-point tests that imported `EditorPage` (e.g. `test/pages/EditorPage*.test.tsx`) at `ExplorePerspective` or the relevant provider, or delete those that only validated the old shell duality. The `App-restore.test.tsx` mock `vi.mock('../../src/pages/EditorPage.js', ...)` must change to mock `ExplorePerspective` (or be removed if App no longer imports EditorPage). **Grep and fix all references.**

- [ ] **Step 7: Run the FULL studio suite + type-check + lint**

```bash
pnpm --filter @rune-langium/studio test
pnpm --filter @rune-langium/studio run type-check
pnpm run lint
```
Expected: all green. Iterate until green (this is the largest task — expect several test re-points).

- [ ] **Step 8: Commit**

```bash
git add -A
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(studio): EditorPage→ExplorePerspective; single app shell; host renders Explore content"
```

---

## Task 7: App slimming + final verification

**Files:** `apps/studio/src/App.tsx`

- [ ] **Step 1: Remove dead App state/props**

Now that providers own the model/LSP/worker, remove from App any state/refs/handlers that are no longer read: confirm via `rg` each former EditorPage prop is gone from App (`models`/`parsedModels`/`deferredExports` are still App-owned and passed as `workspaceStateValue` — KEEP; `lspClientRef`/`providerRef`/`transportState`/`handleReconnect` moved to LspProvider — REMOVE from App; the worker is gone). Do not remove selection/boot/persistence (`bootState`, `restoredWorkspace`, `workspaceManagerRef`, curated sync, the 6 handlers).

> **Caution:** `lspClientRef.current?.syncWorkspaceFiles` is also called in App's `handleFilesChange` (App.tsx ~667) and the loaded-models effect (~930). Those sync calls moved to `LspProvider`'s files effect. Remove the App-side `syncWorkspaceFiles` calls; keep the rest of `handleFilesChange` (it persists + debounce-reparses). Verify the parse pipeline (`parseWorkspaceFiles`/`applyParseResult`) stays in App (it feeds `parsedModels` → `workspaceStateValue`).

- [ ] **Step 2: Run full suite + type-check + lint**

```bash
pnpm --filter @rune-langium/studio test && pnpm --filter @rune-langium/studio run type-check && pnpm run lint
```
Expected: all green; no unused-symbol lint errors in App.

- [ ] **Step 3: Manual smoke (document, do not automate here)**

Verify in a dev build: load workspace → Explore renders; switch perspective → Explore kept alive (no reparse, worker stays); delete last file → falls back to Workspaces (no blank pane); code preview works in Export; LSP reconnect works. (These are covered by unit tests but a smoke pass de-risks the integration.)

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/App.tsx
SKIP_SIMPLE_GIT_HOOKS=1 git commit -m "refactor(studio): slim App to selection/boot/persistence; providers own model/LSP/worker"
```

---

## Self-review (against the spec)

- **§4 composition root** → Task 5 (`StudioProviders`, reserved slots as comments). ✓
- **§5 Approach B seam** → App keeps selection/boot/persistence; `WorkspaceProvider` publishes loaded-model data (Tasks 2, 5, 7). ✓
- **§6 two contexts** → Tasks 1–2 (state context + existing actions context; re-render isolation tested). ✓
- **§7 LspProvider** (doc-set re-sync, not reconnect) → Task 3. ✓
- **§8 CodegenProvider** (one worker, both channels, P2 guard) → Task 4 (+4b gate). ✓
- **§9 EditorPage→ExplorePerspective + single shell** → Task 6. ✓
- **§10 reserved slots** → Task 5 comments + insertion contract. ✓
- **§11 lifecycle (value swap, no remount)** → Tasks 2 (atomic swap test), 4 (single worker across switch), 6 (keep-alive). ✓
- **§13 testing** (atomic swap, re-render isolation, single LSP/worker, P2 guard, keep-alive, migration) → Tasks 2/3/4/6/7. ✓
- **Gaps:** none blocking. The relocation tasks (3, 4, 6, 7) intentionally specify *manifests + guard tests* rather than verbatim copies of EditorPage/App internals (hundreds of lines); the executor moves the real code with the existing suite as the guardrail. Each relocation commit must leave `pnpm --filter @rune-langium/studio test` green.
- **Ordering risk:** Task 4 copies the worker into CodegenProvider; Task 5 Step 5/6 removes it from EditorPage in the same commit that mounts the providers — this is the one window where a double-owner could exist, so it's collapsed into a single commit and gated by the full-suite run.
