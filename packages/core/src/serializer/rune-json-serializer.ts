// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { DefaultJsonSerializer, type AstNode, type GenericAstNode } from 'langium';

export class RuneJsonSerializer extends DefaultJsonSerializer {
  /** Register all roots before Langium resolves any cross-document references. */
  deserializeModels<T extends AstNode>(contents: readonly string[], register: (models: T[]) => void): T[] {
    const models = contents.map((content) => JSON.parse(content) as T & GenericAstNode);
    register(models);
    for (const model of models) this.linkNode(model, model, {});
    return models;
  }
}
