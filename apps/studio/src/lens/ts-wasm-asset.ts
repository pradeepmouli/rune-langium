// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Fetches the tree-sitter TypeScript grammar's WASM bytes for the browser
 * path of `@rune-langium/codegen/lens`'s `parseTs` (its default path uses
 * `node:fs/promises`, which does not exist in the browser). The `?url`
 * suffix is Vite's asset-import convention — it resolves the imported
 * file to a hashed, servable URL and copies it into the build output,
 * without a manual public-asset copy step.
 */
import tsWasmUrl from '@vscode/tree-sitter-wasm/wasm/tree-sitter-typescript.wasm?url';

let cached: Promise<Uint8Array> | undefined;

export function getTsWasmBytes(): Promise<Uint8Array> {
  cached ??= fetch(tsWasmUrl)
    .then((r) => {
      // fetch() only rejects on network-level failures — it resolves
      // normally for HTTP error statuses (404, a transient 503, etc.).
      // Without this check, a failed response's error body would be read
      // as if it were valid WASM bytes and cached as a FULFILLED promise,
      // so the .catch() below (which only fires on rejection) would never
      // clear the bad cache — Language.load() would then fail much later
      // on every retry until a full page reload.
      if (!r.ok) throw new Error(`failed to fetch TypeScript WASM grammar: ${r.status} ${r.statusText}`);
      return r.arrayBuffer();
    })
    .then((buf) => new Uint8Array(buf))
    .catch((e) => {
      // A failed fetch (offline, transient network error, or the non-2xx
      // response rejected above) must not poison the cache forever — clear
      // it so the next call retries instead of replaying the same
      // rejection indefinitely.
      cached = undefined;
      throw e;
    });
  return cached;
}
