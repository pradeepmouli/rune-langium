// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

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

    const hasCurrencyRef = ((tradeNode!.data as any).attributes ?? []).some(
      (m: any) => m.typeCall?.type?.$refText === 'CurrencyEnum'
    );
    expect(hasCurrencyRef).toBe(true);

    // Rename CurrencyEnum → CcyCode
    const enumNode = store.getState().nodes.find((n) => n.data.name === 'CurrencyEnum');
    store.getState().renameType(enumNode!.id, 'CcyCode');

    // Verify cascade: Trade.currency.typeName should now be CcyCode
    const updatedTrade = store.getState().nodes.find((n) => n.data.name === 'Trade');
    const ref = ((updatedTrade!.data as any).attributes ?? []).find(
      (m: any) => m.typeCall?.type?.$refText === 'CcyCode'
    );
    expect(ref).toBeDefined();

    // Old reference should be gone
    const oldRef = ((updatedTrade!.data as any).attributes ?? []).find(
      (m: any) => m.typeCall?.type?.$refText === 'CurrencyEnum'
    );
    expect(oldRef).toBeUndefined();
  });

  it('cascades into parentName references', () => {
    // Trade extends Event in SIMPLE_INHERITANCE_SOURCE
    const eventNode = store.getState().nodes.find((n) => n.data.name === 'Event');
    const tradeNode = store.getState().nodes.find((n) => n.data.name === 'Trade');

    // Verify Trade has superType.$refText = Event
    expect((tradeNode!.data as any).superType?.$refText).toBe('Event');

    store.getState().renameType(eventNode!.id, 'BaseEvent');

    const updatedTrade = store.getState().nodes.find((n) => n.data.name === 'Trade');
    expect((updatedTrade!.data as any).superType?.$refText).toBe('BaseEvent');
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
  // Namespace-qualified ($refText / label) cascade — disambiguated refs
  // -----------------------------------------------------------------------

  it('cascades into namespace-qualified member references (<ns>.<oldName>)', () => {
    const s = createEditorStore();
    // Two `Trade` types in different namespaces → bare `Trade` is ambiguous, so a
    // cross-namespace ref to one of them is stored qualified (`alpha.Trade`).
    s.getState().createType('data', 'Trade', 'alpha');
    s.getState().createType('data', 'Trade', 'beta');
    s.getState().createType('data', 'Holder', 'beta');

    const alphaTradeId = s
      .getState()
      .nodes.find((n) => n.data.name === 'Trade' && n.data.namespace === 'alpha')!.id;
    const holderId = s.getState().nodes.find((n) => n.data.name === 'Holder')!.id;

    // updateAttributeType disambiguates the $refText to the qualified `alpha.Trade`.
    s.getState().addAttribute(holderId, 'ref', 'Trade', '(1..1)');
    s.getState().updateAttributeType(holderId, 'ref', 'Trade', alphaTradeId);

    const qualifiedBefore = (s.getState().nodes.find((n) => n.id === holderId)!.data as any)
      .attributes[0].typeCall.type.$refText;
    expect(qualifiedBefore).toBe('alpha.Trade'); // setup sanity — the ref really is qualified

    s.getState().renameType(alphaTradeId, 'Execution');

    const refAfter = (s.getState().nodes.find((n) => n.data.name === 'Holder')!.data as any)
      .attributes[0].typeCall.type.$refText;
    // The bug: qualified ref was missed and left as `alpha.Trade` (stale).
    expect(refAfter).toBe('alpha.Execution');
  });

  it('cascades into namespace-qualified choice-option edge labels + ids', () => {
    const s = createEditorStore();
    s.getState().createType('data', 'Trade', 'alpha');
    s.getState().createType('data', 'Trade', 'beta');
    s.getState().createType('choice', 'Pick', 'beta');

    const alphaTradeId = s
      .getState()
      .nodes.find((n) => n.data.name === 'Trade' && n.data.namespace === 'alpha')!.id;
    const pickId = s.getState().nodes.find((n) => n.data.name === 'Pick')!.id;

    // Add the option, then disambiguate it to alpha.Trade — updateAttributeType
    // rebuilds the choice-option edge with the qualified `alpha.Trade` label.
    s.getState().addChoiceOption(pickId, 'Trade');
    s.getState().updateAttributeType(pickId, 'Trade', 'Trade', alphaTradeId);

    const labelBefore = s
      .getState()
      .edges.find((e) => e.source === pickId && e.data?.kind === 'choice-option')!.data!.label;
    expect(labelBefore).toBe('alpha.Trade'); // setup sanity — qualified label

    s.getState().renameType(alphaTradeId, 'Execution');

    const newAlphaId = s
      .getState()
      .nodes.find((n) => n.data.name === 'Execution' && n.data.namespace === 'alpha')!.id;
    const optEdge = s
      .getState()
      .edges.find((e) => e.source === pickId && e.data?.kind === 'choice-option');
    expect(optEdge).toBeDefined();
    expect(optEdge!.data!.label).toBe('alpha.Execution'); // label cascaded (was stale `alpha.Trade`)
    expect(optEdge!.target).toBe(newAlphaId); // target re-keyed
    expect(optEdge!.id).toContain('alpha.Execution'); // id rebuilt from the new qualified label

    // The choice ARM's $refText cascades too (not just the edge label).
    const armRef = (s.getState().nodes.find((n) => n.data.name === 'Pick')!.data as any)
      .attributes[0].typeCall.type.$refText;
    expect(armRef).toBe('alpha.Execution');
  });

  it('does NOT relabel attribute-ref edges when an attribute shares the renamed type name', () => {
    const s = createEditorStore();
    // An attribute-ref edge label is the ATTRIBUTE NAME, not a type name. An
    // attribute named the same as the renamed type must not have its edge mangled.
    const tradeId = s.getState().createType('data', 'Trade', 'cdm');
    const otherId = s.getState().createType('data', 'Other', 'cdm');
    const holderId = s.getState().createType('data', 'Holder', 'cdm');

    // Attribute literally named `Trade`, referencing the unrelated `Other` type.
    s.getState().addAttribute(holderId, 'Trade', 'Other', '(1..1)');

    const edgeBefore = s
      .getState()
      .edges.find((e) => e.source === holderId && e.data?.kind === 'attribute-ref');
    expect(edgeBefore?.data?.label).toBe('Trade');
    expect(edgeBefore?.target).toBe(otherId);

    // Rename the TYPE Trade → Execution. The attribute-ref edge must be untouched.
    s.getState().renameType(tradeId, 'Execution');

    const edgeAfter = s
      .getState()
      .edges.find((e) => e.source === holderId && e.data?.kind === 'attribute-ref');
    expect(edgeAfter?.data?.label).toBe('Trade'); // NOT relabeled to 'Execution'
    expect(edgeAfter?.target).toBe(otherId); // still points at Other, id intact
    const attr = (s.getState().nodes.find((n) => n.id === holderId)!.data as any).attributes[0];
    expect(attr.name).toBe('Trade'); // the attribute name is unchanged
  });

  it('is a no-op when the new name collides with an existing type (no node dropped)', () => {
    const s = createEditorStore();
    const tradeId = s.getState().createType('data', 'Trade', 'cdm');
    const execId = s.getState().createType('data', 'Execution', 'cdm');

    // Rename Trade → Execution, but `cdm.Execution` already exists. Re-keying
    // onto the occupied Map id would silently drop the existing Execution node.
    s.getState().renameType(tradeId, 'Execution');

    const nodes = s.getState().nodes;
    expect(nodes.find((n) => n.id === tradeId)?.data.name).toBe('Trade'); // unchanged
    expect(nodes.find((n) => n.id === execId)).toBeDefined(); // existing node intact
    expect(nodes.filter((n) => n.data.name === 'Execution')).toHaveLength(1); // not duplicated/overwritten
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
      .nodes.flatMap((n) =>
        ((n.data as any).attributes ?? []).filter(
          (m: any) => m.typeCall?.type?.$refText === 'RootType'
        )
      );
    expect(staleRefs.length).toBe(0);

    const freshRefs = freshStore
      .getState()
      .nodes.flatMap((n) =>
        ((n.data as any).attributes ?? []).filter(
          (m: any) => m.typeCall?.type?.$refText === 'NewRootType'
        )
      );
    expect(freshRefs.length).toBe(399);
  });
});
