/**
 * DiagnosticsPanel — Error/warning list with navigation (T041).
 *
 * Displays LSP diagnostics grouped by file. Clicking a diagnostic
 * navigates to the source location in the editor.
 */

import type { LspDiagnostic } from '../store/diagnostics-store.js';

export interface DiagnosticsPanelProps {
  fileDiagnostics: Map<string, LspDiagnostic[]>;
  onNavigate?: (uri: string, line: number, character: number) => void;
}

function extractFileName(uri: string): string {
  const parts = uri.split('/');
  return parts[parts.length - 1] ?? uri;
}

function severityLabel(severity?: number): string {
  switch (severity) {
    case 1:
      return 'error';
    case 2:
      return 'warning';
    case 3:
      return 'info';
    case 4:
      return 'hint';
    default:
      return 'error';
  }
}

export function DiagnosticsPanel({ fileDiagnostics, onNavigate }: DiagnosticsPanelProps) {
  // Count totals
  let totalErrors = 0;
  let totalWarnings = 0;
  for (const diags of fileDiagnostics.values()) {
    for (const d of diags) {
      if (d.severity === 1 || d.severity === undefined) totalErrors++;
      else if (d.severity === 2) totalWarnings++;
    }
  }

  const isEmpty = fileDiagnostics.size === 0 || (totalErrors === 0 && totalWarnings === 0);

  if (isEmpty) {
    return (
      <div className="studio-diag-panel studio-diag-panel--empty" data-testid="diagnostics-panel">
        <p className="studio-diag-panel__empty">No problems detected</p>
      </div>
    );
  }

  return (
    <div className="studio-diag-panel" data-testid="diagnostics-panel">
      {/* Summary bar */}
      <div className="studio-diag-panel__summary">
        {totalErrors > 0 && (
          <span className="studio-diag-panel__count studio-diag-panel__count--error">
            {totalErrors} error{totalErrors !== 1 ? 's' : ''}
          </span>
        )}
        {totalWarnings > 0 && (
          <span className="studio-diag-panel__count studio-diag-panel__count--warning">
            {totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Diagnostics list grouped by file */}
      <div className="studio-diag-panel__list">
        {Array.from(fileDiagnostics.entries()).map(([uri, diags]) => (
          <div key={uri} className="studio-diag-panel__file-group">
            <div className="studio-diag-panel__file-header">{extractFileName(uri)}</div>
            {diags.map((diag, idx) => {
              const sev = severityLabel(diag.severity);
              const line = diag.range.start.line + 1; // 0→1 indexed
              const col = diag.range.start.character + 1;

              return (
                <button
                  key={`${uri}-${idx}`}
                  className="studio-diag__item"
                  onClick={() =>
                    onNavigate?.(uri, diag.range.start.line, diag.range.start.character)
                  }
                  type="button"
                >
                  <span className={`studio-diag__icon studio-diag__icon--${sev}`}>
                    {sev === 'error' ? '●' : sev === 'warning' ? '▲' : 'ℹ'}
                  </span>
                  <span className="studio-diag__message">{diag.message}</span>
                  <span className="studio-diag__location">
                    {line}:{col}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
