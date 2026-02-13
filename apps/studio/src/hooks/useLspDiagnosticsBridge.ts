/**
 * useLspDiagnosticsBridge — Wires LSP diagnostics to graph node errors (T036).
 *
 * Subscribes to the LSP client's onDiagnostics callback and updates
 * the diagnostics store. Maps diagnostics to type-level summaries
 * that the graph can consume through error badges.
 */

import { useEffect } from 'react';
import type { LspClientService } from '../services/lsp-client.js';
import { useDiagnosticsStore } from '../store/diagnostics-store.js';

/**
 * Hook that bridges LSP diagnostics into the zustand diagnostics store.
 */
export function useLspDiagnosticsBridge(lspClient?: LspClientService): void {
  const setFileDiagnostics = useDiagnosticsStore((s) => s.setFileDiagnostics);

  useEffect(() => {
    if (!lspClient) return;

    const unsub = lspClient.onDiagnostics((uri, diagnostics) => {
      setFileDiagnostics(uri, diagnostics);
    });

    return unsub;
  }, [lspClient, setFileDiagnostics]);
}
