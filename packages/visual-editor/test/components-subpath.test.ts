// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { TypeSelector, CardinalityPicker } from '../src/components.js';

describe('components subpath barrel', () => {
  it('exports TypeSelector as a non-null function', () => {
    expect(TypeSelector).toBeDefined();
    expect(typeof TypeSelector).toBe('function');
  });

  it('exports CardinalityPicker as a non-null function', () => {
    expect(CardinalityPicker).toBeDefined();
    expect(typeof CardinalityPicker).toBe('function');
  });
});
