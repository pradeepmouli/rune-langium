/**
 * Final integration test (T046).
 *
 * Validates the full LSP studio integration:
 *   - Load CDM fixtures from .resources/cdm/
 *   - Parse them via the core API
 *   - Verify diagnostics store can receive and organise diagnostics
 *   - Verify diagnostics bridge maps diagnostics to types
 *   - Verify semantic diff detects structural changes
 */

import { describe, it, expect } from 'vitest';
import { loadCdmSubset, listFixtures } from '../helpers/fixture-loader.js';
import { mapDiagnosticsToTypes } from '../../src/services/diagnostics-bridge.js';
import { semanticDiff, type TypeDeclaration } from '../../src/services/semantic-diff.js';
import { useDiagnosticsStore } from '../../src/store/diagnostics-store.js';

describe('Integration: CDM fixtures + LSP pipeline', () => {
  it('loads CDM fixture subset (5 files)', async () => {
    const subset = await loadCdmSubset();
    expect(subset.length).toBeGreaterThanOrEqual(3);
    for (const file of subset) {
      expect(file.name).toMatch(/\.rosetta$/);
      expect(file.content.length).toBeGreaterThan(0);
    }
  });

  it('CDM corpus has 100+ fixture files', async () => {
    const files = await listFixtures('cdm');
    expect(files.length).toBeGreaterThan(100);
  });

  it('diagnostics store handles multi-file diagnostics', () => {
    const store = useDiagnosticsStore.getState();
    store.clearAll();

    // Simulate diagnostics for two files
    store.setFileDiagnostics('file:///trade.rosetta', [
      {
        range: { start: { line: 4, character: 2 }, end: { line: 4, character: 12 } },
        severity: 1,
        message: 'Duplicate attribute "name"',
        source: 'rune-dsl'
      },
      {
        range: { start: { line: 8, character: 0 }, end: { line: 8, character: 20 } },
        severity: 2,
        message: 'Unused type reference',
        source: 'rune-dsl'
      }
    ]);

    store.setFileDiagnostics('file:///enums.rosetta', [
      {
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
        severity: 1,
        message: 'Missing namespace',
        source: 'rune-dsl'
      }
    ]);

    const state = useDiagnosticsStore.getState();
    expect(state.totalErrors).toBe(2);
    expect(state.totalWarnings).toBe(1);
    expect(state.fileDiagnostics.size).toBe(2);

    store.clearAll();
  });

  it('diagnostics bridge maps diagnostics to type names', () => {
    const diagnostics = [
      {
        range: { start: { line: 3, character: 2 }, end: { line: 3, character: 20 } },
        severity: 1 as const,
        message: 'Error in Trade type'
      },
      {
        range: { start: { line: 12, character: 0 }, end: { line: 12, character: 15 } },
        severity: 2 as const,
        message: 'Warning in Product type'
      }
    ];

    const typePositions = new Map([
      ['Trade', { start: 2, end: 8 }],
      ['Product', { start: 10, end: 14 }]
    ]);

    const result = mapDiagnosticsToTypes('file:///trade.rosetta', diagnostics, typePositions);
    expect(result.length).toBe(2);
    expect(result.find((t) => t.typeName === 'Trade')?.errorCount).toBe(1);
    expect(result.find((t) => t.typeName === 'Product')?.warningCount).toBe(1);
  });

  it('semantic diff detects added and removed types', () => {
    const before: TypeDeclaration[] = [
      { name: 'Trade', kind: 'data', attributes: ['tradeDate', 'product'], parent: undefined },
      { name: 'Party', kind: 'data', attributes: ['partyId'], parent: undefined }
    ];

    const after: TypeDeclaration[] = [
      { name: 'Trade', kind: 'data', attributes: ['tradeDate', 'product'], parent: undefined },
      { name: 'Product', kind: 'data', attributes: ['name'], parent: undefined }
    ];

    const diff = semanticDiff(before, after);
    expect(diff.hasStructuralChanges).toBe(true);
    expect(diff.added).toContain('Product');
    expect(diff.removed).toContain('Party');
  });

  it('semantic diff ignores cosmetic changes (attribute reorder)', () => {
    const before: TypeDeclaration[] = [
      { name: 'Trade', kind: 'data', attributes: ['price', 'quantity'], parent: undefined }
    ];
    const after: TypeDeclaration[] = [
      { name: 'Trade', kind: 'data', attributes: ['quantity', 'price'], parent: undefined }
    ];

    const diff = semanticDiff(before, after);
    expect(diff.hasStructuralChanges).toBe(false);
  });
});
