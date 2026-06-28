// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Browser-safe entry for the `.rosetta` emit-core.
 *
 * Re-exports ONLY the pure emit-core. It must never import `./index.js`,
 * `./generator.js`, or anything under `./emit/excel-emitter.js` — those pull in
 * ExcelJS (Node-only) and would break browser bundling of the visual editor.
 */
export { emitNode, emitModelText } from './emit/rosetta/rosetta-emit-core.js';
export type { EmitChild, DehydratedNode } from './emit/rosetta/rosetta-emit-core.js';
