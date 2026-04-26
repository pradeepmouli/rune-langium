// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * App — Root component for Rune DSL Studio (T089, T028).
 *
 * Orchestrates file loading, parsing, the editor page,
 * and LSP client lifecycle.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import '@rune-langium/visual-editor/styles.css';
import { FileLoader } from './components/FileLoader.js';
import { ModelLoader } from './components/ModelLoader.js';
import { EditorPage } from './pages/EditorPage.js';
import { Button } from '@rune-langium/design-system/ui/button';
import { Spinner } from '@rune-langium/design-system/ui/spinner';
import { FileText, AlertTriangle, XCircle } from 'lucide-react';
import type { WorkspaceFile } from './services/workspace.js';
import { parseWorkspaceFiles, mergeModelFiles } from './services/workspace.js';
import { useModelStore } from './store/model-store.js';
import { createLspClientService, type LspClientService } from './services/lsp-client.js';
import { createTransportProvider, type TransportState } from './services/transport-provider.js';
import { BASE_TYPE_FILES } from './resources/base-types.js';
import { studioConfig } from './config.js';
import * as persistence from './workspace/persistence.js';
import type { WorkspaceRecord } from './workspace/persistence.js';

/**
 * Mount-time workspace boot state machine (T028 / 014-US2).
 *
 *   checking   → initial; we are calling listRecents() / loadWorkspace()
 *   restoring  → a recent workspace was found; about to surface it
 *   start      → no recent (or restore failed) → show the empty start page
 *   restored   → a workspace was restored — body[data-workspace-active=true]
 */
type BootState = 'checking' | 'restoring' | 'start' | 'restored';

export function App() {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [models, setModels] = useState<unknown[]>([]);
  const [errors, setErrors] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [transportState, setTransportState] = useState<TransportState>({
    mode: 'disconnected',
    status: 'disconnected'
  });
  const [bootState, setBootState] = useState<BootState>('checking');
  const [restoredWorkspace, setRestoredWorkspace] = useState<WorkspaceRecord | null>(null);

  const lspClientRef = useRef<LspClientService | null>(null);
  const providerRef = useRef<ReturnType<typeof createTransportProvider> | null>(null);
  const reparseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mount-time workspace restore (research.md R5 / T028).
  //
  // Read the recents store; if a most-recent record exists AND its full
  // workspace metadata is loadable, switch to `restored` so the body is
  // marked `data-workspace-active=true` (FR-010). Anything that throws or
  // returns nothing falls back to the empty start page so the user can
  // pick a different workspace.
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
        setRestoredWorkspace(ws);
        setBootState('restored');
      } catch (err) {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn('[App] workspace restore failed; falling back to start page:', err);
        setBootState('start');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tag the body so the dock chrome / e2e selectors can detect that an
  // editor is mounted (T028 contract). Cleared on unmount so the next
  // test case starts clean.
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

  const handleFilesLoaded = useCallback(async (loadedFiles: WorkspaceFile[]) => {
    setLoading(true);
    // Prepend system base-type files so cross-references resolve
    const allFiles: WorkspaceFile[] = [...BASE_TYPE_FILES.map((f) => ({ ...f })), ...loadedFiles];
    setFiles(allFiles);
    lspClientRef.current?.syncWorkspaceFiles(allFiles);

    const result = await parseWorkspaceFiles(allFiles);
    setModels(result.models);
    setErrors(result.errors);
    setLoading(false);
  }, []);

  /**
   * Handle file content changes (e.g., from source editor edits).
   * Updates files immediately and debounce-reparses after 500ms idle.
   */
  const handleFilesChange = useCallback((updatedFiles: WorkspaceFile[]) => {
    setFiles(updatedFiles);
    lspClientRef.current?.syncWorkspaceFiles(updatedFiles);

    // Debounced reparse — wait for typing to settle
    if (reparseTimerRef.current) clearTimeout(reparseTimerRef.current);
    reparseTimerRef.current = setTimeout(async () => {
      try {
        const result = await parseWorkspaceFiles(updatedFiles);
        setModels(result.models);
        setErrors(result.errors);
      } catch {
        // Parse failure — keep existing models
      }
    }, 500);
  }, []);

  const handleReconnect = useCallback(async () => {
    try {
      await lspClientRef.current?.reconnect();
    } catch (err) {
      console.error('[App] LSP reconnect failed:', err);
    }
  }, []);

  const handleReset = useCallback(() => {
    setFiles([]);
    setModels([]);
    setErrors(new Map());
  }, []);

  // Merge reference model files into workspace when models change
  const loadedModels = useModelStore((s) => s.models);
  useEffect(() => {
    if (loadedModels.size === 0) return;
    setFiles((prev) => {
      let result = prev.filter((f) => !f.path.startsWith('['));
      for (const model of loadedModels.values()) {
        result = mergeModelFiles(result, model);
      }
      return result;
    });
  }, [loadedModels]);

  const hasErrors = errors.size > 0;
  const userFiles = files.filter((f) => !f.readOnly);

  return (
    <div className="studio-app flex flex-col h-full font-sans text-foreground bg-background">
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
          {files.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileText className="w-3.5 h-3.5" />
                {userFiles.length} file(s)
              </span>
              {hasErrors && (
                <span
                  className="flex items-center gap-1.5 text-sm text-destructive"
                  title="Parse errors detected"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {errors.size} with errors
                </span>
              )}
              <Button variant="secondary" size="sm" onClick={handleReset} title="Close all files">
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Close
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-hidden relative">
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
          <div className="flex flex-col h-full">
            <FileLoader onFilesLoaded={handleFilesLoaded} existingFiles={files} />
            <div className="border-t px-8 py-6">
              <ModelLoader />
            </div>
          </div>
        )}

        {bootState === 'start' && !loading && userFiles.length > 0 && (
          <EditorPage
            models={models as import('@rune-langium/core').RosettaModel[]}
            files={files}
            onFilesChange={handleFilesChange}
            lspClient={lspClientRef.current ?? undefined}
            transportState={transportState}
            onReconnect={handleReconnect}
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
            models={models as import('@rune-langium/core').RosettaModel[]}
            files={files}
            onFilesChange={handleFilesChange}
            lspClient={lspClientRef.current ?? undefined}
            transportState={transportState}
            onReconnect={handleReconnect}
            workspaceId={restoredWorkspace?.id ?? 'default'}
          />
        )}
      </main>
    </div>
  );
}
