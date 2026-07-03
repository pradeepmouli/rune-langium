// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { PERSPECTIVES } from '../../src/shell/perspectives/perspective-registry.js';

describe('perspective registry chrome contract', () => {
  it('every non-explore perspective declares a bar title', () => {
    for (const p of PERSPECTIVES.filter((p) => p.id !== 'explore')) {
      expect(p.title, `${p.id} needs a title`).toBeTruthy();
    }
  });
  it('showsFileTabs is retired', () => {
    for (const p of PERSPECTIVES) {
      expect('showsFileTabs' in p, `${p.id} still carries showsFileTabs`).toBe(false);
    }
  });
});
