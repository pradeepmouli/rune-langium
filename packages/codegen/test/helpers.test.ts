// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import {
  runeCheckOneOf,
  runeCount,
  runeAttrExists,
  RUNTIME_HELPER_SOURCE
} from '../src/helpers.js';

describe('runeCheckOneOf', () => {
  it('returns false for all-undefined values', () => {
    expect(runeCheckOneOf([undefined, undefined, undefined])).toBe(false);
  });

  it('returns true when exactly one value is present', () => {
    expect(runeCheckOneOf([undefined, 'foo', undefined])).toBe(true);
  });

  it('returns false when two values are present', () => {
    expect(runeCheckOneOf(['foo', 'bar', undefined])).toBe(false);
  });

  it('treats null as absent', () => {
    expect(runeCheckOneOf([null, null, 42])).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(runeCheckOneOf([])).toBe(false);
  });

  it('returns false when all values are null', () => {
    expect(runeCheckOneOf([null, null, null])).toBe(false);
  });

  it('returns false when all values are present', () => {
    expect(runeCheckOneOf([1, 2, 3])).toBe(false);
  });
});

describe('runeCount', () => {
  it('returns the length of a non-empty array', () => {
    expect(runeCount(['a', 'b', 'c'])).toBe(3);
  });

  it('returns 0 for an empty array', () => {
    expect(runeCount([])).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(runeCount(undefined)).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(runeCount(null)).toBe(0);
  });

  it('returns 1 for a single-element array', () => {
    expect(runeCount([42])).toBe(1);
  });
});

describe('runeAttrExists', () => {
  it('returns true for a string value', () => {
    expect(runeAttrExists('hello')).toBe(true);
  });

  it('returns true for a numeric value', () => {
    expect(runeAttrExists(42)).toBe(true);
  });

  it('returns false for an empty array', () => {
    expect(runeAttrExists([])).toBe(false);
  });

  it('returns true for a non-empty array', () => {
    expect(runeAttrExists(['a'])).toBe(true);
  });

  it('returns false for null', () => {
    expect(runeAttrExists(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(runeAttrExists(undefined)).toBe(false);
  });

  it('returns true for false (boolean false is a valid value)', () => {
    expect(runeAttrExists(false)).toBe(true);
  });

  it('returns true for zero (0 is a valid value)', () => {
    expect(runeAttrExists(0)).toBe(true);
  });
});

describe('RUNTIME_HELPER_SOURCE', () => {
  it('is a non-empty string', () => {
    expect(typeof RUNTIME_HELPER_SOURCE).toBe('string');
    expect(RUNTIME_HELPER_SOURCE.length).toBeGreaterThan(0);
  });

  it('contains the opening comment marker', () => {
    expect(RUNTIME_HELPER_SOURCE).toContain('// --- rune-codegen runtime helpers (inlined) ---');
  });

  it('contains the closing comment marker', () => {
    expect(RUNTIME_HELPER_SOURCE).toContain('// --- end runtime helpers ---');
  });

  it('contains all three helper function names', () => {
    expect(RUNTIME_HELPER_SOURCE).toContain('runeCheckOneOf');
    expect(RUNTIME_HELPER_SOURCE).toContain('runeCount');
    expect(RUNTIME_HELPER_SOURCE).toContain('runeAttrExists');
  });
});
