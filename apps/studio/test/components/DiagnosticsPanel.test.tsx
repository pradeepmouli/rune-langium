/**
 * DiagnosticsPanel tests (T040).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiagnosticsPanel } from '../../src/components/DiagnosticsPanel.js';
import type { LspDiagnostic } from '../../src/store/diagnostics-store.js';

function makeDiag(
  message: string,
  severity: 1 | 2 | 3 | 4 = 1,
  startLine = 0,
  startChar = 0
): LspDiagnostic {
  return {
    range: {
      start: { line: startLine, character: startChar },
      end: { line: startLine, character: startChar + 10 }
    },
    severity,
    message,
    source: 'rune-dsl'
  };
}

describe('DiagnosticsPanel', () => {
  const onNavigate = vi.fn();

  beforeEach(() => {
    onNavigate.mockClear();
  });

  it('renders empty state when no diagnostics', () => {
    render(<DiagnosticsPanel fileDiagnostics={new Map()} onNavigate={onNavigate} />);
    expect(screen.getByText(/no problems/i)).toBeInTheDocument();
  });

  it('renders error diagnostics with file grouping', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///trade.rosetta', [
      makeDiag('Duplicate attribute', 1, 4, 2),
      makeDiag('Missing reference', 1, 8, 0)
    ]);

    render(<DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />);

    expect(screen.getByText('trade.rosetta')).toBeInTheDocument();
    expect(screen.getByText('Duplicate attribute')).toBeInTheDocument();
    expect(screen.getByText('Missing reference')).toBeInTheDocument();
  });

  it('renders warning diagnostics', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///enums.rosetta', [makeDiag('Unused type', 2, 3, 0)]);

    render(<DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />);

    expect(screen.getByText('enums.rosetta')).toBeInTheDocument();
    expect(screen.getByText('Unused type')).toBeInTheDocument();
  });

  it('displays totals in summary bar', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///trade.rosetta', [
      makeDiag('Error 1', 1),
      makeDiag('Error 2', 1),
      makeDiag('Warning 1', 2)
    ]);

    render(<DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />);

    expect(screen.getByText(/2 error/i)).toBeInTheDocument();
    expect(screen.getByText(/1 warning/i)).toBeInTheDocument();
  });

  it('navigates when a diagnostic is clicked', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///trade.rosetta', [makeDiag('Click me', 1, 10, 5)]);

    render(<DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByText('Click me'));
    expect(onNavigate).toHaveBeenCalledWith('file:///trade.rosetta', 10, 5);
  });

  it('shows diagnostics from multiple files', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///trade.rosetta', [makeDiag('Trade error', 1)]);
    diags.set('file:///enums.rosetta', [makeDiag('Enum warning', 2)]);

    render(<DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />);

    expect(screen.getByText('trade.rosetta')).toBeInTheDocument();
    expect(screen.getByText('enums.rosetta')).toBeInTheDocument();
  });

  it('renders severity icons for errors vs warnings', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///test.rosetta', [makeDiag('An error', 1), makeDiag('A warning', 2)]);

    const { container } = render(
      <DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />
    );

    const errorIcons = container.querySelectorAll('.studio-diag__icon--error');
    const warningIcons = container.querySelectorAll('.studio-diag__icon--warning');
    expect(errorIcons.length).toBe(1);
    expect(warningIcons.length).toBe(1);
  });

  it('shows line and column numbers', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///test.rosetta', [makeDiag('At line 5', 1, 4, 2)]);

    render(<DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />);

    // Lines are 0-indexed in LSP, display as 1-indexed
    expect(screen.getByText(/5:3/)).toBeInTheDocument();
  });
});
