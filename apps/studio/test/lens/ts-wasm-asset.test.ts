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
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }))
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

  it('clears the cache on a rejected fetch so a later call can retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network error');
      })
    );
    const { getTsWasmBytes } = await import('../../src/lens/ts-wasm-asset.js');

    await expect(getTsWasmBytes()).rejects.toThrow('network error');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer }))
    );

    const bytes = await getTsWasmBytes();
    expect(Array.from(bytes)).toEqual([4, 5, 6]);
  });

  it('rejects and clears the cache on a non-2xx fetch response so a later call can retry', async () => {
    const badArrayBuffer = vi.fn(async () => new TextEncoder().encode('<html>error page</html>').buffer);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        arrayBuffer: badArrayBuffer
      }))
    );
    const { getTsWasmBytes } = await import('../../src/lens/ts-wasm-asset.js');

    await expect(getTsWasmBytes()).rejects.toThrow(/503/);
    // The error-page body must never be read as if it were valid WASM bytes.
    expect(badArrayBuffer).not.toHaveBeenCalled();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([7, 8, 9]).buffer }))
    );

    const bytes = await getTsWasmBytes();
    expect(Array.from(bytes)).toEqual([7, 8, 9]);
  });
});
