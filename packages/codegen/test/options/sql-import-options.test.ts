// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { SqlImportOptionsSchema } from '../../src/options/sql-import-options.js';

describe('SqlImportOptionsSchema', () => {
  it('defaults dialect to postgres and skipConditions to false', () => {
    expect(SqlImportOptionsSchema.parse({})).toEqual({ dialect: 'postgres', skipConditions: false });
  });

  it('accepts sqlserver', () => {
    expect(SqlImportOptionsSchema.parse({ dialect: 'sqlserver' }).dialect).toBe('sqlserver');
  });
});
