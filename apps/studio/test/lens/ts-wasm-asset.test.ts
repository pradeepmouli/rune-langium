// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `getTsWasmBytes` caches its result in module-level state (by design — see
// ts-wasm-asset.ts). Vitest only resets the module registry per test FILE,
// not per `it()` block, so a static top-level import would let one test's
// cache warm-up silently defeat another test's fresh `fetch` mock. Each test
// resets modules and re-imports dynamically so the cache starts empty and
// only observes its own `fetch` stub.
describe('getTsWasmBytes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }))
    );
  });

  it('fetches the grammar bytes', async () => {
    const { getTsWasmBytes } = await import('../../src/lens/ts-wasm-asset.js');
    const bytes = await getTsWasmBytes();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it('caches the result — only fetches once across repeated calls', async () => {
    const { getTsWasmBytes } = await import('../../src/lens/ts-wasm-asset.js');
    await getTsWasmBytes();
    await getTsWasmBytes();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
