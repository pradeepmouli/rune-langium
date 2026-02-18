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
import { EditorPage } from './pages/EditorPage.js';
import { Button } from './components/ui/button.js';
import { Separator } from './components/ui/separator.js';
import { Spinner } from './components/ui/spinner.js';
import type { WorkspaceFile } from './services/workspace.js';
import { parseWorkspaceFiles } from './services/workspace.js';
import { createLspClientService, type LspClientService } from './services/lsp-client.js';
import { createTransportProvider, type TransportState } from './services/transport-provider.js';

export function App() {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [models, setModels] = useState<unknown[]>([]);
  const [errors, setErrors] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [transportState, setTransportState] = useState<TransportState>({
    mode: 'disconnected',
    status: 'disconnected'
  });

  const lspClientRef = useRef<LspClientService | null>(null);
  const providerRef = useRef<ReturnType<typeof createTransportProvider> | null>(null);
  const reparseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setFiles(loadedFiles);

    const result = await parseWorkspaceFiles(loadedFiles);
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

  const hasErrors = errors.size > 0;

  return (
    <div className="studio-app flex flex-col h-full font-sans text-text-primary bg-surface-base">
      <header className="flex items-center justify-between px-4 py-2 bg-surface-raised min-h-[44px]">
        <h1 className="text-lg font-semibold text-text-heading">Rune DSL Studio</h1>
        {files.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-base text-text-secondary">
              {files.length} file(s)
              {hasErrors && (
                <span className="text-error" title="Parse errors detected">
                  {' '}
                  · {errors.size} with errors
                </span>
              )}
            </span>
            <Button variant="secondary" size="sm" onClick={handleReset} title="Close all files">
              Close
            </Button>
          </div>
        )}
      </header>
      <Separator />

      <main className="flex-1 overflow-hidden relative">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-text-secondary text-md">
            <Spinner className="h-8 w-8 text-accent" />
            <p>Parsing files…</p>
          </div>
        )}

        {!loading && files.length === 0 && <FileLoader onFilesLoaded={handleFilesLoaded} />}

        {!loading && files.length > 0 && (
          <EditorPage
            models={models as import('@rune-langium/core').RosettaModel[]}
            files={files}
            onFilesChange={handleFilesChange}
            lspClient={lspClientRef.current ?? undefined}
            transportState={transportState}
            onReconnect={handleReconnect}
          />
        )}
      </main>
    </div>
  );
}
