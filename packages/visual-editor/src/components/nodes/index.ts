/**
 * Node type registry for ReactFlow.
 *
 * Defined outside component tree to prevent re-renders.
 */

import type { NodeTypes } from '@xyflow/react';
import { DataNode } from './DataNode.js';
import { ChoiceNode } from './ChoiceNode.js';
import { EnumNode } from './EnumNode.js';

export const nodeTypes: NodeTypes = {
  data: DataNode,
  choice: ChoiceNode,
  enum: EnumNode
};
