// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Fetches the tree-sitter Python grammar's WASM bytes for the browser
 * path of `@rune-langium/codegen/lens`'s `parsePy` (its default path uses
 * `node:fs/promises`, which does not exist in the browser). Mirrors
 * `ts-wasm-asset.ts` exactly, including the clear-cache-on-rejection fix
 * from the Phase 2 PR review (a failed first fetch must not permanently
 * block retry) — see that file's header comment for the full rationale.
 */
import pyWasmUrl from '@vscode/tree-sitter-wasm/wasm/tree-sitter-python.wasm?url';

let cached: Promise<Uint8Array> | undefined;

export function getPyWasmBytes(): Promise<Uint8Array> {
  cached ??= fetch(pyWasmUrl)
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
