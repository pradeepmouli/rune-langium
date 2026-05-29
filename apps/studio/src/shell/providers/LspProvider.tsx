// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { LspContext, type LspContextValue } from './lsp-context.js';
import { useWorkspace } from './workspace-context.js';
import { createLspClientService, type LspClientService } from '../../services/lsp-client.js';
import { createTransportProvider, type TransportState } from '../../services/transport-provider.js';
import { getLspSessionId } from '../../services/lsp-session.js';
import { config } from '../../config.js';
import { BUNDLE_MARKER_SUFFIX } from '../../services/workspace.js';
import { useStudioToast } from '../../components/StudioToastProvider.js';
import { useOutputStore, fmtLine } from '../../store/output-store.js';
import { useActivityStore } from '../../store/activity-store.js';

export function LspProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { files } = useWorkspace();
  const lspClientRef = useRef<LspClientService | null>(null);
  const providerRef = useRef<ReturnType<typeof createTransportProvider> | null>(null);
  const [transportState, setTransportState] = useState<TransportState>({ mode: 'disconnected', status: 'disconnected' });
  const { showToast } = useStudioToast();
  const prevStatusRef = useRef<TransportState['status']>('disconnected');

  useEffect(() => {
    if (!config.lspEnabled) {
      setTransportState({ mode: 'disconnected', status: 'disconnected' });
      providerRef.current = null;
      lspClientRef.current = null;
      return undefined;
    }
    const provider = createTransportProvider({ workspaceId: getLspSessionId() });
    providerRef.current = provider;
    const unsub = provider.onStateChange((state) => {
      setTransportState(state);
      if (state.status === 'connected') {
        useOutputStore.getState().addLine(fmtLine('lsp', 'connected'), 'success');
        useActivityStore.getState().addActivity('lsp', true, 'connected');
      } else if (state.status === 'disconnected' && prevStatusRef.current === 'connected') {
        useOutputStore.getState().addLine(fmtLine('lsp', 'disconnected'), 'warn');
        useActivityStore.getState().addActivity('lsp', false, 'disconnected');
      }
      prevStatusRef.current = state.status;
    });
    const client = createLspClientService({ transportProvider: provider });
    lspClientRef.current = client;
    client.connect().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[LspProvider] LSP connect failed:', err);
      useOutputStore.getState().addLine(fmtLine('lsp', 'connect failed', msg), 'error');
      useActivityStore.getState().addActivity('lsp', false, `connect failed · ${msg}`);
      showToast({ title: 'Language server unavailable', description: err instanceof Error ? err.message : 'LSP connection failed. Diagnostics and completions will not work.', variant: 'destructive' });
    });
    return () => { unsub(); client.dispose(); provider.dispose(); };
  }, []);

  // Doc-set re-sync when the model's files change — NOT a reconnect.
  useEffect(() => {
    lspClientRef.current?.syncWorkspaceFiles(
      files.filter((f) => !f.path.endsWith(BUNDLE_MARKER_SUFFIX) && !f.refOnly)
    );
  }, [files]);

  const reconnect = useCallback(() => {
    void (async () => {
      try { await lspClientRef.current?.reconnect(); }
      catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[LspProvider] LSP reconnect failed:', err);
        useOutputStore.getState().addLine(fmtLine('lsp', 'reconnect failed', msg), 'error');
        useActivityStore.getState().addActivity('lsp', false, `reconnect failed · ${msg}`);
        showToast({ title: 'LSP reconnect failed', description: err instanceof Error ? err.message : 'Could not reconnect to the language server.', variant: 'destructive' });
      }
    })();
  }, [showToast]);

  const value: LspContextValue = { lspClient: lspClientRef.current, transportState, reconnect };
  return <LspContext.Provider value={value}>{children}</LspContext.Provider>;
}
