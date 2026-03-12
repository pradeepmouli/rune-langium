/**
 * DiagnosticsPanel — Error/warning list with navigation (T041).
 *
 * Displays LSP diagnostics grouped by file. Clicking a diagnostic
 * navigates to the source location in the editor.
 *
 * Uses @tanstack/react-virtual for virtualized rendering of large
 * diagnostic lists.
 */

import { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { LspDiagnostic } from '../store/diagnostics-store.js';
import { Badge } from '@rune-langium/design-system/ui/badge';
import { Separator } from '@rune-langium/design-system/ui/separator';
import { cn } from '@rune-langium/design-system/utils';
import { flattenDiagnostics } from '../utils/flatten-diagnostics.js';
import type { FlatDiagnosticRow } from '../utils/flatten-diagnostics.js';

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

const FILE_HEADER_HEIGHT = 28;
const DIAGNOSTIC_ROW_HEIGHT = 32;

export function DiagnosticsPanel({ fileDiagnostics, onNavigate }: DiagnosticsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const flatRows = useMemo(() => flattenDiagnostics(fileDiagnostics), [fileDiagnostics]);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) =>
      flatRows[index]?.kind === 'file-header' ? FILE_HEADER_HEIGHT : DIAGNOSTIC_ROW_HEIGHT,
    overscan: 5
  });

  if (isEmpty) {
    return (
      <section
        className="flex flex-col items-center justify-center p-3 max-h-[200px]"
        data-testid="diagnostics-panel"
        aria-label="Diagnostics"
      >
        <Separator />
        <p className="text-muted-foreground text-sm pt-3">No problems detected</p>
      </section>
    );
  }

  return (
    <section
      className="flex flex-col max-h-[200px] overflow-hidden"
      data-testid="diagnostics-panel"
      aria-label="Diagnostics"
    >
      <Separator />
      {/* Summary bar */}
      <div className="flex gap-3 px-3 py-1.5 bg-card text-sm">
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
      <Separator />

      {/* Virtualized diagnostics list */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative'
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = flatRows[virtualRow.index]!;
            return (
              <div
                key={virtualRow.key}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                {row.kind === 'file-header' ? (
                  <FileHeaderRow uri={row.uri} />
                ) : (
                  <DiagnosticItemRow row={row} onNavigate={onNavigate} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// FileHeaderRow
// ---------------------------------------------------------------------------

function FileHeaderRow({ uri }: { uri: string }) {
  return (
    <div className="px-3 py-1 text-xs font-semibold text-muted-foreground bg-card uppercase tracking-wider border-b border-border">
      {extractFileName(uri)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DiagnosticItemRow
// ---------------------------------------------------------------------------

interface DiagnosticItemRowProps {
  row: Extract<FlatDiagnosticRow, { kind: 'diagnostic' }>;
  onNavigate?: (uri: string, line: number, character: number) => void;
}

function DiagnosticItemRow({ row, onNavigate }: DiagnosticItemRowProps) {
  const { uri, diagnostic: diag } = row;
  const sev = severityLabel(diag.severity);
  const line = diag.range.start.line + 1;
  const col = diag.range.start.character + 1;

  return (
    <button
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1 pl-5 text-sm text-foreground bg-transparent border-none cursor-pointer text-left',
        'hover:bg-card',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
      )}
      onClick={() => onNavigate?.(uri, diag.range.start.line, diag.range.start.character)}
      type="button"
    >
      <span
        className={cn(
          'shrink-0 text-xs',
          sev === 'error' && 'text-destructive',
          sev === 'warning' && 'text-warning',
          sev === 'info' && 'text-info'
        )}
      >
        {sev === 'error' ? '\u25cf' : sev === 'warning' ? '\u25b2' : '\u2139'}
      </span>
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{diag.message}</span>
      <span className="shrink-0 text-muted-foreground font-mono text-xs">
        {line}:{col}
      </span>
    </button>
  );
}
