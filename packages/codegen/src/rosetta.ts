// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Browser-safe entry for the `.rosetta` render-core.
 *
 * Re-exports ONLY the pure render-core. It must never import `./index.js`,
 * `./generator.js`, or anything under `./emit/excel-emitter.js` — those pull in
 * ExcelJS (Node-only) and would break browser bundling of the visual editor.
 */
export { renderNode, renderModel } from './emit/rosetta/rosetta-render-core.js';
export type { RenderChild, DehydratedNode, RenderOpts } from './emit/rosetta/rosetta-render-core.js';
export { renderExpression, UnsupportedExpressionError, RAW_DSL_TYPE } from './emit/rosetta/render-expression.js';
export type { DehydratedExpression, RawDslLeaf } from './emit/rosetta/render-expression.js';
export {
  renderSynonymBody,
  renderClassSynonymValue,
  UnsupportedSynonymBodyError
} from './emit/rosetta/render-synonym-body.js';
