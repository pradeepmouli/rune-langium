// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * App — Root component for Rune DSL Studio (T089, T028).
 *
 * Orchestrates file loading, parsing, the editor page,
 * and LSP client lifecycle.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import '@xyflow/react/dist/style.css';
import '@rune-langium/visual-editor/styles.css';
import type { RosettaModel } from '@rune-langium/core';
import { FileLoader } from './components/FileLoader.js';
import { ModelLoader } from './components/ModelLoader.js';
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher.js';
import { EditorPage } from './pages/EditorPage.js';
import { Spinner } from '@rune-langium/design-system/ui/spinner';
import type { WorkspaceFile } from './services/workspace.js';
import { parseWorkspaceFiles, mergeModelFiles } from './services/workspace.js';
import { useModelStore } from './store/model-store.js';
import type { LoadedModel } from './types/model-types.js';
import { createLspClientService, type LspClientService } from './services/lsp-client.js';
import { createTransportProvider, type TransportState } from './services/transport-provider.js';
import { BASE_TYPE_FILES } from './resources/base-types.js';
import { studioConfig } from './config.js';
import * as persistence from './workspace/persistence.js';
import type { WorkspaceRecord } from './workspace/persistence.js';
import {
  deleteWorkspaceFiles,
  loadWorkspaceFiles,
  saveWorkspaceFiles
} from './workspace/workspace-files.js';
import './test-api.js';
import { setRuneStudioTestApi } from './test-api.js';

/**
 * Mount-time workspace boot state machine (T028 / 014-US2).
 *
 *   checking   → initial; we are calling listRecents() / loadWorkspace()
 *   restoring  → a recent workspace was found; about to surface it
 *   start      → no recent (or restore failed) → show the empty start page
 *   restored   → a workspace was restored — body[data-workspace-active=true]
 */
type BootState = 'checking' | 'restoring' | 'start' | 'restored';

const STUDIO_VERSION = '0.1.0';

function makeWorkspaceId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function deriveWorkspaceName(files: readonly WorkspaceFile[]): string {
  const firstFile = files[0];
  if (!firstFile) {
    return 'Workspace';
  }

  const rootFolder = firstFile.path.split('/')[0];
  if (files.length > 1 && rootFolder && rootFolder !== firstFile.name) {
    return rootFolder;
  }

  return firstFile.name.replace(/\.rosetta$/i, '') || 'Workspace';
}

export function App() {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [models, setModels] = useState<RosettaModel[]>([]);
  const [parsedModels, setParsedModels] = useState<
    Array<{ filePath: string; model: RosettaModel }>
  >([]);
  const [, setErrors] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [transportState, setTransportState] = useState<TransportState>({
    mode: 'disconnected',
    status: 'disconnected'
  });
  const [bootState, setBootState] = useState<BootState>('checking');
  const [restoredWorkspace, setRestoredWorkspace] = useState<WorkspaceRecord | null>(null);

  const lspClientRef = useRef<LspClientService | null>(null);
  const providerRef = useRef<ReturnType<typeof createTransportProvider> | null>(null);
  const reparseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Incremented before each model-merge parse; only the matching result is
  // applied, preventing stale async results from overwriting newer state.
  const modelParseTokenRef = useRef(0);
  // Tracks the latest files state so the model-loading effect can read it
  // synchronously without stale-closure issues. Starts as [] (matching the
  // `files` initial state) and is kept in sync via the effect below.
  const filesRef = useRef<WorkspaceFile[]>([]);
  // Tracks the latest loaded reference models so syncWorkspaceToEditor can
  // preserve them without calling useModelStore.getState() (which is not
  // available in the test mock of useModelStore).
  const loadedModelsRef = useRef<Map<string, LoadedModel>>(new Map());

  const reportWorkspaceError = useCallback((message: string, error: unknown) => {
    console.warn(`[App] ${message}:`, error);
    setWorkspaceError(message);
  }, []);

  const applyParseResult = useCallback(
    (result: Awaited<ReturnType<typeof parseWorkspaceFiles>>) => {
      setModels(result.models);
      setParsedModels(result.parsedModels);
      setErrors(result.errors);
      setWorkspaceNotice(
        result.parseMode === 'main-thread-fallback' ? (result.fallbackMessage ?? null) : null
      );
    },
    []
  );

  const syncWorkspaceToEditor = useCallback(
    async (workspaceFiles: WorkspaceFile[]) => {
      setLoading(true);
      try {
        // Start with the built-in base types and the user's workspace files.
        let mergedFiles: WorkspaceFile[] = [
          ...BASE_TYPE_FILES.map((file) => ({ ...file })),
          ...workspaceFiles
        ];
        // Preserve any reference model files that are already loaded so that
        // switching/restoring a workspace doesn't silently drop them.
        for (const model of loadedModelsRef.current.values()) {
          mergedFiles = mergeModelFiles(mergedFiles, model);
        }
        setFiles(mergedFiles);
        lspClientRef.current?.syncWorkspaceFiles(mergedFiles);

        const result = await parseWorkspaceFiles(mergedFiles);
        applyParseResult(result);
        setWorkspaceError(null);
      } finally {
        setLoading(false);
      }
    },
    [applyParseResult]
  );

  const createWorkspaceRecord = useCallback(async (name: string): Promise<WorkspaceRecord> => {
    const now = new Date().toISOString();
    const workspace: WorkspaceRecord = {
      id: makeWorkspaceId(),
      name,
      kind: 'browser-only',
      createdAt: now,
      lastOpenedAt: now,
      layout: { version: 1, writtenBy: STUDIO_VERSION, dockview: null },
      tabs: [],
      activeTabPath: null,
      curatedModels: [],
      schemaVersion: 1
    };

    await saveWorkspaceFiles(workspace.id, []);
    await persistence.saveWorkspace(workspace);
    return workspace;
  }, []);

  const restoreWorkspace = useCallback(
    async (workspace: WorkspaceRecord): Promise<boolean> => {
      const restoredFiles = await loadWorkspaceFiles(workspace.id);
      if (restoredFiles.length === 0) {
        setRestoredWorkspace(null);
        return false;
      }

      const nextWorkspace = {
        ...workspace,
        lastOpenedAt: new Date().toISOString()
      };
      await persistence.saveWorkspace(nextWorkspace);
      setRestoredWorkspace(nextWorkspace);
      await syncWorkspaceToEditor(restoredFiles);
      return true;
    },
    [syncWorkspaceToEditor]
  );

  // Restore the most recently opened workspace on mount when its metadata and
  // saved files are still available; otherwise fall back to the start page.
  useEffect(() => {
    let cancelled = false;
    (async function bootRestore() {
      try {
        const recents = await persistence.listRecents();
        if (cancelled) return;
        if (recents.length === 0) {
          setBootState('start');
          return;
        }
        const top = recents[0]!;
        const ws = await persistence.loadWorkspace(top.id);
        if (cancelled) return;
        if (!ws) {
          setBootState('start');
          return;
        }
        setBootState('restoring');
        const restored = await restoreWorkspace(ws);
        if (!restored) {
          setBootState('start');
          return;
        }
        setBootState('restored');
      } catch (err) {
        if (cancelled) return;
        reportWorkspaceError('Workspace restore failed; showing the start page instead', err);
        setBootState('start');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportWorkspaceError, restoreWorkspace]);

  // Tag the body so the dock chrome / e2e selectors can detect that an
  // editor is mounted (T028 contract). Cleared on unmount so the next
  // test case starts clean.
  useEffect(() => {
    document.body.setAttribute('data-studio-app', 'true');
    return () => {
      document.body.removeAttribute('data-studio-app');
    };
  }, []);

  // Keep filesRef in sync so the model-loading effect below can read the
  // current file list without stale-closure issues.
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Keep loadedModelsRef in sync so syncWorkspaceToEditor can read it
  // without needing useModelStore.getState() (unavailable in tests).
  const loadedModels = useModelStore((s) => s.models);
  useEffect(() => {
    loadedModelsRef.current = loadedModels;
  }, [loadedModels]);

  useEffect(() => {
    if (bootState === 'restored') {
      document.body.setAttribute('data-workspace-active', 'true');
      return () => {
        document.body.removeAttribute('data-workspace-active');
      };
    }
    return undefined;
  }, [bootState]);

  // Cleanup reparse timer on unmount
  useEffect(() => {
    return () => {
      if (reparseTimerRef.current) clearTimeout(reparseTimerRef.current);
    };
  }, []);

  // Initialise LSP on mount
  useEffect(() => {
    const provider = createTransportProvider();
    providerRef.current = provider;

    const unsub = provider.onStateChange((state) => {
      setTransportState(state);
    });

    const client = createLspClientService({ transportProvider: provider });
    lspClientRef.current = client;

    client.connect().catch((err) => {
      console.error('[App] LSP connect failed:', err);
    });

    return () => {
      unsub();
      client.dispose();
      provider.dispose();
    };
  }, []);

  const handleFilesLoaded = useCallback(
    async (loadedFiles: WorkspaceFile[]) => {
      let workspace = restoredWorkspace;
      if (!workspace) {
        workspace = await createWorkspaceRecord(deriveWorkspaceName(loadedFiles));
        setRestoredWorkspace(workspace);
      }

      await saveWorkspaceFiles(workspace.id, loadedFiles);
      await syncWorkspaceToEditor(loadedFiles);
    },
    [createWorkspaceRecord, restoredWorkspace, syncWorkspaceToEditor]
  );

  /**
   * Handle file content changes (e.g., from source editor edits).
   * Updates files immediately and debounce-reparses after 500ms idle.
   */
  const handleFilesChange = useCallback(
    (updatedFiles: WorkspaceFile[]) => {
      setFiles(updatedFiles);
      lspClientRef.current?.syncWorkspaceFiles(updatedFiles);

      if (restoredWorkspace) {
        void saveWorkspaceFiles(restoredWorkspace.id, updatedFiles).catch((err) => {
          reportWorkspaceError(
            'Failed to save workspace changes to browser storage; edits remain in memory',
            err
          );
        });
      }

      // Debounced reparse — wait for typing to settle
      if (reparseTimerRef.current) clearTimeout(reparseTimerRef.current);
      reparseTimerRef.current = setTimeout(async () => {
        try {
          const result = await parseWorkspaceFiles(updatedFiles);
          applyParseResult(result);
        } catch (error) {
          reportWorkspaceError(
            'Failed to re-parse updated files; keeping the last valid graph',
            error
          );
        }
      }, 500);
    },
    [applyParseResult, reportWorkspaceError, restoredWorkspace]
  );

  const handleReconnect = useCallback(async () => {
    try {
      await lspClientRef.current?.reconnect();
    } catch (err) {
      console.error('[App] LSP reconnect failed:', err);
    }
  }, []);

  const handleReset = useCallback(() => {
    if (restoredWorkspace) {
      void saveWorkspaceFiles(restoredWorkspace.id, []).catch((err) => {
        reportWorkspaceError(
          'Failed to persist the cleared workspace state to browser storage',
          err
        );
      });
    }
    setFiles([]);
    setModels([]);
    setParsedModels([]);
    setErrors(new Map());
    // Return to the start page so the user can open or create a workspace.
    // Without this, bootState stays 'restored' and the "Workspace ready."
    // placeholder is shown with no way to load new files.
    setBootState('start');
    setRestoredWorkspace(null);
    setWorkspaceError(null);
    setWorkspaceNotice(null);
  }, [reportWorkspaceError, restoredWorkspace]);

  useEffect(() => {
    setRuneStudioTestApi((current) => ({
      ...current,
      replaceWorkspaceFiles: async (workspaceFiles: WorkspaceFile[]) => {
        if (restoredWorkspace) {
          await saveWorkspaceFiles(restoredWorkspace.id, workspaceFiles);
        }
        await syncWorkspaceToEditor(workspaceFiles);
      }
    }));
    return () => {
      setRuneStudioTestApi((current) => {
        if (!current) {
          return current;
        }
        const next = { ...current };
        delete next.replaceWorkspaceFiles;
        return next;
      });
    };
  }, [restoredWorkspace, syncWorkspaceToEditor]);

  /** Switch to a recent workspace from the start page list (T029). */
  const handleSwitchWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        const ws = await persistence.loadWorkspace(workspaceId);
        if (!ws) {
          reportWorkspaceError(
            'The selected workspace no longer exists in browser storage',
            workspaceId
          );
          return;
        }
        setBootState('restoring');
        const restored = await restoreWorkspace(ws);
        if (!restored) {
          setBootState('start');
          setWorkspaceError(null);
          setWorkspaceNotice(null);
          return;
        }
        setBootState('restored');
        setWorkspaceError(null);
        setWorkspaceNotice(null);
      } catch (err) {
        reportWorkspaceError('Failed to switch workspaces', err);
      }
    },
    [reportWorkspaceError, restoreWorkspace]
  );

  /** New-workspace affordance from the recents list — same path as FileLoader. */
  const handleCreateWorkspace = useCallback(() => {
    setBootState('start');
    setRestoredWorkspace(null);
    setWorkspaceNotice(null);
  }, []);

  /** Delete a recent workspace from the recents store (T029). */
  const handleDeleteWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        await persistence.deleteWorkspace(workspaceId);
        await deleteWorkspaceFiles(workspaceId);
        if (restoredWorkspace?.id === workspaceId) {
          setRestoredWorkspace(null);
          setFiles([]);
          setModels([]);
          setParsedModels([]);
          setErrors(new Map());
          setBootState('start');
        }
        setWorkspaceError(null);
        setWorkspaceNotice(null);
      } catch (err) {
        reportWorkspaceError('Failed to delete the selected workspace', err);
      }
    },
    [reportWorkspaceError, restoredWorkspace]
  );

  // Merge reference model files into workspace when models change and re-parse
  // so the graph and explorer reflect the loaded reference types.
  useEffect(() => {
    const prev = filesRef.current;
    const hadModelFiles = prev.some((f) => f.path.startsWith('['));
    // Skip the no-op case: no models loaded and none to clean up.
    // When models are removed (size === 0 but hadModelFiles === true) we
    // still run so their read-only entries are stripped from the file set.
    if (loadedModels.size === 0 && !hadModelFiles) return;

    let merged = prev.filter((f) => !f.path.startsWith('['));
    for (const model of loadedModels.values()) {
      merged = mergeModelFiles(merged, model);
    }
    setFiles(merged);
    lspClientRef.current?.syncWorkspaceFiles(merged);
    modelParseTokenRef.current += 1;
    const token = modelParseTokenRef.current;
    parseWorkspaceFiles(merged)
      .then((result) => {
        if (token !== modelParseTokenRef.current) return;
        applyParseResult(result);
      })
      .catch((err) => {
        reportWorkspaceError(
          'Failed to re-parse the workspace after loading reference models; keeping the last valid graph',
          err
        );
      });
  }, [applyParseResult, loadedModels, reportWorkspaceError]);

  const userFiles = files.filter((f) => !f.readOnly);
  const showEditorPage = useMemo(
    () =>
      (bootState === 'start' && !loading && userFiles.length > 0) ||
      (bootState === 'restored' && userFiles.length > 0),
    [bootState, loading, userFiles.length]
  );

  return (
    <div className="studio-app flex flex-col h-full text-foreground bg-background">
      {/* Screen-reader + test accessible file count — always in DOM so the
       * App-restore test can confirm file loading without EditorPage mounted. */}
      {userFiles.length > 0 && (
        <span className="sr-only" role="status" aria-live="polite">
          {userFiles.length} file(s)
        </span>
      )}
      {/* Global header — hidden when EditorPage is active to avoid a
       * duplicate toolbar. The EditorPage toolbar hosts Close + workspace
       * name in that mode. */}
      {!showEditorPage && (
        <header className="glass-header flex items-center justify-between px-4 py-2 min-h-[44px]">
          <div className="studio-brand">
            <div className="studio-brand__mark">R</div>
            <span className="studio-brand__name">Rune Studio</span>
          </div>
          <div className="flex items-center gap-4">
            <nav className="studio-links" aria-label="Studio links">
              <a href={studioConfig.homeUrl}>Home</a>
              <a href={studioConfig.docsUrl}>Docs</a>
              <a href={studioConfig.githubUrl}>GitHub</a>
            </nav>
          </div>
        </header>
      )}

      <main className="flex-1 overflow-hidden relative">
        {workspaceError ? (
          <div
            role="alert"
            className="absolute left-3 right-3 top-3 z-20 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive shadow-sm"
          >
            {workspaceError}
          </div>
        ) : null}
        {workspaceNotice ? (
          <div
            role="status"
            aria-live="polite"
            className={`absolute left-3 right-3 z-20 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 shadow-sm dark:text-amber-100 ${
              workspaceError ? 'top-16' : 'top-3'
            }`}
          >
            {workspaceNotice}
          </div>
        ) : null}
        {(bootState === 'checking' || bootState === 'restoring') && (
          <div
            className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-md"
            data-testid="boot-spinner"
          >
            <Spinner className="h-8 w-8 text-primary" />
            <p>{bootState === 'restoring' ? 'Restoring workspace…' : 'Loading…'}</p>
          </div>
        )}

        {bootState !== 'checking' && bootState !== 'restoring' && loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-md">
            <Spinner className="h-8 w-8 text-primary" />
            <p>Parsing files…</p>
          </div>
        )}

        {bootState === 'start' && !loading && userFiles.length === 0 && (
          // T057 (014/FR-028) — vertically centred at viewports ≥1280×800.
          // FileLoader handles its own centering inside; WorkspaceSwitcher
          // (recents) sits above the curated row per FR-011 / T029 with
          // `mt-8` spacing and no `border-t` divider, so the column reads
          // as one visually-balanced empty state rather than fenced-off
          // sections.
          <div className="flex flex-col items-center justify-center h-full px-8 py-12 gap-8">
            <FileLoader onFilesLoaded={handleFilesLoaded} existingFiles={files} />
            <div className="w-full max-w-[560px] mt-8">
              <WorkspaceSwitcher
                onOpen={handleSwitchWorkspace}
                onCreate={handleCreateWorkspace}
                onDelete={handleDeleteWorkspace}
              />
            </div>
            <div className="w-full max-w-[560px]">
              <ModelLoader />
            </div>
          </div>
        )}

        {bootState === 'start' && !loading && userFiles.length > 0 && (
          <EditorPage
            models={models}
            parsedModels={parsedModels}
            files={files}
            onFilesChange={handleFilesChange}
            lspClient={lspClientRef.current ?? undefined}
            transportState={transportState}
            onReconnect={handleReconnect}
            workspaceId={restoredWorkspace?.id ?? 'default'}
            workspaceName={restoredWorkspace?.name}
            fileCount={userFiles.length}
            onClose={handleReset}
          />
        )}

        {bootState === 'restored' && userFiles.length === 0 && (
          // Workspace metadata is restored from IndexedDB; file content is
          // re-hydrated from OPFS / curated bindings in a follow-up phase.
          // This placeholder keeps the surface usable in the meantime; it
          // intentionally does NOT mount the start-page `<FileLoader>` so
          // the empty-state copy ("Load Rune DSL Models") cannot leak into
          // a restored session.
          <div
            className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground text-md"
            data-testid="workspace-restored"
            aria-label={`Workspace ${restoredWorkspace?.name ?? ''} restored`}
          >
            <p className="text-2xl font-semibold text-foreground mb-1">
              {restoredWorkspace?.name ?? 'Workspace'}
            </p>
            <p>Workspace ready.</p>
          </div>
        )}

        {bootState === 'restored' && userFiles.length > 0 && (
          <EditorPage
            models={models}
            parsedModels={parsedModels}
            files={files}
            onFilesChange={handleFilesChange}
            lspClient={lspClientRef.current ?? undefined}
            transportState={transportState}
            onReconnect={handleReconnect}
            workspaceId={restoredWorkspace?.id ?? 'default'}
            workspaceName={restoredWorkspace?.name}
            fileCount={userFiles.length}
            onClose={handleReset}
          />
        )}
      </main>
    </div>
  );
}
