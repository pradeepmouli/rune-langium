// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { serializeModel } from '../../src/serializer/rosetta-serializer.js';

/**
 * Regression tests for getNamespace in rosetta-serializer.
 *
 * The serializer re-emits .rosetta SOURCE — it must preserve the raw name
 * verbatim (including quotes for STRING-named namespaces). These tests guard
 * against regressions where quote-stripping (via namespaceFromModelName) would
 * produce unparseable `namespace my namespace` output.
 */
describe('serializeModel — namespace round-trip preservation', () => {
  it('preserves quotes for a STRING-named namespace (prevents "namespace my namespace")', () => {
    const model = {
      name: '"my namespace"',
      version: '1.0.0',
      elements: [],
      imports: []
    };
    const out = serializeModel(model);
    // Must emit the quoted form so the .rosetta source is parseable
    expect(out).toContain('namespace "my namespace"');
    // Must NOT strip quotes and produce an unparseable bare name with a space
    expect(out).not.toContain('namespace my namespace');
  });

  it('emits a plain dotted QualifiedName namespace without modification', () => {
    const model = {
      name: { segments: ['com', 'example', 'types'] },
      version: '1.0.0',
      elements: [],
      imports: []
    };
    const out = serializeModel(model);
    expect(out).toContain('namespace com.example.types');
  });

  it('falls back to "unknown" when name is absent', () => {
    const model = { version: '0.0.0', elements: [], imports: [] };
    const out = serializeModel(model);
    expect(out).toContain('namespace unknown');
  });
});
