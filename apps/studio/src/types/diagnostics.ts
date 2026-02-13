/**
 * Shared LSP diagnostic types.
 *
 * Canonical definitions consumed by the diagnostics bridge,
 * diagnostics store, and LSP client service.
 */

export interface LspDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity?: 1 | 2 | 3 | 4;
  code?: number | string;
  source?: string;
  message: string;
}

export interface TypeDiagnosticsSummary {
  typeName: string;
  errorCount: number;
  warningCount: number;
  fileUri: string;
  lineRange: { start: number; end: number };
}
