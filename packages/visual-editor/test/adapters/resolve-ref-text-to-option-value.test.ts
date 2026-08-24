// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';

import { resolveRefTextToOptionValue } from '../../src/adapters/model-helpers.js';
import type { TypeOption } from '../../src/types.js';

// Two functions named `BaseFunction` in different namespaces -- the
// cross-namespace collision `disambiguateTypeRef` (editor-store.ts)
// qualifies for. See Codex review, PR #494: a bare `label`-only match
// silently fails to resolve the qualified ref.
const OPTIONS: TypeOption[] = [
  { value: 'other.BaseFunction', label: 'BaseFunction', kind: 'func', namespace: 'other' },
  { value: 'test.model.BaseFunction', label: 'BaseFunction', kind: 'func', namespace: 'test.model' },
  { value: 'test.model.UniqueFunc', label: 'UniqueFunc', kind: 'func', namespace: 'test.model' }
];

describe('resolveRefTextToOptionValue', () => {
  it('resolves a qualified ref text by matching the canonical value', () => {
    expect(resolveRefTextToOptionValue('other.BaseFunction', OPTIONS)).toBe('other.BaseFunction');
    expect(resolveRefTextToOptionValue('test.model.BaseFunction', OPTIONS)).toBe('test.model.BaseFunction');
  });

  it('resolves a bare, globally-unique ref text by matching the label', () => {
    expect(resolveRefTextToOptionValue('UniqueFunc', OPTIONS)).toBe('test.model.UniqueFunc');
  });

  it('returns null when the ref text matches nothing', () => {
    expect(resolveRefTextToOptionValue('NoSuchFunction', OPTIONS)).toBeNull();
  });

  it('returns null for undefined or empty ref text', () => {
    expect(resolveRefTextToOptionValue(undefined, OPTIONS)).toBeNull();
    expect(resolveRefTextToOptionValue('', OPTIONS)).toBeNull();
  });

  // Documents the caller-scoping contract from the doc comment: bare-name
  // uniqueness only holds within the caller's own scoped candidate list.
  // Passing an unscoped, mixed-kind list can match the wrong option (Codex
  // review, PR #494) -- callers (e.g. FunctionForm's Extends field) must
  // pre-filter `options` to the referenceable kind before calling this.
  it('matches whichever option comes first when given an unscoped, mixed-kind list', () => {
    const mixedKindOptions: TypeOption[] = [
      { value: 'test.model.BaseFunction', label: 'BaseFunction', kind: 'data', namespace: 'test.model' },
      { value: 'other.BaseFunction', label: 'BaseFunction', kind: 'func', namespace: 'other' }
    ];
    expect(resolveRefTextToOptionValue('BaseFunction', mixedKindOptions)).toBe('test.model.BaseFunction');
  });
});
