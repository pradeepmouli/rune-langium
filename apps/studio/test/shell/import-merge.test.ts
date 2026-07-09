// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { mergeImportedText } from '../../src/shell/import-merge.js';

const EXISTING = `namespace example
version "0.0.0"

type Party:
  name string (1..1)
`;

const IMPORTED_NO_COLLISION = `namespace example
version "0.0.0"

type Trade:
  quantity number (1..1)
`;

const IMPORTED_ALL_COLLIDE = `namespace example
version "0.0.0"

type Party:
  id string (1..1)
`;

describe('mergeImportedText', () => {
  it('appends every imported element when there are no collisions', async () => {
    const result = await mergeImportedText(EXISTING, IMPORTED_NO_COLLISION);
    expect(result.skipped).toEqual([]);
    expect(result.mergedText).toContain('type Party');
    expect(result.mergedText).toContain('type Trade');
  });

  it('skips a colliding element and keeps the existing one', async () => {
    const result = await mergeImportedText(EXISTING, IMPORTED_ALL_COLLIDE);
    expect(result.skipped).toEqual(['Party']);
    expect(result.mergedText).toContain('name string (1..1)');
    expect(result.mergedText).not.toContain('id string (1..1)');
  });

  it('drops every imported element when all collide, leaving existingText unchanged', async () => {
    const result = await mergeImportedText(EXISTING, IMPORTED_ALL_COLLIDE);
    expect(result.mergedText).toBe(EXISTING);
  });

  it('always produces text that re-parses with zero errors', async () => {
    const { parse } = await import('@rune-langium/core');
    const result = await mergeImportedText(EXISTING, IMPORTED_NO_COLLISION);
    const reparsed = await parse(result.mergedText);
    expect(reparsed.hasErrors).toBe(false);
  });
});
