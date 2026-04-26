// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { createDiagnostic, hasFatalDiagnostics } from '../src/diagnostics.js';
import type { GeneratorDiagnostic } from '../src/types.js';

describe('createDiagnostic', () => {
  it('creates an error diagnostic with the given fields', () => {
    const diag = createDiagnostic('error', 'X001', 'Something went wrong');
    expect(diag.severity).toBe('error');
    expect(diag.code).toBe('X001');
    expect(diag.message).toBe('Something went wrong');
    expect(diag.sourceUri).toBeUndefined();
    expect(diag.line).toBeUndefined();
    expect(diag.char).toBeUndefined();
  });

  it('creates a warning diagnostic', () => {
    const diag = createDiagnostic('warning', 'W001', 'Watch out');
    expect(diag.severity).toBe('warning');
    expect(diag.code).toBe('W001');
    expect(diag.message).toBe('Watch out');
  });

  it('creates an info diagnostic', () => {
    const diag = createDiagnostic('info', 'I001', 'FYI');
    expect(diag.severity).toBe('info');
  });

  it('includes optional source location when provided', () => {
    const diag = createDiagnostic('error', 'X002', 'Location error', {
      sourceUri: 'file:///model.rune',
      line: 42,
      char: 7
    });
    expect(diag.sourceUri).toBe('file:///model.rune');
    expect(diag.line).toBe(42);
    expect(diag.char).toBe(7);
  });

  it('does not include undefined optional fields when opts not provided', () => {
    const diag = createDiagnostic('error', 'X003', 'No opts');
    expect('sourceUri' in diag).toBe(false);
    expect('line' in diag).toBe(false);
    expect('char' in diag).toBe(false);
  });
});

describe('hasFatalDiagnostics', () => {
  it('returns false for an empty array', () => {
    expect(hasFatalDiagnostics([])).toBe(false);
  });

  it('returns false when all diagnostics are warnings', () => {
    const diags: GeneratorDiagnostic[] = [
      createDiagnostic('warning', 'W001', 'a warning'),
      createDiagnostic('info', 'I001', 'an info')
    ];
    expect(hasFatalDiagnostics(diags)).toBe(false);
  });

  it('returns true when there is at least one error diagnostic', () => {
    const diags: GeneratorDiagnostic[] = [
      createDiagnostic('warning', 'W001', 'a warning'),
      createDiagnostic('error', 'X001', 'an error')
    ];
    expect(hasFatalDiagnostics(diags)).toBe(true);
  });

  it('returns true when all diagnostics are errors', () => {
    const diags: GeneratorDiagnostic[] = [
      createDiagnostic('error', 'X001', 'error one'),
      createDiagnostic('error', 'X002', 'error two')
    ];
    expect(hasFatalDiagnostics(diags)).toBe(true);
  });
});
