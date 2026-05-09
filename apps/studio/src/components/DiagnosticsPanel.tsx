// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

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
import { AlertCircle, AlertTriangle, FileWarning, Info, Lightbulb, CheckCircle2 } from 'lucide-react';
import type { LspDiagnostic } from '../store/diagnostics-store.js';
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
const DIAGNOSTIC_ROW_HEIGHT = 36;

interface ProblemCounts {
  errors: number;
  warnings: number;
  info: number;
  hints: number;
  total: number;
}

function countProblems(fileDiagnostics: Map<string, LspDiagnostic[]>): ProblemCounts {
  const counts: ProblemCounts = {
    errors: 0,
    warnings: 0,
    info: 0,
    hints: 0,
    total: 0
  };
  for (const diags of fileDiagnostics.values()) {
    for (const d of diags) {
      counts.total++;
      switch (d.severity) {
        case 2:
          counts.warnings++;
          break;
        case 3:
          counts.info++;
          break;
        case 4:
          counts.hints++;
          break;
        default:
          counts.errors++;
          break;
      }
    }
  }
  return counts;
}

export function DiagnosticsPanel({ fileDiagnostics, onNavigate }: DiagnosticsPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const flatRows = useMemo(() => flattenDiagnostics(fileDiagnostics), [fileDiagnostics]);
  const counts = useMemo(() => countProblems(fileDiagnostics), [fileDiagnostics]);
  const diagnosticsByFile = useMemo(
    () => new Map(Array.from(fileDiagnostics.entries(), ([uri, diags]) => [uri, diags.length])),
    [fileDiagnostics]
  );
  const fileCount = diagnosticsByFile.size;
  const isEmpty = counts.total === 0;

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (flatRows[index]?.kind === 'file-header' ? FILE_HEADER_HEIGHT : DIAGNOSTIC_ROW_HEIGHT),
    overscan: 5
  });

  if (isEmpty) {
    return (
      <section
        className="flex h-full min-h-0 flex-col overflow-hidden"
        data-testid="diagnostics-panel"
        aria-label="Diagnostics"
      >
        <PanelHeader total={0} />
        <div className="flex flex-1 items-center justify-center px-4 py-6">
          <div className="flex max-w-60 flex-col items-center gap-2 text-center">
            <span className="rounded-full border border-border/70 bg-background/70 p-2 shadow-sm">
              <CheckCircle2 className="size-4 text-emerald-500" aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">No problems detected</p>
            <p className="text-xs text-muted-foreground">
              Parser, validation, and linker issues will appear here as you edit.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-hidden"
      data-testid="diagnostics-panel"
      aria-label="Diagnostics"
    >
      <PanelHeader total={counts.total} />
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-card/40 px-3 py-2 text-sm">
        <SeverityPill severity="error" count={counts.errors} />
        <SeverityPill severity="warning" count={counts.warnings} />
        <SeverityPill severity="info" count={counts.info} />
        <SeverityPill severity="hint" count={counts.hints} />
        <span className="number-chiclet" title={`${fileCount} file${fileCount === 1 ? '' : 's'}`}>
          {fileCount} file{fileCount === 1 ? '' : 's'}
        </span>
      </div>

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
                  <FileHeaderRow uri={row.uri} count={diagnosticsByFile.get(row.uri) ?? 0} />
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

function PanelHeader({ total }: { total: number }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileWarning className="size-4 text-muted-foreground" aria-hidden />
            <span>Problems</span>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Review diagnostics and jump straight to the affected source.
          </p>
        </div>
        <span className="number-chiclet" title={`${total} problem${total === 1 ? '' : 's'}`}>
          {total}
        </span>
      </div>
      <Separator />
    </>
  );
}

type SeverityKind = 'error' | 'warning' | 'info' | 'hint';

function SeverityPill({ severity, count }: { severity: SeverityKind; count: number }) {
  if (count === 0) return null;

  const meta: Record<
    SeverityKind,
    {
      icon: typeof AlertCircle;
      label: string;
      className: string;
      iconClassName: string;
    }
  > = {
    error: {
      icon: AlertCircle,
      label: count === 1 ? 'error' : 'errors',
      className: 'border-destructive/25 bg-destructive/8 text-destructive',
      iconClassName: 'text-destructive'
    },
    warning: {
      icon: AlertTriangle,
      label: count === 1 ? 'warning' : 'warnings',
      className:
        'border-[color:var(--color-warning)]/25 bg-[color:var(--color-warning)]/10 text-[color:var(--color-warning)]',
      iconClassName: 'text-[color:var(--color-warning)]'
    },
    info: {
      icon: Info,
      label: count === 1 ? 'info' : 'info',
      className: 'border-[color:var(--color-info)]/25 bg-[color:var(--color-info)]/10 text-[color:var(--color-info)]',
      iconClassName: 'text-[color:var(--color-info)]'
    },
    hint: {
      icon: Lightbulb,
      label: count === 1 ? 'hint' : 'hints',
      className: 'border-border/80 bg-muted/60 text-muted-foreground',
      iconClassName: 'text-amber-400'
    }
  };

  const Icon = meta[severity].icon;
  return (
    <span
      title={`${count} ${meta[severity].label}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium',
        meta[severity].className
      )}
    >
      <span className="number-chiclet">{count}</span>
      <Icon className={cn('size-3.5', meta[severity].iconClassName)} aria-hidden />
      <span>{meta[severity].label}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// FileHeaderRow
// ---------------------------------------------------------------------------

function FileHeaderRow({ uri, count }: { uri: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-card/70 px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
      <span className="truncate uppercase" title={uri}>
        {extractFileName(uri)}
      </span>
      <span className="number-chiclet" title={`${count} problem${count === 1 ? '' : 's'}`}>
        {count}
      </span>
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
        'flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 pl-4 text-left text-sm text-foreground',
        'hover:bg-card/80',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
      )}
      onClick={() => onNavigate?.(uri, diag.range.start.line, diag.range.start.character)}
      type="button"
    >
      <span
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-full border',
          sev === 'error' && 'border-destructive/20 bg-destructive/10 text-destructive',
          sev === 'warning' &&
            'border-[color:var(--color-warning)]/20 bg-[color:var(--color-warning)]/10 text-[color:var(--color-warning)]',
          sev === 'info' &&
            'border-[color:var(--color-info)]/20 bg-[color:var(--color-info)]/10 text-[color:var(--color-info)]',
          sev === 'hint' && 'border-border/80 bg-muted/50 text-amber-400'
        )}
        aria-label={sev}
      >
        {sev === 'error' ? (
          <AlertCircle className="size-3.5" aria-hidden />
        ) : sev === 'warning' ? (
          <AlertTriangle className="size-3.5" aria-hidden />
        ) : sev === 'hint' ? (
          <Lightbulb className="size-3.5" aria-hidden />
        ) : (
          <Info className="size-3.5" aria-hidden />
        )}
      </span>
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{diag.message}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {line}:{col}
      </span>
    </button>
  );
}
