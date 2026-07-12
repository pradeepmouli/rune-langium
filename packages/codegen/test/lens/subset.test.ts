// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { isInSubsetS, SUBSET_S_TYPES } from '../../src/lens/subset.js';

describe('isInSubsetS', () => {
  it('accepts every $type in SUBSET_S_TYPES', () => {
    for (const $type of SUBSET_S_TYPES) {
      expect(isInSubsetS({ $type }), `expected ${$type} to be in S`).toBe(true);
    }
  });

  it('rejects $types outside S', () => {
    for (const $type of ['SwitchOperation', 'ThenOperation', 'RosettaCountOperation', 'ChoiceOperation', 'RawDsl']) {
      expect(isInSubsetS({ $type }), `expected ${$type} to be rejected`).toBe(false);
    }
  });

  it('has exactly 12 members', () => {
    expect(SUBSET_S_TYPES).toHaveLength(12);
  });
});
