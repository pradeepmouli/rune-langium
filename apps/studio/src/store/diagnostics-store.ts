/**
 * Diagnostics zustand store (T032).
 *
 * Centralises LSP diagnostics state for both the editor and
 * the ReactFlow graph to consume.
 */

import { create } from 'zustand';
import type { LspDiagnostic, TypeDiagnosticsSummary } from '../types/diagnostics.js';

export type { LspDiagnostic, TypeDiagnosticsSummary } from '../types/diagnostics.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface DiagnosticsState {
  fileDiagnostics: Map<string, LspDiagnostic[]>;
  typeDiagnostics: Map<string, TypeDiagnosticsSummary>;
  totalErrors: number;
  totalWarnings: number;
}

interface DiagnosticsActions {
  setFileDiagnostics(uri: string, diagnostics: LspDiagnostic[]): void;
  clearFileDiagnostics(uri: string): void;
  clearAll(): void;
  setTypeDiagnostic(typeName: string, summary: TypeDiagnosticsSummary): void;
}

type DiagnosticsStore = DiagnosticsState & DiagnosticsActions;

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function computeTotals(fileDiagnostics: Map<string, LspDiagnostic[]>): {
  totalErrors: number;
  totalWarnings: number;
} {
  let totalErrors = 0;
  let totalWarnings = 0;
  for (const diags of fileDiagnostics.values()) {
    for (const d of diags) {
      if (d.severity === 1) totalErrors++;
      else if (d.severity === 2) totalWarnings++;
    }
  }
  return { totalErrors, totalWarnings };
}

// ────────────────────────────────────────────────────────────────────────────
// Store
// ────────────────────────────────────────────────────────────────────────────

export const useDiagnosticsStore = create<DiagnosticsStore>((set) => ({
  fileDiagnostics: new Map(),
  typeDiagnostics: new Map(),
  totalErrors: 0,
  totalWarnings: 0,

  setFileDiagnostics(uri: string, diagnostics: LspDiagnostic[]) {
    set((state) => {
      const next = new Map(state.fileDiagnostics);
      next.set(uri, diagnostics);
      const { totalErrors, totalWarnings } = computeTotals(next);
      return { fileDiagnostics: next, totalErrors, totalWarnings };
    });
  },

  clearFileDiagnostics(uri: string) {
    set((state) => {
      const next = new Map(state.fileDiagnostics);
      next.delete(uri);
      const { totalErrors, totalWarnings } = computeTotals(next);
      return { fileDiagnostics: next, totalErrors, totalWarnings };
    });
  },

  clearAll() {
    set({
      fileDiagnostics: new Map(),
      typeDiagnostics: new Map(),
      totalErrors: 0,
      totalWarnings: 0
    });
  },

  setTypeDiagnostic(typeName: string, summary: TypeDiagnosticsSummary) {
    set((state) => {
      const next = new Map(state.typeDiagnostics);
      next.set(typeName, summary);
      return { typeDiagnostics: next };
    });
  }
}));
