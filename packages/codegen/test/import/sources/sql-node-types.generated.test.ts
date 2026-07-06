// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Drift guard for the GENERATED src/import/sources/generated/sql-node-types.ts
 * (spec 021 Phase 2c Addendum 2). `@l1xnan/tree-sitter-sql` is exact-pinned
 * (pnpm-workspace.yaml override) precisely because this file's typed field
 * unions are baked in from one specific version's shipped node-types.json —
 * a silent version bump without regenerating must fail LOUDLY here, not
 * desync the typed field API from the grammar's real shape quietly.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it, expect } from 'vitest';
import { SQL_NODE_TYPES } from '../../../src/import/sources/generated/sql-node-types.js';

describe('sql-node-types.generated — drift guard', () => {
  it('matches the actually-installed @l1xnan/tree-sitter-sql node-types.json exactly', () => {
    const require = createRequire(import.meta.url);
    const pkgJsonPath = require.resolve('@l1xnan/tree-sitter-sql/package.json');
    const nodeTypesPath = pkgJsonPath.replace(/package\.json$/, 'src/node-types.json');
    const installed = JSON.parse(readFileSync(nodeTypesPath, 'utf8'));

    expect(SQL_NODE_TYPES).toEqual(installed);
  });
});
