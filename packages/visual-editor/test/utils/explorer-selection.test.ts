// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { selectionState, toggleVisible } from '../../src/utils/explorer-selection.js';

describe('explorer selection helpers', () => {
  it('clears visible roots without clearing hidden roots', () => {
    expect(toggleVisible(['a.Party'], new Set(['a.Party', 'b.Trade']), false)).toEqual(new Set(['b.Trade']));
    expect(selectionState(['a.Party', 'a.Address'], new Set(['a.Party']))).toBe('indeterminate');
  });

  it('reports checked and unchecked states', () => {
    expect(selectionState(['a.Party'], new Set(['a.Party']))).toBe(true);
    expect(selectionState(['a.Party'], new Set())).toBe(false);
  });
});
