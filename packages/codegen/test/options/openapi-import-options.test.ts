// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { OpenApiImportOptionsSchema } from '../../src/options/openapi-import-options.js';

describe('OpenApiImportOptionsSchema', () => {
  it('defaults preserve current behavior (all fields on)', () => {
    expect(OpenApiImportOptionsSchema.parse({})).toEqual({
      skipConditions: false,
      includeUnreferencedDefs: true,
      includeOperations: true
    });
  });
});
