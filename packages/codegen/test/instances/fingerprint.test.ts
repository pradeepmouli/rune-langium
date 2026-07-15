// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/instances/fingerprint.js';

describe('sha256Hex', () => {
  it('hashes bytes to a stable hex digest', async () => {
    const bytes = new TextEncoder().encode('hello world');
    const hex = await sha256Hex(bytes);
    expect(hex).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('produces different digests for different input', async () => {
    const a = await sha256Hex(new TextEncoder().encode('a'));
    const b = await sha256Hex(new TextEncoder().encode('b'));
    expect(a).not.toBe(b);
  });
});
