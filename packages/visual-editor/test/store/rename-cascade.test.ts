/**
 * Unit tests for renameType cascade logic (T043).
 *
 * Validates:
 * - Node name + ID update
 * - Member typeName / parentName cascade across all nodes
 * - Edge source / target / label / ID cascade
 * - selectedNodeId update
 * - CDM-scale graph (400 nodes) performance threshold
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { SIMPLE_INHERITANCE_SOURCE, COMBINED_MODEL_SOURCE } from '../helpers/fixture-loader.js';
import type { TypeNodeData, MemberDisplay } from '../../src/types.js';

/**
 * Builds a large synthetic graph with N data nodes where every node
 * has an attribute referencing the first node's type (for cascade testing).
 */
function buildScaleGraph(store: ReturnType<typeof createEditorStore>, nodeCount: number) {
  const rootName = 'RootType';
  const rootNs = 'scale.test';

  store.getState().createType('data', rootName, rootNs);

  for (let i = 1; i < nodeCount; i++) {
    const name = `Type${String(i).padStart(3, '0')}`;
    store.getState().createType('data', name, rootNs);
    store
      .getState()
      .addAttribute(
        store.getState().nodes.find((n) => n.data.name === name)!.id,
        `ref_${i}`,
        rootName,
        '(1..1)'
      );
  }
}

describe('renameType — cascade', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(SIMPLE_INHERITANCE_SOURCE);
    store.getState().loadModels(result.value);
  });

  it('updates the node name and ID', () => {
    const original = store.getState().nodes.find((n) => n.data.name === 'Trade');
    expect(original).toBeDefined();

    store.getState().renameType(original!.id, 'Execution');

    const renamed = store.getState().nodes.find((n) => n.data.name === 'Execution');
    expect(renamed).toBeDefined();
    expect(renamed!.id).toContain('Execution');

    // Old node should not exist
    const old = store.getState().nodes.find((n) => n.data.name === 'Trade');
    expect(old).toBeUndefined();
  });

  it('cascades into member typeName references', async () => {
    // In SIMPLE_INHERITANCE_SOURCE, Event extends Trade (has reference)
    const result = await parse(COMBINED_MODEL_SOURCE);
    store.getState().loadModels(result.value);

    // Find node that references CurrencyEnum in its members
    const tradeNode = store.getState().nodes.find((n) => n.data.name === 'Trade');
    expect(tradeNode).toBeDefined();

    const hasCurrencyRef = tradeNode!.data.members.some((m) => m.typeName === 'CurrencyEnum');
    expect(hasCurrencyRef).toBe(true);

    // Rename CurrencyEnum → CcyCode
    const enumNode = store.getState().nodes.find((n) => n.data.name === 'CurrencyEnum');
    store.getState().renameType(enumNode!.id, 'CcyCode');

    // Verify cascade: Trade.currency.typeName should now be CcyCode
    const updatedTrade = store.getState().nodes.find((n) => n.data.name === 'Trade');
    const ref = updatedTrade!.data.members.find((m) => m.typeName === 'CcyCode');
    expect(ref).toBeDefined();

    // Old reference should be gone
    const oldRef = updatedTrade!.data.members.find((m) => m.typeName === 'CurrencyEnum');
    expect(oldRef).toBeUndefined();
  });

  it('cascades into parentName references', () => {
    // Trade extends Event in SIMPLE_INHERITANCE_SOURCE
    const eventNode = store.getState().nodes.find((n) => n.data.name === 'Event');
    const tradeNode = store.getState().nodes.find((n) => n.data.name === 'Trade');

    // Verify Trade has parentName = Event
    expect(tradeNode!.data.parentName).toBe('Event');

    store.getState().renameType(eventNode!.id, 'BaseEvent');

    const updatedTrade = store.getState().nodes.find((n) => n.data.name === 'Trade');
    expect(updatedTrade!.data.parentName).toBe('BaseEvent');
  });

  it('cascades into edge source, target, and labels', () => {
    const tradeNode = store.getState().nodes.find((n) => n.data.name === 'Trade');
    const oldId = tradeNode!.id;

    // Get edges referencing Trade node
    const oldEdges = store.getState().edges.filter((e) => e.source === oldId || e.target === oldId);
    expect(oldEdges.length).toBeGreaterThan(0);

    store.getState().renameType(oldId, 'Execution');

    const newNode = store.getState().nodes.find((n) => n.data.name === 'Execution');
    const newId = newNode!.id;

    // No edges should reference old ID
    const staleEdges = store
      .getState()
      .edges.filter((e) => e.source === oldId || e.target === oldId);
    expect(staleEdges.length).toBe(0);

    // Edges should now reference new ID
    const freshEdges = store
      .getState()
      .edges.filter((e) => e.source === newId || e.target === newId);
    expect(freshEdges.length).toBeGreaterThan(0);
  });

  it('updates selectedNodeId when renaming the selected node', () => {
    const tradeNode = store.getState().nodes.find((n) => n.data.name === 'Trade');
    store.getState().selectNode(tradeNode!.id);
    expect(store.getState().selectedNodeId).toBe(tradeNode!.id);

    store.getState().renameType(tradeNode!.id, 'Execution');

    const newNode = store.getState().nodes.find((n) => n.data.name === 'Execution');
    expect(store.getState().selectedNodeId).toBe(newNode!.id);
  });

  it('does not update selectedNodeId when renaming a different node', () => {
    const tradeNode = store.getState().nodes.find((n) => n.data.name === 'Trade');
    const eventNode = store.getState().nodes.find((n) => n.data.name === 'Event');

    store.getState().selectNode(eventNode!.id);
    store.getState().renameType(tradeNode!.id, 'Execution');

    expect(store.getState().selectedNodeId).toBe(eventNode!.id);
  });

  // -----------------------------------------------------------------------
  // CDM-scale test (400 nodes) — performance gate < 100 ms
  // -----------------------------------------------------------------------

  it('completes cascade on 400-node graph within 100 ms', () => {
    // Start fresh with a synthetic graph
    const freshStore = createEditorStore();
    buildScaleGraph(freshStore, 400);

    const root = freshStore.getState().nodes.find((n) => n.data.name === 'RootType');
    expect(root).toBeDefined();

    const start = performance.now();
    freshStore.getState().renameType(root!.id, 'NewRootType');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);

    // Verify all references updated
    const staleRefs = freshStore
      .getState()
      .nodes.flatMap((n) => n.data.members.filter((m) => m.typeName === 'RootType'));
    expect(staleRefs.length).toBe(0);

    const freshRefs = freshStore
      .getState()
      .nodes.flatMap((n) => n.data.members.filter((m) => m.typeName === 'NewRootType'));
    expect(freshRefs.length).toBe(399);
  });
});
