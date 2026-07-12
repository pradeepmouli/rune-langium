// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * py-grammar-loader — loads the tree-sitter Python grammar
 * (`web-tree-sitter` WASM runtime) for `parse-py.ts`.
 *
 * Mirrors `../typescript/ts-grammar-loader.ts` exactly. `@vscode/tree-sitter-wasm`
 * (already a Phase 1 dependency) ships `wasm/tree-sitter-python.wasm` in the
 * same package as `wasm/tree-sitter-typescript.wasm` — confirmed present on
 * disk and confirmed to load and parse real Python expressions correctly
 * during Phase 3 planning (no new dependency needed).
 */
import { Language, Parser } from 'web-tree-sitter';
// Re-exported (not just imported) so `parse-py.ts` can consume `WasmSource`
// from this module directly, matching the documented Task 3 interface
// contract ("Consumes: createPyParser, WasmSource from ./py-grammar-loader.js").
export type { WasmSource } from '../typescript/ts-grammar-loader.js';
import type { WasmSource } from '../typescript/ts-grammar-loader.js';

let cachedLanguage: Language | undefined;
let cachedSource: WasmSource | undefined;

/**
 * Resolves `@vscode/tree-sitter-wasm`'s published `tree-sitter-python.wasm`
 * path via Node's own CommonJS-style resolution. Node-only — never invoked
 * when a caller supplies `WasmSource` bytes directly. Both Node builtins are
 * imported dynamically, inside this function, so a bundler doing static
 * analysis never sees a Node-builtin import anywhere in this file's module
 * graph (same reasoning as `ts-grammar-loader.ts`'s identical structure).
 */
async function resolveDefaultWasmPath(): Promise<string> {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const pkgJsonPath = require.resolve('@vscode/tree-sitter-wasm/package.json');
  return pkgJsonPath.replace(/package\.json$/, 'wasm/tree-sitter-python.wasm');
}

/**
 * Loads (and caches) the tree-sitter Python `Language`. Cached by `source`
 * reference — same reasoning as `loadTsGrammar`.
 */
export async function loadPyGrammar(source?: WasmSource): Promise<Language> {
  if (cachedLanguage && source === cachedSource) return cachedLanguage;

  await Parser.init();
  const bytes = source instanceof Uint8Array ? source : await readWasmBytes(source);
  const language = await Language.load(bytes);
  cachedLanguage = language;
  cachedSource = source;
  return language;
}

async function readWasmBytes(pathOverride: string | undefined): Promise<Uint8Array> {
  const path = pathOverride ?? (await resolveDefaultWasmPath());
  const { readFile } = await import('node:fs/promises');
  const buf = await readFile(path);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Creates a `Parser` configured with the loaded Python grammar. */
export async function createPyParser(source?: WasmSource): Promise<Parser> {
  const language = await loadPyGrammar(source);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
