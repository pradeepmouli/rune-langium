// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Copy `$cstNode.text -> $cstText` for condition/expression-bearing AST parts
 * BEFORE `JsonSerializer.serialize`, because `$cstNode` is non-serializable
 * (circular) and the serializer drops it — yet the visual-editor's expression
 * cells need the original source text after the JSON round-trip.
 *
 * Walks Function shortcuts/conditions/operations/postConditions and Data/Choice
 * conditions, copying both the part's and its `expression`'s CST text. Single
 * source of truth shared by the browser parse worker and the server parse
 * function (previously duplicated, byte-identical, in both — V7).
 *
 * **Retained (Task 9 / CST-reuse eval):** Though `$cstRange` is now stamped on
 * all nodes during hydration, visual-editor expression consumers (FunctionForm,
 * model-helpers, etc.) cannot access originalSourceByNamespace to slice via offsets—
 * they are across a source-less boundary post-serialization. Keep `preserveCstText`.
 */
export function preserveCstText(model: any): void {
  for (const elem of model?.elements ?? []) {
    if (elem.$type === 'RosettaFunction') {
      for (const arr of [elem.shortcuts, elem.operations, elem.postConditions]) {
        for (const part of arr ?? []) {
          if (part?.$cstNode?.text) {
            part.$cstText = part.$cstNode.text;
          }
          if (part?.expression?.$cstNode?.text) {
            part.expression.$cstText = part.expression.$cstNode.text;
          }
        }
      }
    }
    if (elem.conditions) {
      for (const cond of elem.conditions) {
        if (cond?.$cstNode?.text) {
          cond.$cstText = cond.$cstNode.text;
        }
        if (cond?.expression?.$cstNode?.text) {
          cond.expression.$cstText = cond.expression.$cstNode.text;
        }
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */
