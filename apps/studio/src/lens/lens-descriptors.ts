// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { renderTs, parseTs, renderPy, parsePy } from '@rune-langium/codegen/lens';
import { getTsWasmBytes } from './ts-wasm-asset.js';
import { getPyWasmBytes } from './py-wasm-asset.js';

/** Narrow inverse contracts, independent of generated display coverage. */
export const FOREIGN_LENSES = {
  typescript: { label: 'TypeScript', render: renderTs, parse: parseTs, getWasmBytes: getTsWasmBytes },
  python: { label: 'Python', render: renderPy, parse: parsePy, getWasmBytes: getPyWasmBytes }
};
