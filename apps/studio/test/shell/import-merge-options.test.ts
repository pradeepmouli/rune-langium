// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { MergeOptionsSchema } from '../../src/shell/import-merge-options.js';

describe('MergeOptionsSchema', () => {
  it('defaults onCollision to skip', () => {
    expect(MergeOptionsSchema.parse({})).toEqual({ onCollision: 'skip' });
  });

  it('accepts overwrite and rename', () => {
    expect(MergeOptionsSchema.parse({ onCollision: 'overwrite' }).onCollision).toBe('overwrite');
    expect(MergeOptionsSchema.parse({ onCollision: 'rename' }).onCollision).toBe('rename');
  });
});
