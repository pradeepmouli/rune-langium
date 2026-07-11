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
import { Language, Parser } from 'web-tree-sitter';

/** Raw WASM bytes for the grammar, or a path resolvable by `web-tree-sitter`'s own `Language.load`. Supplying bytes directly is the browser-loadable path (e.g. `fetch(...).then(r => r.arrayBuffer()).then(b => new Uint8Array(b))`). */
export type WasmSource = Uint8Array | string;

let cachedLanguage: Language | undefined;
let cachedSource: WasmSource | undefined;

/**
 * Resolves `@vscode/tree-sitter-wasm`'s published `tree-sitter-typescript.wasm`
 * path via Node's own CommonJS-style resolution. Node-only — never invoked
 * when a caller supplies `WasmSource` bytes directly. Both Node builtins are
 * imported dynamically, inside this function, so a bundler doing static
 * analysis never sees a Node-builtin import anywhere in this file's module
 * graph (studio's browser bundle statically includes this file via
 * `LanguageLensEditor` -> `@rune-langium/codegen/lens`, even though this
 * Node-only branch is never reached at runtime there).
 */
async function resolveDefaultWasmPath(): Promise<string> {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const pkgJsonPath = require.resolve('@vscode/tree-sitter-wasm/package.json');
  return pkgJsonPath.replace(/package\.json$/, 'wasm/tree-sitter-typescript.wasm');
}

/**
 * Loads (and caches) the tree-sitter TypeScript `Language`. Cached by
 * `source` reference — reference equality (`===`) is sufficient because
 * studio's real usage (`getTsWasmBytes()`) already caches and returns the
 * SAME `Uint8Array` object on every call, and `undefined === undefined` is
 * `true` on the default Node path, so this subsumes the old
 * default-path-only caching rather than narrowing it.
 */
export async function loadTsGrammar(source?: WasmSource): Promise<Language> {
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

/** Creates a `Parser` configured with the loaded TypeScript grammar. */
export async function createTsParser(source?: WasmSource): Promise<Parser> {
  const language = await loadTsGrammar(source);
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}
