// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Node type registry for ReactFlow.
 *
 * Defined outside component tree to prevent re-renders.
 */

import type { NodeTypes } from '@xyflow/react';
import { DataNode } from './DataNode.js';
import { ChoiceNode } from './ChoiceNode.js';
import { EnumNode } from './EnumNode.js';
import { GenericNode } from './GenericNode.js';
import { GroupContainerNode } from './GroupContainerNode.js';

export const nodeTypes: NodeTypes = {
  data: DataNode,
  choice: ChoiceNode,
  enum: EnumNode,
  func: GenericNode,
  record: GenericNode,
  typeAlias: GenericNode,
  basicType: GenericNode,
  annotation: GenericNode,
  groupContainer: GroupContainerNode,
  // Finding 2: layoutStructureGraph emits base containers as type:'structureBase'; both
  // types map to GroupContainerNode which branches on data.scope internally.
  structureBase: GroupContainerNode
};
