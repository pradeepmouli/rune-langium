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

export function LspProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { files } = useWorkspace();
  const lspClientRef = useRef<LspClientService | null>(null);
  const providerRef = useRef<ReturnType<typeof createTransportProvider> | null>(null);
  const [transportState, setTransportState] = useState<TransportState>({ mode: 'disconnected', status: 'disconnected' });

  useEffect(() => {
    if (!config.lspEnabled) {
      setTransportState({ mode: 'disconnected', status: 'disconnected' });
      providerRef.current = null;
      lspClientRef.current = null;
      return undefined;
    }
    const provider = createTransportProvider({ workspaceId: getLspSessionId() });
    providerRef.current = provider;
    const unsub = provider.onStateChange((state) => { setTransportState(state); });
    const client = createLspClientService({ transportProvider: provider });
    lspClientRef.current = client;
    client.connect().catch((err) => { console.error('[LspProvider] LSP connect failed:', err); });
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
      catch (err) { console.error('[LspProvider] LSP reconnect failed:', err); }
    })();
  }, []);

  const value: LspContextValue = { lspClient: lspClientRef.current, transportState, reconnect };
  return <LspContext.Provider value={value}>{children}</LspContext.Provider>;
}
