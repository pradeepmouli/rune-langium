// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * DiagnosticsPanel tests (T040).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DiagnosticsPanel } from '../../src/components/DiagnosticsPanel.js';
import type { LspDiagnostic } from '../../src/store/diagnostics-store.js';

// Mock @tanstack/react-virtual to render all items in jsdom (no real scroll container)
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: (i: number) => number }) => {
    let offset = 0;
    const items = Array.from({ length: count }, (_, i) => {
      const size = estimateSize(i);
      const item = { index: i, key: String(i), start: offset, size, end: offset + size };
      offset += size;
      return item;
    });
    return {
      getVirtualItems: () => items,
      getTotalSize: () => offset
    };
  }
}));

function makeDiag(message: string, severity: 1 | 2 | 3 | 4 = 1, startLine = 0, startChar = 0): LspDiagnostic {
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
    expect(screen.getByText('Problems')).toBeInTheDocument();
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
    diags.set('file:///trade.rosetta', [makeDiag('Error 1', 1), makeDiag('Error 2', 1), makeDiag('Warning 1', 2)]);

    render(<DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />);

    expect(screen.getByText(/3 problems/i)).toBeInTheDocument();
    expect(screen.getByTitle('2 errors')).toBeInTheDocument();
    expect(screen.getByTitle('1 warning')).toBeInTheDocument();
    expect(screen.getByTitle('3 problems')).toBeInTheDocument();
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

    render(<DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />);

    expect(screen.getByLabelText('error')).toBeInTheDocument();
    expect(screen.getByLabelText('warning')).toBeInTheDocument();
  });

  it('shows line and column numbers', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///test.rosetta', [makeDiag('At line 5', 1, 4, 2)]);

    render(<DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />);

    // Lines are 0-indexed in LSP, display as 1-indexed
    expect(screen.getByText(/5:3/)).toBeInTheDocument();
  });

  it('does not collapse info-only diagnostics into the empty state', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///info.rosetta', [makeDiag('Helpful note', 3, 1, 0)]);

    render(<DiagnosticsPanel fileDiagnostics={diags} onNavigate={onNavigate} />);

    expect(screen.getByText('Helpful note')).toBeInTheDocument();
    expect(screen.getByText('info')).toBeInTheDocument();
  });
});
