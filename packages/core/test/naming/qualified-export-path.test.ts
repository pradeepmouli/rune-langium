// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { qualifiedExportPath } from '../../src/naming/qualified-export-path.js';

describe('qualifiedExportPath', () => {
  it('joins namespace and name with a dot', () => {
    expect(qualifiedExportPath('cdm.base.datetime', 'BusinessCenters')).toBe('cdm.base.datetime.BusinessCenters');
  });
  it('handles a single-segment namespace', () => {
    expect(qualifiedExportPath('test', 'Foo')).toBe('test.Foo');
  });
  it('handles an empty namespace by returning the bare name (no leading dot)', () => {
    expect(qualifiedExportPath('', 'Foo')).toBe('Foo');
  });
});
