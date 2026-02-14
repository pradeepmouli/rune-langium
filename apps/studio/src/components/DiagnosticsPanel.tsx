/**
 * DiagnosticsPanel — Error/warning list with navigation (T041).
 *
 * Displays LSP diagnostics grouped by file. Clicking a diagnostic
 * navigates to the source location in the editor.
 */

import type { LspDiagnostic } from '../store/diagnostics-store.js';
import { Badge } from './ui/badge.js';
import { cn } from '@/lib/utils.js';

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
      <div
        className="flex flex-col items-center justify-center p-3 max-h-[200px] border-t border-[var(--color-border-default)] bg-[var(--color-surface-base)]"
        data-testid="diagnostics-panel"
      >
        <p className="text-[var(--color-text-muted)] text-sm">No problems detected</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col max-h-[200px] overflow-hidden border-t border-[var(--color-border-default)] bg-[var(--color-surface-base)]"
      data-testid="diagnostics-panel"
    >
      {/* Summary bar */}
      <div className="flex gap-3 px-3 py-1.5 bg-[var(--color-surface-raised)] border-b border-[var(--color-border-default)] text-sm">
        {totalErrors > 0 && (
          <Badge variant="error">
            {totalErrors} error{totalErrors !== 1 ? 's' : ''}
          </Badge>
        )}
        {totalWarnings > 0 && (
          <Badge variant="warning">
            {totalWarnings} warning{totalWarnings !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Diagnostics list grouped by file */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(fileDiagnostics.entries()).map(([uri, diags]) => (
          <div key={uri} className="border-b border-[var(--color-border-muted)]">
            <div className="px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)] bg-[var(--color-surface-raised)] uppercase tracking-wider">
              {extractFileName(uri)}
            </div>
            {diags.map((diag, idx) => {
              const sev = severityLabel(diag.severity);
              const line = diag.range.start.line + 1; // 0→1 indexed
              const col = diag.range.start.character + 1;

              return (
                <button
                  key={`${uri}-${idx}`}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1 pl-5 text-sm text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer text-left",
                    "hover:bg-[var(--color-surface-raised)]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-1"
                  )}
                  onClick={() =>
                    onNavigate?.(uri, diag.range.start.line, diag.range.start.character)
                  }
                  type="button"
                >
                  <span
                    className={cn(
                      "shrink-0 text-xs",
                      sev === 'error' && "text-[var(--color-error)]",
                      sev === 'warning' && "text-[var(--color-warning)]",
                      sev === 'info' && "text-[var(--color-info)]"
                    )}
                  >
                    {sev === 'error' ? '\u25cf' : sev === 'warning' ? '\u25b2' : '\u2139'}
                  </span>
                  <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                    {diag.message}
                  </span>
                  <span className="shrink-0 text-[var(--color-text-muted)] font-mono text-xs">
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
