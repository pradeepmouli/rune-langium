/**
 * Tests for flattenDiagnostics utility.
 */

import { describe, it, expect } from 'vitest';
import { flattenDiagnostics } from '../../src/utils/flatten-diagnostics.js';
import type { LspDiagnostic } from '../../src/store/diagnostics-store.js';

function makeDiag(message: string, severity: 1 | 2 = 1, line = 0, char = 0): LspDiagnostic {
  return {
    range: {
      start: { line, character: char },
      end: { line, character: char + 10 }
    },
    severity,
    message,
    source: 'rune-dsl'
  };
}

describe('flattenDiagnostics', () => {
  it('returns empty array for empty map', () => {
    expect(flattenDiagnostics(new Map())).toEqual([]);
  });

  it('creates file header and diagnostic rows for single file', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///trade.rosetta', [makeDiag('Error 1'), makeDiag('Error 2')]);

    const rows = flattenDiagnostics(diags);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ kind: 'file-header', uri: 'file:///trade.rosetta', count: 2 });
    expect(rows[1]).toMatchObject({ kind: 'diagnostic', uri: 'file:///trade.rosetta', index: 0 });
    expect(rows[2]).toMatchObject({ kind: 'diagnostic', uri: 'file:///trade.rosetta', index: 1 });
  });

  it('handles multiple files with correct grouping', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///a.rosetta', [makeDiag('A error')]);
    diags.set('file:///b.rosetta', [makeDiag('B error 1'), makeDiag('B error 2')]);

    const rows = flattenDiagnostics(diags);
    // a: 1 header + 1 diag, b: 1 header + 2 diags = 5
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ kind: 'file-header', uri: 'file:///a.rosetta', count: 1 });
    expect(rows[1]).toMatchObject({ kind: 'diagnostic', uri: 'file:///a.rosetta' });
    expect(rows[2]).toMatchObject({ kind: 'file-header', uri: 'file:///b.rosetta', count: 2 });
    expect(rows[3]).toMatchObject({ kind: 'diagnostic', uri: 'file:///b.rosetta', index: 0 });
    expect(rows[4]).toMatchObject({ kind: 'diagnostic', uri: 'file:///b.rosetta', index: 1 });
  });

  it('preserves diagnostic objects in rows', () => {
    const diag = makeDiag('Test message', 2, 5, 3);
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///test.rosetta', [diag]);

    const rows = flattenDiagnostics(diags);
    const diagRow = rows[1]!;
    expect(diagRow.kind).toBe('diagnostic');
    if (diagRow.kind === 'diagnostic') {
      expect(diagRow.diagnostic).toBe(diag);
      expect(diagRow.diagnostic.message).toBe('Test message');
      expect(diagRow.diagnostic.severity).toBe(2);
    }
  });

  it('handles file with empty diagnostics array', () => {
    const diags = new Map<string, LspDiagnostic[]>();
    diags.set('file:///empty.rosetta', []);

    const rows = flattenDiagnostics(diags);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'file-header', uri: 'file:///empty.rosetta', count: 0 });
  });
});
