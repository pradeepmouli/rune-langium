/**
 * Diagnostics bridge tests — LSP → type mapping (T029).
 */

import { describe, it, expect } from 'vitest';
import {
  mapDiagnosticsToTypes,
  type LspDiagnostic,
  type TypePosition
} from '../../src/services/diagnostics-bridge.js';

const sampleDiagnostics: LspDiagnostic[] = [
  {
    range: { start: { line: 5, character: 0 }, end: { line: 5, character: 10 } },
    severity: 1,
    message: 'Unknown type reference',
    source: 'rune-dsl'
  },
  {
    range: { start: { line: 6, character: 0 }, end: { line: 6, character: 15 } },
    severity: 2,
    message: 'Missing attribute description',
    source: 'rune-dsl'
  },
  {
    range: { start: { line: 20, character: 0 }, end: { line: 20, character: 5 } },
    severity: 1,
    message: 'Duplicate definition',
    source: 'rune-dsl'
  }
];

const typePositions: Map<string, TypePosition> = new Map([
  ['Foo', { start: 3, end: 10 }],
  ['Bar', { start: 15, end: 25 }]
]);

describe('mapDiagnosticsToTypes', () => {
  it('maps diagnostics to types by line range', () => {
    const result = mapDiagnosticsToTypes(
      'file:///workspace/model.rosetta',
      sampleDiagnostics,
      typePositions
    );

    expect(result).toHaveLength(2);
  });

  it('counts errors and warnings per type', () => {
    const result = mapDiagnosticsToTypes(
      'file:///workspace/model.rosetta',
      sampleDiagnostics,
      typePositions
    );

    const fooSummary = result.find((s) => s.typeName === 'Foo');
    expect(fooSummary).toBeDefined();
    expect(fooSummary!.errorCount).toBe(1);
    expect(fooSummary!.warningCount).toBe(1);

    const barSummary = result.find((s) => s.typeName === 'Bar');
    expect(barSummary).toBeDefined();
    expect(barSummary!.errorCount).toBe(1);
    expect(barSummary!.warningCount).toBe(0);
  });

  it('includes file URI in summaries', () => {
    const result = mapDiagnosticsToTypes(
      'file:///workspace/model.rosetta',
      sampleDiagnostics,
      typePositions
    );

    for (const summary of result) {
      expect(summary.fileUri).toBe('file:///workspace/model.rosetta');
    }
  });

  it('returns empty array when no diagnostics', () => {
    const result = mapDiagnosticsToTypes('file:///workspace/model.rosetta', [], typePositions);
    expect(result).toEqual([]);
  });

  it('returns empty array when no type positions', () => {
    const result = mapDiagnosticsToTypes(
      'file:///workspace/model.rosetta',
      sampleDiagnostics,
      new Map()
    );
    expect(result).toEqual([]);
  });

  it('ignores diagnostics outside any type range', () => {
    const outsideDiags: LspDiagnostic[] = [
      {
        range: { start: { line: 50, character: 0 }, end: { line: 50, character: 5 } },
        severity: 1,
        message: 'orphan error'
      }
    ];
    const result = mapDiagnosticsToTypes(
      'file:///workspace/model.rosetta',
      outsideDiags,
      typePositions
    );
    expect(result).toEqual([]);
  });
});
