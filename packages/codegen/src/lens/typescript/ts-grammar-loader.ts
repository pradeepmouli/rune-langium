// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ts-grammar-loader — loads the tree-sitter TypeScript grammar
 * (`web-tree-sitter` WASM runtime) for `parse-ts.ts`.
 *
 * Mirrors `../../import/sources/sql-grammar-loader.ts` exactly. A viability
 * spike (see the plan's "Deviations From the Spec" §3) found:
 * - `tree-sitter-wasms` fails to load against the installed `web-tree-sitter`
 *   (Emscripten dylink-metadata error) — not a viable dependency.
 * - The official `tree-sitter-typescript` npm package ships no `.wasm`, only
 *   native C source.
 * - `@vscode/tree-sitter-wasm` ships a working, confirmed-loadable
 *   `tree-sitter-typescript.wasm` (and, for the future Python lens, Phase 3,
 *   a `tree-sitter-python.wasm` from the SAME package — one dependency for
 *   both languages, per the user's explicit direction).
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { Language, Parser } from 'web-tree-sitter';

/** Raw WASM bytes for the grammar, or a path resolvable by `web-tree-sitter`'s own `Language.load`. Supplying bytes directly is the browser-loadable path (e.g. `fetch(...).then(r => r.arrayBuffer()).then(b => new Uint8Array(b))`). */
export type WasmSource = Uint8Array | string;

let cachedLanguage: Language | undefined;

/** Resolves `@vscode/tree-sitter-wasm`'s published `tree-sitter-typescript.wasm` path via Node's own CommonJS-style resolution. Node-only — never called when a caller supplies `WasmSource` bytes directly. */
function resolveDefaultWasmPath(): string {
  const require = createRequire(import.meta.url);
  const pkgJsonPath = require.resolve('@vscode/tree-sitter-wasm/package.json');
  return pkgJsonPath.replace(/package\.json$/, 'wasm/tree-sitter-typescript.wasm');
}

/** Loads (and caches) the tree-sitter TypeScript `Language`. Call once per process. */
export async function loadTsGrammar(source?: WasmSource): Promise<Language> {
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

/** Creates a `Parser` configured with the loaded TypeScript grammar. */
export async function createTsParser(source?: WasmSource): Promise<Parser> {
  const language = await loadTsGrammar(source);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
