// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useEditorStore } from '@rune-langium/visual-editor';
import type { TypeGraphNode } from '@rune-langium/visual-editor';
import { installTypeGraphWindowBridge } from '../../src/services/type-graph-window-bridge.js';

function fakeNode(id: string, $type: string, name: string): TypeGraphNode {
  return {
    id,
    type: 'data',
    position: { x: 0, y: 0 },
    data: { $type, name, attributes: [] } as unknown as TypeGraphNode['data'],
    meta: { namespace: 'a', errors: [], hasExternalRefs: false }
  } as TypeGraphNode;
}

describe('type graph window bridge', () => {
  beforeEach(() => {
    delete (window as unknown as Record<string, unknown>).__runeStudioTypeGraph;
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__runeStudioTypeGraph;
    useEditorStore.setState({ nodesById: new Map() });
  });

  it('installs a read-only window.__runeStudioTypeGraph.snapshot()', () => {
    const nodeA = fakeNode('a.Trade', 'Data', 'Trade');
    const nodeB = fakeNode('a.Party', 'Data', 'Party');
    useEditorStore.setState({
      nodesById: new Map([
        [nodeA.id, nodeA],
        [nodeB.id, nodeB]
      ])
    });

    installTypeGraphWindowBridge();

    expect(window.__runeStudioTypeGraph).toBeDefined();
    const snapshot = window.__runeStudioTypeGraph!.snapshot();
    expect(snapshot).toHaveLength(2);
    expect(snapshot).toEqual(
      expect.arrayContaining([
        { id: 'a.Trade', data: nodeA.data },
        { id: 'a.Party', data: nodeB.data }
      ])
    );
  });

  it('exposes exactly one method — no write surface', () => {
    installTypeGraphWindowBridge();
    expect(Object.keys(window.__runeStudioTypeGraph!)).toEqual(['snapshot']);
  });
});
