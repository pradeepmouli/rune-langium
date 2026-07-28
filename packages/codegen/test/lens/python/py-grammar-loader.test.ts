// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { createPyParser, loadPyGrammar } from '../../../src/lens/python/py-grammar-loader.js';

describe('py-grammar-loader', () => {
  it('loads the Python grammar and parses a trivial expression', async () => {
    const parser = await createPyParser();
    const tree = parser.parse('a + b');
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.hasError).toBe(false);
  });

  it('caches the grammar by source reference, returning the same Language object', async () => {
    const langA = await loadPyGrammar();
    const langB = await loadPyGrammar();
    expect(langA).toBe(langB);
  });
});
