// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * sql-grammar-loader — loads the tree-sitter SQL grammar (`web-tree-sitter`
 * WASM runtime) for `sql-reader.ts` (spec 021 Phase 2c Addendum, T0
 * viability spike).
 *
 * Per the addendum: "building grammar wasm from source requires emscripten
 * and is OUT — a viability spike gates the effort: if no installable
 * prebuilt-wasm SQL grammar exists, STOP and report options." The spike
 * (`.superpowers/sdd/sql-reader-report.md`) found `@l1xnan/tree-sitter-sql`
 * (a fork of the spec's own candidate, `derekstride/tree-sitter-sql`) ships
 * a prebuilt `tree-sitter-sql.wasm` (2.4 MB, verified valid — `\0asm` magic
 * bytes) directly in its published tarball; every other npm SQL
 * tree-sitter grammar (`tree-sitter-sql`, `@derekstride/tree-sitter-sql`,
 * `tree-sitter-sql-bigquery`) ships only C source (`parser.c` +
 * `binding.gyp`, native N-API addon) or a platform-specific prebuilt
 * `.node` binary — neither is WASM. `tree-sitter-wasms` (a bundle of
 * prebuilt grammar wasm files) does not include SQL at all.
 *
 * `@l1xnan/tree-sitter-sql` declares `tree-sitter` (the native N-API
 * binding package) as a peer dependency purely for its OWN native-binding
 * entry point (`bindings/node`, `main` in its package.json) — this module
 * never imports that entry, only the sibling `.wasm` file, so `tree-sitter`'s
 * own `node-gyp`/`binding.gyp` build is unneeded and disabled via
 * `pnpm-workspace.yaml`'s `allowBuilds`.
 *
 * `web-tree-sitter`'s `Language.load(input: string | Uint8Array)` accepts
 * either a filesystem path (Node) or raw bytes — a browser `fetch(...).
 * arrayBuffer()` naturally produces the latter. This module's `WasmSource`
 * abstraction is exactly that seam: `loadSqlGrammar` accepts either a
 * caller-supplied `Uint8Array` (browser: fetch the asset yourself and pass
 * the bytes) or, when omitted, resolves and reads the package's own
 * `.wasm` file from disk via Node's `fs` (the default, used by
 * `sql-reader.ts` and every Node-side test) — no Node-only API is baked
 * into the exported surface itself.
 */

import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Language, Parser } from 'web-tree-sitter';

/** Raw WASM bytes for the SQL grammar, or a path resolvable by `web-tree-sitter`'s own `Language.load`. Supplying bytes directly is the browser-loadable path (e.g. `fetch(...).then(r => r.arrayBuffer()).then(b => new Uint8Array(b))`). */
export type WasmSource = Uint8Array | string;

let cachedLanguage: Language | undefined;

/** Resolves `@l1xnan/tree-sitter-sql`'s published `tree-sitter-sql.wasm` path via Node's own CommonJS-style resolution (works under both `require` and `import` since `createRequire` only needs a base URL). Node-only — never called when a caller supplies `WasmSource` bytes directly. */
function resolveDefaultWasmPath(): string {
  const require = createRequire(import.meta.url);
  // The package has no `exports` map (legacy resolution) and no `.wasm`-specific
  // subpath export, but does list `*.wasm` in its `files` array — resolving
  // `package.json` and locating the sibling file is the stable anchor point.
  const pkgJsonPath = require.resolve('@l1xnan/tree-sitter-sql/package.json');
  return pkgJsonPath.replace(/package\.json$/, 'tree-sitter-sql.wasm');
}

/**
 * Loads (and caches) the tree-sitter SQL `Language`. Call once per process;
 * `sql-reader.ts` and its tests share the cached instance.
 */
export async function loadSqlGrammar(source?: WasmSource): Promise<Language> {
  if (cachedLanguage && source === undefined) return cachedLanguage;

  await Parser.init();
  const bytes = source instanceof Uint8Array ? source : await readWasmBytes(source);
  const language = await Language.load(bytes);
  if (source === undefined) cachedLanguage = language;
  return language;
}

async function readWasmBytes(pathOverride: string | undefined): Promise<Uint8Array> {
  const path = pathOverride ?? resolveDefaultWasmPath();
  const buf = await readFile(path);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Creates a `Parser` configured with the loaded SQL grammar. */
export async function createSqlParser(source?: WasmSource): Promise<Parser> {
  const language = await loadSqlGrammar(source);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
