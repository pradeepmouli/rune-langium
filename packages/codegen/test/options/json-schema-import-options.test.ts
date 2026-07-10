// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { JsonSchemaImportOptionsSchema } from '../../src/options/json-schema-import-options.js';

describe('JsonSchemaImportOptionsSchema', () => {
  it('defaults skipConditions to false and includeUnreferencedDefs to true', () => {
    const parsed = JsonSchemaImportOptionsSchema.parse({});
    expect(parsed).toEqual({ skipConditions: false, includeUnreferencedDefs: true });
  });

  it('accepts explicit overrides', () => {
    const parsed = JsonSchemaImportOptionsSchema.parse({ skipConditions: true, includeUnreferencedDefs: false });
    expect(parsed).toEqual({ skipConditions: true, includeUnreferencedDefs: false });
  });
});
