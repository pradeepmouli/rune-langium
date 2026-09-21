// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { sanitizeDownloadFilename } from '../../src/services/export.js';

describe('sanitizeDownloadFilename', () => {
  it('removes path components, controls, and quotes from user-controlled names', () => {
    expect(sanitizeDownloadFilename('../../Party\n".json', 'instance.json')).toBe('Party.json');
    expect(sanitizeDownloadFilename('C:\\temp\\Party.json', 'instance.json')).toBe('Party.json');
  });

  it('falls back when no safe filename remains', () => {
    expect(sanitizeDownloadFilename(' / ', 'instance.json')).toBe('instance.json');
  });
});
