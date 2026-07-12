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
    .then((r) => r.arrayBuffer())
    .then((buf) => new Uint8Array(buf))
    .catch((e) => {
      // A failed fetch (offline, transient network error) must not poison
      // the cache forever — clear it so the next call retries instead of
      // replaying the same rejection indefinitely.
      cached = undefined;
      throw e;
    });
  return cached;
}
