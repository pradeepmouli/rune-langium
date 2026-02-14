/**
 * Diagnostics store tests (T030).
 */

import { describe, it, expect } from 'vitest';
import { useDiagnosticsStore } from '../../src/store/diagnostics-store.js';

describe('diagnostics store', () => {
  it('starts with empty state', () => {
    const state = useDiagnosticsStore.getState();
    expect(state.fileDiagnostics.size).toBe(0);
    expect(state.typeDiagnostics.size).toBe(0);
    expect(state.totalErrors).toBe(0);
    expect(state.totalWarnings).toBe(0);
  });

  it('sets file diagnostics', () => {
    const { setFileDiagnostics } = useDiagnosticsStore.getState();
    setFileDiagnostics('file:///test.rosetta', [
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
        severity: 1,
        message: 'error 1'
      },
      {
        range: { start: { line: 2, character: 0 }, end: { line: 2, character: 5 } },
        severity: 2,
        message: 'warning 1'
      }
    ]);

    const state = useDiagnosticsStore.getState();
    expect(state.fileDiagnostics.get('file:///test.rosetta')).toHaveLength(2);
    expect(state.totalErrors).toBe(1);
    expect(state.totalWarnings).toBe(1);
  });

  it('clears file diagnostics', () => {
    const store = useDiagnosticsStore.getState();
    store.setFileDiagnostics('file:///a.rosetta', [
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
        severity: 1,
        message: 'err'
      }
    ]);
    store.clearFileDiagnostics('file:///a.rosetta');

    const state = useDiagnosticsStore.getState();
    expect(state.fileDiagnostics.has('file:///a.rosetta')).toBe(false);
  });

  it('clears all diagnostics', () => {
    const store = useDiagnosticsStore.getState();
    store.setFileDiagnostics('file:///b.rosetta', [
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 5 } },
        severity: 1,
        message: 'err'
      }
    ]);
    store.clearAll();

    const state = useDiagnosticsStore.getState();
    expect(state.fileDiagnostics.size).toBe(0);
    expect(state.totalErrors).toBe(0);
    expect(state.totalWarnings).toBe(0);
  });

  it('updates type diagnostics', () => {
    const store = useDiagnosticsStore.getState();
    store.setTypeDiagnostic('Foo', {
      typeName: 'Foo',
      errorCount: 2,
      warningCount: 1,
      fileUri: 'file:///c.rosetta',
      lineRange: { start: 5, end: 15 }
    });

    const state = useDiagnosticsStore.getState();
    expect(state.typeDiagnostics.get('Foo')?.errorCount).toBe(2);
  });
});
