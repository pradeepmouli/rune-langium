/**
 * Edge type registry for ReactFlow.
 *
 * Defined outside component tree to prevent re-renders.
 */

import type { EdgeTypes } from '@xyflow/react';
import { InheritanceEdge } from './InheritanceEdge.js';
import { ReferenceEdge } from './ReferenceEdge.js';

export const edgeTypes: EdgeTypes = {
  extends: InheritanceEdge,
  'attribute-ref': ReferenceEdge,
  'choice-option': ReferenceEdge,
  'enum-extends': InheritanceEdge,
  'type-alias-ref': ReferenceEdge
};
