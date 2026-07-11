// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { createTsParser } from '../../../src/lens/typescript/ts-grammar-loader.js';

describe('createTsParser', () => {
  it('loads the TypeScript grammar and parses a trivial expression', async () => {
    const parser = await createTsParser();
    const tree = parser.parse('value >= 0');
    expect(tree?.rootNode.hasError).toBe(false);
    expect(tree?.rootNode.child(0)?.type).toBe('expression_statement');
  });
});
