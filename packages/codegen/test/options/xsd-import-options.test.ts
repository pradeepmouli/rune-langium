// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { XsdImportOptionsSchema } from '../../src/options/xsd-import-options.js';

describe('XsdImportOptionsSchema', () => {
  it('defaults skipConditions to false and importTopLevelElements to false', () => {
    expect(XsdImportOptionsSchema.parse({})).toEqual({ skipConditions: false, importTopLevelElements: false });
  });
});
