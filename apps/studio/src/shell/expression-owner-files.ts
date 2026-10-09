// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { getExpressionOwners, namespaceFromModelName, type Data, type RosettaFunction } from '@rune-langium/core';
import { makeNodeId } from '@rune-langium/visual-editor/identifiers';
import type { ParsedWorkspaceModel } from '../services/workspace.js';
import { withInstrumentation } from '../services/instrumentation/core.js';

export interface ExpressionOwnerFile {
  owner: Data | RosettaFunction;
  filePath: string;
}

/** Keep a namespace's unique expression owner and its file together, including split dispatch groups. */
export const buildExpressionOwnerFiles = withInstrumentation(
  function buildExpressionOwnerFiles(
    models: readonly ParsedWorkspaceModel[]
  ): ReadonlyMap<string, ExpressionOwnerFile | undefined> {
    const owners = new Set(getExpressionOwners(models.map(({ model }) => model)));
    const result = new Map<string, ExpressionOwnerFile | undefined>();
    for (const { model, filePath } of models) {
      const namespace = namespaceFromModelName(model.name) ?? 'unknown';
      for (const owner of model.elements) {
        if (owner.$type !== 'Data' && owner.$type !== 'RosettaFunction') continue;
        const id = makeNodeId(namespace, owner.name, owner.$type);
        if (!result.has(id)) result.set(id, undefined);
        if (owners.has(owner)) result.set(id, { owner, filePath });
      }
    }
    return result;
  },
  { op: 'buildExpressionOwnerFiles' }
);
