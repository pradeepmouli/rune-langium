// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * BaseFlowNode is the shared chrome shell used by DataNode/ChoiceNode/
 * EnumNode/FunctionNode/GenericNode. Its one piece of real logic — the
 * hydrating-placeholder overlay — depends on data that only exists once a
 * node is actually registered in ReactFlow's internal store (`meta` lives
 * on the node object, not on `NodeProps.data`), so these tests mount a real
 * `<ReactFlow nodes={...}>` instance rather than the bare-provider
 * `renderInFlow` helper used by the individual node-type test files.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { BaseFlowNode } from '../../../src/components/nodes/BaseFlowNode.js';
import { NavigationContext } from '../../../src/components/nodes/NavigationContext.js';
import type { GraphNodeMeta } from '../../../src/types.js';

function TestNode({ id, selected }: NodeProps) {
  return (
    <BaseFlowNode id={id} kind="data" name="Trade" className="rune-node-data" selected={selected}>
      <div className="rune-node-body">body</div>
    </BaseFlowNode>
  );
}

const nodeTypes = { test: TestNode };

function makeNode(id: string, meta: GraphNodeMeta): Node {
  return { id, type: 'test', position: { x: 0, y: 0 }, data: {}, meta } as unknown as Node;
}

function renderWithPending(nodes: Node[], pendingHydrationNamespaces: string[]) {
  return render(
    <ReactFlowProvider>
      <NavigationContext.Provider
        value={{ allNodeIds: new Set(nodes.map((n) => n.id)), layoutDirection: 'TB', pendingHydrationNamespaces }}
      >
        <div style={{ width: 400, height: 400 }}>
          <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} />
        </div>
      </NavigationContext.Provider>
    </ReactFlowProvider>
  );
}

describe('BaseFlowNode — hydrating indicator', () => {
  it('shows the hydrating spinner for a deferred node whose namespace is pending hydration', () => {
    const node = makeNode('n1', { namespace: 'test.ns', errors: [], hasExternalRefs: false, deferred: true });
    renderWithPending([node], ['test.ns']);
    expect(screen.getByTestId('rune-node-hydrating-spinner')).toBeInTheDocument();
  });

  it('does not show the spinner when the node is not deferred', () => {
    const node = makeNode('n1', { namespace: 'test.ns', errors: [], hasExternalRefs: false, deferred: false });
    renderWithPending([node], ['test.ns']);
    expect(screen.queryByTestId('rune-node-hydrating-spinner')).toBeNull();
  });

  it('does not show the spinner when deferred but the namespace is not currently pending', () => {
    const node = makeNode('n1', { namespace: 'test.ns', errors: [], hasExternalRefs: false, deferred: true });
    renderWithPending([node], ['other.ns']);
    expect(screen.queryByTestId('rune-node-hydrating-spinner')).toBeNull();
  });

  it('applies the rune-node-hydrating dim class to the node chrome while hydrating', () => {
    const node = makeNode('n1', { namespace: 'test.ns', errors: [], hasExternalRefs: false, deferred: true });
    const { container } = renderWithPending([node], ['test.ns']);
    expect(container.querySelector('.rune-node-hydrating')).toBeInTheDocument();
  });

  it('omits the dim class once the namespace is no longer pending', () => {
    const node = makeNode('n1', { namespace: 'test.ns', errors: [], hasExternalRefs: false, deferred: true });
    const { container } = renderWithPending([node], []);
    expect(container.querySelector('.rune-node-hydrating')).toBeNull();
  });
});
