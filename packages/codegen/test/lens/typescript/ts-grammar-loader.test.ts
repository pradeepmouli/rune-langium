// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { createTsParser } from '../../../src/lens/typescript/ts-grammar-loader.js';

describe('createTsParser', () => {
  it('loads the TypeScript grammar and parses a trivial expression', async () => {
    const parser = await createTsParser();
    const tree = parser.parse('value >= 0');
    expect(tree?.rootNode.hasError).toBe(false);
    expect(tree?.rootNode.child(0)?.type).toBe('expression_statement');
  });
});

// `loadTsGrammar` caches its result in module-level state, keyed by reference
// equality of `source` (by design — see ts-grammar-loader.ts). Vitest only
// resets the module registry per test FILE, not per `it()` block, so a
// static top-level import would let one test's cache warm-up silently
// defeat another test's assertions. Each test resets modules and re-imports
// dynamically, mirroring apps/studio/test/lens/ts-wasm-asset.test.ts, so the
// cache starts empty and only observes its own `Language.load` spy.
describe('loadTsGrammar cache-by-reference', () => {
  let wasmBytes: Uint8Array;

  beforeAll(async () => {
    const req = createRequire(import.meta.url);
    const pkgJsonPath = req.resolve('@vscode/tree-sitter-wasm/package.json');
    const wasmPath = pkgJsonPath.replace(/package\.json$/, 'wasm/tree-sitter-typescript.wasm');
    const buf = await readFile(wasmPath);
    wasmBytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  });

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reuses the cached Language for the same source reference, and reloads for a different one', async () => {
    const { Language } = await import('web-tree-sitter');
    const loadSpy = vi.spyOn(Language, 'load');
    const { loadTsGrammar } = await import('../../../src/lens/typescript/ts-grammar-loader.js');

    // Two distinct `Uint8Array` objects with equal content — reference
    // inequality, not content, is what must trigger a reload.
    const bytesA = wasmBytes.slice();
    const bytesB = wasmBytes.slice();

    const languageA1 = await loadTsGrammar(bytesA);
    expect(loadSpy).toHaveBeenCalledTimes(1);

    const languageA2 = await loadTsGrammar(bytesA);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(languageA2).toBe(languageA1);

    const languageB = await loadTsGrammar(bytesB);
    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(languageB).not.toBe(languageA1);
  });
});
