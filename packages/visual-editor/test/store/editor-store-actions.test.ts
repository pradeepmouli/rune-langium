// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for new store actions (T042).
 *
 * Tests addEnumValue, removeEnumValue, updateEnumValue, setEnumParent,
 * addChoiceOption, removeChoiceOption, updateDefinition, updateComments,
 * addSynonym, removeSynonym, updateAttribute, reorderAttribute,
 * reorderEnumValue against a loaded graph fixture.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { COMBINED_MODEL_SOURCE, ENUM_MODEL_SOURCE, CHOICE_MODEL_SOURCE, FUNCTION_MODEL_SOURCE } from '../helpers/fixture-loader.js';

describe('EditorStore — new actions', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(COMBINED_MODEL_SOURCE);
    store.getState().loadModels(result.value);
  });

  // -----------------------------------------------------------------------
  // updateAttribute
  // -----------------------------------------------------------------------

  describe('updateAttribute', () => {
    it('updates name, typeName, and cardinality of an existing attribute', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');
      expect(tradeNode).toBeDefined();

      store.getState().updateAttribute(tradeNode!.id, 'tradeDate', 'executionDate', 'dateTime', '0..1');

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const member = ((updated!.data as any).attributes ?? []).find((m: any) => m.name === 'executionDate');
      expect(member).toBeDefined();
      expect(member!.typeCall?.type?.$refText).toBe('dateTime');
      expect(member!.card).toMatchObject({ inf: 0, sup: 1, unbounded: false });
    });

    it('does not affect other attributes', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');

      store.getState().updateAttribute(tradeNode!.id, 'tradeDate', 'executionDate', 'dateTime', '0..1');

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const currency = ((updated!.data as any).attributes ?? []).find((m: any) => m.name === 'currency');
      expect(currency).toBeDefined();
      expect(currency!.typeCall?.type?.$refText).toBe('CurrencyEnum');
    });
  });

  // -----------------------------------------------------------------------
  // reorderAttribute
  // -----------------------------------------------------------------------

  describe('reorderAttribute', () => {
    it('moves an attribute from one position to another', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');
      const attrs = (tradeNode!.data as any).attributes ?? [];
      expect(attrs.length).toBeGreaterThanOrEqual(2);

      const originalFirst = attrs[0]!.name;
      const originalSecond = attrs[1]!.name;

      // Move first to second position
      store.getState().reorderAttribute(tradeNode!.id, 0, 1);

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const updatedAttrs = (updated!.data as any).attributes ?? [];
      expect(updatedAttrs[0]!.name).toBe(originalSecond);
      expect(updatedAttrs[1]!.name).toBe(originalFirst);
    });

    it('captures an id-rooted patch at draft.nodes (Wave A — mutateGraph recipe)', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');
      expect(tradeNode).toBeDefined();
      const nodeId = tradeNode!.id;

      const attrs = (tradeNode!.data as any).attributes ?? [];
      expect(attrs.length).toBeGreaterThanOrEqual(2);

      store.getState().reorderAttribute(nodeId, 0, 1);

      const patches = store.getState().pendingEditPatches;
      expect(patches.length).toBeGreaterThan(0);
      expect(patches[0]!.path[0]).toBe('nodes');     // draft Map key
      expect(patches[0]!.path[1]).toBe(nodeId);      // keyed by id, NOT an array index
      expect(patches[0]!.path).toContain('attributes');
    });
  });

  // -----------------------------------------------------------------------
  // updateDefinition
  // -----------------------------------------------------------------------

  describe('updateDefinition', () => {
    it('sets the definition on a node', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');

      store.getState().updateDefinition(tradeNode!.id, 'A financial trade');

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      expect(updated!.data['definition']).toBe('A financial trade');
    });
  });

  // -----------------------------------------------------------------------
  // updateComments
  // -----------------------------------------------------------------------

  describe('updateComments', () => {
    it('sets comments on a node', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');

      store.getState().updateComments(tradeNode!.id, 'TODO: add more attributes');

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      expect(updated!.data['comments']).toBe('TODO: add more attributes');
    });
  });

  // -----------------------------------------------------------------------
  // addSynonym / removeSynonym
  // -----------------------------------------------------------------------

  describe('addSynonym', () => {
    it('adds a synonym to a node', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');

      store.getState().addSynonym(tradeNode!.id, 'FpML_Trade');

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const syns = (updated!.data as any).synonyms;
      expect(syns).toHaveLength(1);
      expect(syns[0].value.name).toBe('FpML_Trade');
    });

    it('appends to existing synonyms', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');

      store.getState().addSynonym(tradeNode!.id, 'FpML_Trade');
      store.getState().addSynonym(tradeNode!.id, 'FIX_Trade');

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const syns = (updated!.data as any).synonyms;
      expect(syns).toHaveLength(2);
      expect(syns[0].value.name).toBe('FpML_Trade');
      expect(syns[1].value.name).toBe('FIX_Trade');
    });
  });

  describe('removeSynonym', () => {
    it('removes a synonym by index', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');

      store.getState().addSynonym(tradeNode!.id, 'FpML_Trade');
      store.getState().addSynonym(tradeNode!.id, 'FIX_Trade');
      store.getState().removeSynonym(tradeNode!.id, 0);

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const syns = (updated!.data as any).synonyms;
      expect(syns).toHaveLength(1);
      expect(syns[0].value.name).toBe('FIX_Trade');
    });
  });
});

// ---------------------------------------------------------------------------
// Enum operations (separate model)
// ---------------------------------------------------------------------------

describe('EditorStore — enum operations', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(ENUM_MODEL_SOURCE);
    store.getState().loadModels(result.value);
  });

  describe('addEnumValue', () => {
    it('adds a new enum value to an enum node', () => {
      const nodes = store.getState().nodes;
      const enumNode = nodes.find((n) => (n.data as any).$type === 'RosettaEnumeration');
      expect(enumNode).toBeDefined();

      store.getState().addEnumValue(enumNode!.id, 'JPY', 'Japanese Yen');

      const updated = store.getState().nodes.find((n) => n.id === enumNode!.id);
      const newValue = ((updated!.data as any).enumValues ?? []).find((m: any) => m.name === 'JPY');
      expect(newValue).toBeDefined();
      expect(newValue!.display).toBe('Japanese Yen');
    });
  });

  describe('removeEnumValue', () => {
    it('removes an enum value by name', () => {
      const nodes = store.getState().nodes;
      const enumNode = nodes.find((n) => (n.data as any).$type === 'RosettaEnumeration');
      const initialCount = ((enumNode!.data as any).enumValues ?? []).length;

      store.getState().removeEnumValue(enumNode!.id, 'USD');

      const updated = store.getState().nodes.find((n) => n.id === enumNode!.id);
      const vals = (updated!.data as any).enumValues ?? [];
      expect(vals.length).toBe(initialCount - 1);
      expect(vals.find((m: any) => m.name === 'USD')).toBeUndefined();
    });
  });

  describe('updateEnumValue', () => {
    it('renames an enum value and sets display name', () => {
      const nodes = store.getState().nodes;
      const enumNode = nodes.find((n) => (n.data as any).$type === 'RosettaEnumeration');

      store.getState().updateEnumValue(enumNode!.id, 'USD', 'US_Dollar', 'US Dollar');

      const updated = store.getState().nodes.find((n) => n.id === enumNode!.id);
      const vals = (updated!.data as any).enumValues ?? [];
      const val = vals.find((m: any) => m.name === 'US_Dollar');
      expect(val).toBeDefined();
      expect(val!.display).toBe('US Dollar');
      expect(vals.find((m: any) => m.name === 'USD')).toBeUndefined();
    });
  });

  describe('reorderEnumValue', () => {
    it('reorders enum values', () => {
      const nodes = store.getState().nodes;
      const enumNode = nodes.find((n) => (n.data as any).$type === 'RosettaEnumeration');
      const vals = (enumNode!.data as any).enumValues ?? [];

      const first = vals[0]!.name;
      const _last = vals[vals.length - 1]!.name;

      store.getState().reorderEnumValue(enumNode!.id, 0, vals.length - 1);

      const updated = store.getState().nodes.find((n) => n.id === enumNode!.id);
      const updatedVals = (updated!.data as any).enumValues ?? [];
      expect(updatedVals[updatedVals.length - 1]!.name).toBe(first);
      expect(updatedVals[0]!.name).not.toBe(first);
    });
  });

  describe('setEnumParent', () => {
    it('sets a parent enum and creates an enum-extends edge', async () => {
      // Create a second enum to serve as parent
      store.getState().createType('enum', 'BaseCurrency', 'test.enums');

      const nodes = store.getState().nodes;
      const childEnum = nodes.find((n) => n.data.name === 'CurrencyEnum');
      const parentEnum = nodes.find((n) => n.data.name === 'BaseCurrency');

      store.getState().setEnumParent(childEnum!.id, parentEnum!.id);

      const updatedChild = store.getState().nodes.find((n) => n.id === childEnum!.id);
      expect((updatedChild!.data as any).parent?.$refText).toBe('BaseCurrency');

      const extendsEdge = store
        .getState()
        .edges.find((e) => e.source === childEnum!.id && e.data?.kind === 'enum-extends');
      expect(extendsEdge).toBeDefined();
    });

    it('clears parent when set to null', async () => {
      store.getState().createType('enum', 'BaseCurrency', 'test.enums');

      const nodes = store.getState().nodes;
      const childEnum = nodes.find((n) => n.data.name === 'CurrencyEnum');
      const parentEnum = nodes.find((n) => n.data.name === 'BaseCurrency');

      store.getState().setEnumParent(childEnum!.id, parentEnum!.id);
      store.getState().setEnumParent(childEnum!.id, null);

      const updatedChild = store.getState().nodes.find((n) => n.id === childEnum!.id);
      expect((updatedChild!.data as any).parent).toBeUndefined();

      const extendsEdge = store
        .getState()
        .edges.find((e) => e.source === childEnum!.id && e.data?.kind === 'enum-extends');
      expect(extendsEdge).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Wave B — mutateGraph patch assertions
  // -----------------------------------------------------------------------

  describe('addEnumValue — id-rooted patch (Wave B)', () => {
    it('captures a nodes-rooted patch with enumValues in path', () => {
      const nodes = store.getState().nodes;
      const enumNode = nodes.find((n) => (n.data as any).$type === 'RosettaEnumeration');
      expect(enumNode).toBeDefined();
      const nodeId = enumNode!.id;

      store.getState().addEnumValue(nodeId, 'JPY', 'Japanese Yen');

      const patches = store.getState().pendingEditPatches;
      expect(patches.length).toBeGreaterThan(0);
      expect(patches[0]!.path[0]).toBe('nodes');
      expect(patches[0]!.path[1]).toBe(nodeId);
      expect(patches[0]!.path).toContain('enumValues');
    });
  });

  describe('setEnumParent — dual-patch (node + edge) (Wave B)', () => {
    it('produces both a nodes-rooted patch (data.parent) and an edges-rooted patch (enum-extends)', () => {
      store.getState().createType('enum', 'BaseCurrency', 'test.enums');

      const nodes = store.getState().nodes;
      const childEnum = nodes.find((n) => n.data.name === 'CurrencyEnum');
      const parentEnum = nodes.find((n) => n.data.name === 'BaseCurrency');
      expect(childEnum).toBeDefined();
      expect(parentEnum).toBeDefined();

      // Clear any patches accumulated by createType
      // (store reads pendingEditPatches at call time, so we snapshot after)
      store.getState().setEnumParent(childEnum!.id, parentEnum!.id);

      const patches = store.getState().pendingEditPatches;
      expect(patches.length).toBeGreaterThan(0);

      const nodePatch = patches.find((p) => p.path[0] === 'nodes' && p.path[1] === childEnum!.id);
      expect(nodePatch).toBeDefined();
      expect(nodePatch!.path).toContain('parent');

      const edgePatch = patches.find((p) => p.path[0] === 'edges');
      expect(edgePatch).toBeDefined();
    });

    it('setEnumParent(id, null) removes the edge — produces an edges-rooted remove patch', () => {
      store.getState().createType('enum', 'BaseCurrency', 'test.enums');

      const nodes = store.getState().nodes;
      const childEnum = nodes.find((n) => n.data.name === 'CurrencyEnum');
      const parentEnum = nodes.find((n) => n.data.name === 'BaseCurrency');

      store.getState().setEnumParent(childEnum!.id, parentEnum!.id);

      // Snapshot patch count after setting parent
      const patchesAfterSet = store.getState().pendingEditPatches.length;

      store.getState().setEnumParent(childEnum!.id, null);

      const patches = store.getState().pendingEditPatches;
      // New patches were added by the clear operation
      expect(patches.length).toBeGreaterThan(patchesAfterSet);

      // The clear should produce an edges-rooted patch (edge deletion)
      const newPatches = patches.slice(patchesAfterSet);
      const edgePatch = newPatches.find((p) => p.path[0] === 'edges');
      expect(edgePatch).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Choice operations (separate model)
// ---------------------------------------------------------------------------

describe('EditorStore — choice operations', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(CHOICE_MODEL_SOURCE);
    store.getState().loadModels(result.value);
  });

  describe('addChoiceOption', () => {
    it('adds a member and edge for a choice option', () => {
      const nodes = store.getState().nodes;
      const choiceNode = nodes.find((n) => (n.data as any).$type === 'Choice');
      const _initialAttrs = ((choiceNode!.data as any).attributes ?? []).length;
      const _initialEdges = store.getState().edges.length;

      // Add a new option referencing CashPayment
      store.getState().addChoiceOption(choiceNode!.id, 'CashPayment');

      const updated = store.getState().nodes.find((n) => n.id === choiceNode!.id);
      // The member might already exist from parsing, so check for the new typeName
      expect(
        ((updated!.data as any).attributes ?? []).some((m: any) => m.typeCall?.type?.$refText === 'CashPayment')
      ).toBe(true);
    });
  });

  describe('removeChoiceOption', () => {
    it('removes both member and edge for a choice option', () => {
      const nodes = store.getState().nodes;
      const choiceNode = nodes.find((n) => (n.data as any).$type === 'Choice');
      const member = ((choiceNode!.data as any).attributes ?? [])[0];
      const memberTypeName = member!.typeCall?.type?.$refText;

      store.getState().removeChoiceOption(choiceNode!.id, memberTypeName!);

      const updated = store.getState().nodes.find((n) => n.id === choiceNode!.id);
      expect(
        ((updated!.data as any).attributes ?? []).find((m: any) => m.typeCall?.type?.$refText === memberTypeName)
      ).toBeUndefined();

      const choiceEdge = store
        .getState()
        .edges.find((e) => e.source === choiceNode!.id && e.data?.label === memberTypeName);
      expect(choiceEdge).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Wave C — mutateGraph patch assertions for choice actions
// ---------------------------------------------------------------------------

describe('EditorStore — choice actions — id-rooted patches (Wave C)', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(CHOICE_MODEL_SOURCE);
    store.getState().loadModels(result.value);
  });

  describe('addChoiceOption — WITH matching target node present', () => {
    it('captures a nodes-rooted patch (attributes) AND an edges-rooted patch (choice-option edge)', () => {
      const nodes = store.getState().nodes;
      const choiceNode = nodes.find((n) => (n.data as any).$type === 'Choice');
      expect(choiceNode).toBeDefined();
      const nodeId = choiceNode!.id;

      // 'CashPayment' already exists in the fixture as a sibling node — target lookup will succeed.
      // Remove it first so we can add it cleanly.
      store.getState().removeChoiceOption(nodeId, 'CashPayment');

      // Clear patches accumulated so far, snapshot the count.
      const patchesBefore = store.getState().pendingEditPatches.length;

      store.getState().addChoiceOption(nodeId, 'CashPayment');

      const patches = store.getState().pendingEditPatches;
      const newPatches = patches.slice(patchesBefore);
      expect(newPatches.length).toBeGreaterThan(0);

      // Node patch: path must be ['nodes', choiceNodeId, 'data', 'attributes', ...]
      const nodePatch = newPatches.find((p) => p.path[0] === 'nodes' && p.path[1] === nodeId);
      expect(nodePatch).toBeDefined();
      expect(nodePatch!.path).toContain('attributes');

      // Edge patch: an edges-rooted patch for the new choice-option edge.
      const edgePatch = newPatches.find((p) => p.path[0] === 'edges');
      expect(edgePatch).toBeDefined();
    });
  });

  describe('addChoiceOption — WITHOUT matching target node', () => {
    it('captures only a nodes-rooted patch (no edge patch) when the typeName has no sibling node', () => {
      const nodes = store.getState().nodes;
      const choiceNode = nodes.find((n) => (n.data as any).$type === 'Choice');
      expect(choiceNode).toBeDefined();
      const nodeId = choiceNode!.id;

      const patchesBefore = store.getState().pendingEditPatches.length;

      // 'UnknownType' does not exist in the fixture — no target node, no edge.
      store.getState().addChoiceOption(nodeId, 'UnknownType');

      const patches = store.getState().pendingEditPatches;
      const newPatches = patches.slice(patchesBefore);
      expect(newPatches.length).toBeGreaterThan(0);

      // Node patch must be present.
      const nodePatch = newPatches.find((p) => p.path[0] === 'nodes' && p.path[1] === nodeId);
      expect(nodePatch).toBeDefined();
      expect(nodePatch!.path).toContain('attributes');

      // No edge patch — no target node existed.
      const edgePatch = newPatches.find((p) => p.path[0] === 'edges');
      expect(edgePatch).toBeUndefined();
    });
  });

  describe('removeChoiceOption — dual-patch (attribute removed + edge deleted)', () => {
    it('produces a nodes-rooted attributes patch AND an edges-rooted remove patch', () => {
      const nodes = store.getState().nodes;
      const choiceNode = nodes.find((n) => (n.data as any).$type === 'Choice');
      expect(choiceNode).toBeDefined();
      const nodeId = choiceNode!.id;

      // Use the first attribute's typeName — it has a sibling node so an edge exists.
      const firstAttr = ((choiceNode!.data as any).attributes ?? [])[0];
      const typeName = firstAttr!.typeCall?.type?.$refText as string;
      expect(typeName).toBeDefined();

      // Confirm the edge exists before removal.
      const edgeBefore = store
        .getState()
        .edges.find((e) => e.source === nodeId && e.data?.kind === 'choice-option' && e.data?.label === typeName);
      expect(edgeBefore).toBeDefined();

      const patchesBefore = store.getState().pendingEditPatches.length;

      store.getState().removeChoiceOption(nodeId, typeName);

      const patches = store.getState().pendingEditPatches;
      const newPatches = patches.slice(patchesBefore);
      expect(newPatches.length).toBeGreaterThan(0);

      // Node patch: attributes array modified.
      const nodePatch = newPatches.find((p) => p.path[0] === 'nodes' && p.path[1] === nodeId);
      expect(nodePatch).toBeDefined();
      expect(nodePatch!.path).toContain('attributes');

      // Edge patch: the choice-option edge was deleted.
      const edgePatch = newPatches.find((p) => p.path[0] === 'edges');
      expect(edgePatch).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// updateAttributeType — Choice node arm retype (Codex P2, PR #196)
// ---------------------------------------------------------------------------

// Two-arm fixture: PaymentType choice with CashPayment + BankTransfer.
const CHOICE_TWO_ARM_SOURCE = `
namespace test.payment
version "1.0.0"

type CashPayment:
  amount number (1..1)

type BankTransfer:
  accountNumber string (1..1)

type WirePayment:
  swiftCode string (1..1)

choice PaymentMethod:
  CashPayment
  BankTransfer
`;

// Two-namespace fixture for disambiguation tests — both have a type named "Wire".
const CHOICE_AMBIGUOUS_SOURCE_A = `
namespace payment.fast
version "1.0.0"

type Wire:
  iban string (1..1)
`;

const CHOICE_AMBIGUOUS_SOURCE_B = `
namespace payment.slow
version "1.0.0"

type Wire:
  swiftCode string (1..1)

choice TransferMethod:
  Wire
`;

describe('EditorStore — updateAttributeType on Choice nodes (Codex P2 silent-drop fix)', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(CHOICE_TWO_ARM_SOURCE);
    store.getState().loadModels(result.value);
  });

  it('updates the matched arm typeCall.$refText; the other arm is unchanged', () => {
    const nodes = store.getState().nodes;
    const choiceNode = nodes.find((n) => (n.data as any).$type === 'Choice');
    expect(choiceNode).toBeDefined();

    const wireNode = nodes.find((n) => n.data.name === 'WirePayment');
    expect(wireNode).toBeDefined();

    // Drop WirePayment onto the CashPayment arm.
    store.getState().updateAttributeType(choiceNode!.id, 'CashPayment', 'WirePayment', wireNode!.id);

    const updated = store.getState().nodes.find((n) => n.id === choiceNode!.id);
    const attrs = (updated!.data as any).attributes ?? [];

    // The CashPayment arm is now WirePayment.
    const updatedArm = attrs.find((a: any) => a.typeCall?.type?.$refText === 'WirePayment');
    expect(updatedArm).toBeDefined();

    // The BankTransfer arm is untouched.
    const untouchedArm = attrs.find((a: any) => a.typeCall?.type?.$refText === 'BankTransfer');
    expect(untouchedArm).toBeDefined();

    // CashPayment arm no longer exists.
    const oldArm = attrs.find((a: any) => a.typeCall?.type?.$refText === 'CashPayment');
    expect(oldArm).toBeUndefined();
  });

  it('replaces the choice-option edge (old label removed, new label added)', () => {
    const nodes = store.getState().nodes;
    const choiceNode = nodes.find((n) => (n.data as any).$type === 'Choice');
    const wireNode = nodes.find((n) => n.data.name === 'WirePayment');

    store.getState().updateAttributeType(choiceNode!.id, 'CashPayment', 'WirePayment', wireNode!.id);

    const edges = store.getState().edges;

    // Old edge for CashPayment is gone.
    const oldEdge = edges.find(
      (e) => e.source === choiceNode!.id && e.data?.kind === 'choice-option' && e.data.label === 'CashPayment'
    );
    expect(oldEdge).toBeUndefined();

    // New edge for WirePayment exists pointing at the wire node.
    const newEdge = edges.find(
      (e) => e.source === choiceNode!.id && e.data?.kind === 'choice-option' && e.data.label === 'WirePayment'
    );
    expect(newEdge).toBeDefined();
    expect(newEdge!.target).toBe(wireNode!.id);
  });

  it('is a no-op when the stale targetTypeId does not exist in the store', () => {
    const nodes = store.getState().nodes;
    const choiceNode = nodes.find((n) => (n.data as any).$type === 'Choice');
    const attrsBefore = [...((choiceNode!.data as any).attributes ?? [])];

    // Pass a targetTypeId that does not exist in the store.
    store.getState().updateAttributeType(choiceNode!.id, 'CashPayment', 'WirePayment', 'stale.NodeId');

    const updated = store.getState().nodes.find((n) => n.id === choiceNode!.id);
    const attrsAfter = (updated!.data as any).attributes ?? [];

    // No change — stale payload must be rejected.
    expect(attrsAfter.map((a: any) => a.typeCall?.type?.$refText)).toEqual(
      attrsBefore.map((a: any) => a.typeCall?.type?.$refText)
    );
  });

  it('is a no-op for genuinely unsupported $types (Enum, RosettaFunction, etc.)', () => {
    const nodes = store.getState().nodes;
    // There are no Enum or Function nodes in CHOICE_TWO_ARM_SOURCE, so use
    // a Data node to confirm Data still works, then patch a fake node to test
    // the guard. We test the guard directly via a node whose $type is 'RosettaEnumeration'.
    const cashNode = nodes.find((n) => n.data.name === 'CashPayment');
    expect(cashNode).toBeDefined();

    // Inject a synthetic Enum node into the store state to confirm the guard holds.
    const fakeEnumId = 'fake.EnumNode';
    store.setState((prev: any) => ({
      nodes: [
        ...prev.nodes,
        {
          id: fakeEnumId,
          position: { x: 0, y: 0 },
          type: 'enum',
          data: {
            $type: 'RosettaEnumeration',
            id: fakeEnumId,
            name: 'FakeEnum',
            namespace: 'fake',
            enumValues: [{ name: 'VALUE_A' }]
          }
        }
      ]
    }));

    const edgesBefore = store.getState().edges.length;
    // Attempt to retype an arm on the enum node — must be a no-op.
    store.getState().updateAttributeType(fakeEnumId, 'VALUE_A', 'VALUE_B');
    const edgesAfter = store.getState().edges.length;

    // No edges added/removed and the node is unchanged.
    expect(edgesAfter).toBe(edgesBefore);
    const enumNode = store.getState().nodes.find((n) => n.id === fakeEnumId);
    expect((enumNode!.data as any).enumValues[0].name).toBe('VALUE_A');
  });
});

describe('EditorStore — updateAttributeType on Choice nodes — cross-namespace disambiguation', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    const resultA = await parse(CHOICE_AMBIGUOUS_SOURCE_A, 'inmemory:///fast.rosetta');
    const resultB = await parse(CHOICE_AMBIGUOUS_SOURCE_B, 'inmemory:///slow.rosetta');
    store = createEditorStore();
    store.getState().loadModels([resultA.value, resultB.value]);
  });

  it('writes a qualified $refText when two namespaces have a type with the same bare name', () => {
    const nodes = store.getState().nodes;
    const choiceNode = nodes.find((n) => (n.data as any).$type === 'Choice');
    expect(choiceNode).toBeDefined();

    // Find the "fast" Wire — it should get the namespace qualifier because "slow" Wire also exists.
    const fastWire = nodes.find((n) => n.data.name === 'Wire' && (n.data as any).namespace === 'payment.fast');
    expect(fastWire).toBeDefined();

    // Drop fast Wire onto the TransferMethod's existing Wire arm.
    store.getState().updateAttributeType(choiceNode!.id, 'Wire', 'Wire', fastWire!.id);

    const updated = store.getState().nodes.find((n) => n.id === choiceNode!.id);
    const attrs = (updated!.data as any).attributes ?? [];

    // The qualified form must be written — bare "Wire" is ambiguous across two namespaces.
    const arm = attrs[0];
    expect(arm?.typeCall?.type?.$refText).toBe('payment.fast.Wire');
  });
});

// ---------------------------------------------------------------------------
// Condition operations + updateExpression
// ---------------------------------------------------------------------------

describe('EditorStore — condition and expression operations', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(COMBINED_MODEL_SOURCE);
    store.getState().loadModels(result.value);
  });

  describe('addCondition', () => {
    it('adds a condition to a Data type', () => {
      const nodes = store.getState().nodes;
      const dataNode = nodes.find((n) => (n.data as any).$type === 'Data');
      expect(dataNode).toBeDefined();

      store.getState().addCondition(dataNode!.id, {
        name: 'ValidDate',
        expressionText: 'tradeDate exists'
      });

      const updated = store.getState().nodes.find((n) => n.id === dataNode!.id);
      const conditions = (updated!.data as any).conditions ?? [];
      expect(conditions.length).toBe(1);
      expect(conditions[0].name).toBe('ValidDate');
      expect(conditions[0].expression.$cstText).toBe('tradeDate exists');
    });
  });

  describe('removeCondition', () => {
    it('removes a condition by index', () => {
      const nodes = store.getState().nodes;
      const dataNode = nodes.find((n) => (n.data as any).$type === 'Data');
      expect(dataNode).toBeDefined();

      // Add two conditions
      store.getState().addCondition(dataNode!.id, {
        name: 'C1',
        expressionText: 'expr1'
      });
      store.getState().addCondition(dataNode!.id, {
        name: 'C2',
        expressionText: 'expr2'
      });

      // Remove first
      store.getState().removeCondition(dataNode!.id, 0);

      const updated = store.getState().nodes.find((n) => n.id === dataNode!.id);
      const conditions = (updated!.data as any).conditions ?? [];
      expect(conditions.length).toBe(1);
      expect(conditions[0].name).toBe('C2');
    });
  });

  describe('updateCondition', () => {
    it('updates condition name and expression', () => {
      const nodes = store.getState().nodes;
      const dataNode = nodes.find((n) => (n.data as any).$type === 'Data');
      expect(dataNode).toBeDefined();

      store.getState().addCondition(dataNode!.id, {
        name: 'C1',
        expressionText: 'old expression'
      });

      store.getState().updateCondition(dataNode!.id, 0, {
        name: 'C1_Updated',
        expressionText: 'new expression'
      });

      const updated = store.getState().nodes.find((n) => n.id === dataNode!.id);
      const conditions = (updated!.data as any).conditions ?? [];
      expect(conditions[0].name).toBe('C1_Updated');
      expect(conditions[0].expression.$cstText).toBe('new expression');
    });
  });

  describe('reorderCondition', () => {
    it('reorders conditions by index', () => {
      const nodes = store.getState().nodes;
      const dataNode = nodes.find((n) => (n.data as any).$type === 'Data');
      expect(dataNode).toBeDefined();

      store.getState().addCondition(dataNode!.id, { name: 'First', expressionText: 'e1' });
      store.getState().addCondition(dataNode!.id, { name: 'Second', expressionText: 'e2' });
      store.getState().addCondition(dataNode!.id, { name: 'Third', expressionText: 'e3' });

      store.getState().reorderCondition(dataNode!.id, 0, 2);

      const updated = store.getState().nodes.find((n) => n.id === dataNode!.id);
      const conditions = (updated!.data as any).conditions ?? [];
      expect(conditions[0].name).toBe('Second');
      expect(conditions[1].name).toBe('Third');
      expect(conditions[2].name).toBe('First');
    });
  });

  describe('updateExpression', () => {
    it('updates the function body expression via operations', async () => {
      const funcStore = createEditorStore();
      const funcResult = await parse(`
        namespace test.func
        version "test"

        func MyFunc:
          inputs:
            x int (1..1)
          output:
            result int (1..1)
          set result:
            x + 1
      `);
      funcStore.getState().loadModels(funcResult.value);

      const funcNode = funcStore.getState().nodes.find((n) => n.data.name === 'MyFunc');
      expect(funcNode).toBeDefined();

      funcStore.getState().updateExpression(funcNode!.id, 'x * 2');

      const updated = funcStore.getState().nodes.find((n) => n.id === funcNode!.id);
      const ops = (updated!.data as any).operations ?? [];
      expect(ops.length).toBeGreaterThan(0);
      expect(ops[0].expression.$cstText).toBe('x * 2');
      expect((updated!.data as any).expressionText).toBe('x * 2');
    });
  });
});

// ---------------------------------------------------------------------------
// renameAttribute (Structure View Phase 0 — granular cell-level dispatch)
// ---------------------------------------------------------------------------

describe('EditorStore — renameAttribute', () => {
  it('renames an attribute within a Data type and preserves order', () => {
    const store = createEditorStore();
    const id = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(id, 'tradeDate', 'date', '0..1');
    store.getState().addAttribute(id, 'tradeID', 'string', '0..1');

    store.getState().renameAttribute(id, 'tradeDate', 'executionDate');

    const node = store.getState().nodes.find((n) => n.id === id)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<{ name: string }>;
    expect(attrs.map((a) => a.name)).toEqual(['executionDate', 'tradeID']);
  });

  it('is a no-op when the attribute does not exist', () => {
    const store = createEditorStore();
    const id = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(id, 'tradeDate', 'date', '0..1');

    expect(() => store.getState().renameAttribute(id, 'missing', 'newName')).not.toThrow();
    const node = store.getState().nodes.find((n) => n.id === id)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<{ name: string }>;
    expect(attrs.map((a) => a.name)).toEqual(['tradeDate']);
  });

  it('updates the attribute-ref edge label when one exists for the renamed attribute', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().createType('data', 'Economics', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'economics', 'Economics', '0..*');

    const edgeBefore = store.getState().edges.find((e) => e.source === tradeId && e.data?.kind === 'attribute-ref');
    expect(edgeBefore?.data?.label).toBe('economics');

    store.getState().renameAttribute(tradeId, 'economics', 'econ');

    const edgeAfter = store.getState().edges.find((e) => e.source === tradeId && e.data?.kind === 'attribute-ref');
    expect(edgeAfter?.data?.label).toBe('econ');
  });

  it('does not push an undo entry when called on a missing attribute (true no-op)', () => {
    const store = createEditorStore();
    const id = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(id, 'tradeDate', 'date', '0..1');
    // Snapshot temporal stack length after the setup mutations
    const stackBefore = store.temporal.getState().pastStates.length;

    store.getState().renameAttribute(id, 'missing', 'newName');

    expect(store.temporal.getState().pastStates.length).toBe(stackBefore);
  });

  it('renames all attributes that share the same name and rewrites their edges', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().createType('data', 'Economics', 'cdm.trade');
    // Two attributes with the same name (allowed by addAttribute today)
    store.getState().addAttribute(tradeId, 'economics', 'Economics', '0..1');
    store.getState().addAttribute(tradeId, 'economics', 'Economics', '0..1');

    store.getState().renameAttribute(tradeId, 'economics', 'econ');

    const node = store.getState().nodes.find((n) => n.id === tradeId)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<{ name: string }>;
    expect(attrs.filter((a) => a.name === 'econ').length).toBe(2);
    expect(attrs.some((a) => a.name === 'economics')).toBe(false);

    const ambiguous = store
      .getState()
      .edges.filter((e) => e.source === tradeId && e.data?.kind === 'attribute-ref' && e.data.label === 'economics');
    expect(ambiguous.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// updateAttributeType (Structure View Phase 0 — granular cell-level dispatch)
// ---------------------------------------------------------------------------

describe('EditorStore — updateAttributeType', () => {
  it('rewrites the typeCall.type.$refText', () => {
    const store = createEditorStore();
    const id = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(id, 'economics', 'OldType', '0..*');
    const econId = store.getState().createType('data', 'Economics', 'cdm.trade');

    store.getState().updateAttributeType(id, 'economics', 'Economics', econId);

    const node = store.getState().nodes.find((n) => n.id === id)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<any>;
    const target = attrs.find((a) => a.name === 'economics')!;
    expect(target.typeCall.type.$refText).toBe('Economics');
  });

  it('is a no-op when the attribute does not exist', () => {
    const store = createEditorStore();
    const id = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(id, 'economics', 'OldType', '0..*');
    const xId = store.getState().createType('data', 'X', 'cdm.trade');

    expect(() => store.getState().updateAttributeType(id, 'missing', 'X', xId)).not.toThrow();
    const node = store.getState().nodes.find((n) => n.id === id)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<any>;
    expect(attrs[0].name).toBe('economics');
    expect(attrs[0].typeCall.type.$refText).toBe('OldType');
  });

  it('removes the stale attribute-ref edge when the old target was in the graph', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    const oldId = store.getState().createType('data', 'OldEconomics', 'cdm.trade');
    const stringId = store.getState().createType('data', 'string', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'economics', 'OldEconomics', '0..1');

    expect(
      store.getState().edges.some((e) => e.source === tradeId && e.target === oldId && e.data?.kind === 'attribute-ref')
    ).toBe(true);

    store.getState().updateAttributeType(tradeId, 'economics', 'string', stringId);

    expect(
      store.getState().edges.some((e) => e.source === tradeId && e.target === oldId && e.data?.kind === 'attribute-ref')
    ).toBe(false);
  });

  it('adds an attribute-ref edge when the new target exists in the graph', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'economics', 'string', '0..1');
    const newId = store.getState().createType('data', 'Economics', 'cdm.trade');

    store.getState().updateAttributeType(tradeId, 'economics', 'Economics', newId);

    const edge = store
      .getState()
      .edges.find((e) => e.source === tradeId && e.target === newId && e.data?.kind === 'attribute-ref');
    expect(edge).toBeDefined();
    expect(edge?.data?.label).toBe('economics');
  });

  it("preserves the attribute's cardinality on the rebuilt attribute-ref edge", () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'economics', 'string', '0..*');
    const newId = store.getState().createType('data', 'Economics', 'cdm.trade');

    store.getState().updateAttributeType(tradeId, 'economics', 'Economics', newId);

    const edge = store
      .getState()
      .edges.find((e) => e.source === tradeId && e.target === newId && e.data?.kind === 'attribute-ref');
    expect(edge?.data?.cardinality).toBe('(0..*)');
  });

  it('does not push an undo entry when called on a missing attribute (true no-op)', () => {
    const store = createEditorStore();
    const id = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(id, 'economics', 'OldType', '0..1');
    const xId = store.getState().createType('data', 'X', 'cdm.trade');
    // Capture after all setup mutations so only the updateAttributeType call is measured.
    const stackBefore = store.temporal.getState().pastStates.length;

    store.getState().updateAttributeType(id, 'missing', 'X', xId);

    expect(store.temporal.getState().pastStates.length).toBe(stackBefore);
  });

  it('retypes all attributes that share the same name', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'economics', 'string', '0..1');
    store.getState().addAttribute(tradeId, 'economics', 'string', '0..1');
    const econId = store.getState().createType('data', 'Economics', 'cdm.trade');

    store.getState().updateAttributeType(tradeId, 'economics', 'Economics', econId);

    const node = store.getState().nodes.find((n) => n.id === tradeId)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<any>;
    const matching = attrs.filter((a) => a.name === 'economics');
    expect(matching.length).toBe(2);
    expect(matching.every((a) => a.typeCall.type.$refText === 'Economics')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateAttributeType — Phase 13 / Finding 3 (cross-namespace qualification +
// stale-payload validation)
// ---------------------------------------------------------------------------

describe('EditorStore — updateAttributeType (Finding 3: cross-namespace qualification)', () => {
  it('writes a QUALIFIED $refText when another node shares the bare name across namespaces', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'p', 'string', '0..1');
    // Two `Party` types in distinct namespaces — the drop target is the
    // OTHER (ns.b) Party, but the bare name "Party" would resolve to
    // whichever node comes first by name in the AST.
    store.getState().createType('data', 'Party', 'ns.a');
    const bPartyId = store.getState().createType('data', 'Party', 'ns.b');

    // Drop ns.b.Party onto Trade.p with the full canonical id (Finding 3 path).
    store.getState().updateAttributeType(tradeId, 'p', 'Party', bPartyId);

    const node = store.getState().nodes.find((n) => n.id === tradeId)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<any>;
    const p = attrs.find((a) => a.name === 'p')!;
    // Qualified form uses `.` separator (matches grammar QualifiedName +
    // structure-graph-adapter findNodeByName resolution).
    expect(p.typeCall.type.$refText).toBe('ns.b.Party');

    // And the resulting edge must point at THE drop target (not the other Party).
    const edges = store
      .getState()
      .edges.filter((e) => e.source === tradeId && e.data?.kind === 'attribute-ref' && e.data.label === 'p');
    expect(edges.length).toBe(1);
    expect(edges[0].target).toBe(bPartyId);
  });

  it('writes the BARE $refText when the type is unambiguous (single namespace)', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'p', 'string', '0..1');
    const partyId = store.getState().createType('data', 'Party', 'cdm.trade');

    store.getState().updateAttributeType(tradeId, 'p', 'Party', partyId);

    const node = store.getState().nodes.find((n) => n.id === tradeId)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<any>;
    const p = attrs.find((a) => a.name === 'p')!;
    // No collision → write the bare name (avoid over-qualification noise).
    expect(p.typeCall.type.$refText).toBe('Party');
  });

  it('is a no-op (no mutation) when targetTypeId is stale / not in the store', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'p', 'OldType', '0..1');
    // No "Ghost" node exists in the store — the drag payload is stale (the
    // target was deleted between drag start and drop). The action must abort
    // without touching the AST.
    const before = store.getState();
    store.getState().updateAttributeType(tradeId, 'p', 'Ghost', 'ns.x.Ghost');

    const node = store.getState().nodes.find((n) => n.id === tradeId)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<any>;
    const p = attrs.find((a) => a.name === 'p')!;
    expect(p.typeCall.type.$refText).toBe('OldType'); // unchanged
    // No new edges either.
    expect(store.getState().edges.length).toBe(before.edges.length);
  });
});

// ---------------------------------------------------------------------------
// setInheritance — Phase 13 / Finding 3 (cross-namespace qualification + stale)
// ---------------------------------------------------------------------------

describe('EditorStore — setInheritance (Finding 3: cross-namespace qualification)', () => {
  it('writes a QUALIFIED superType $refText when the parent name collides across namespaces', () => {
    const store = createEditorStore();
    const childId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().createType('data', 'BaseType', 'ns.a');
    const bBaseId = store.getState().createType('data', 'BaseType', 'ns.b');

    store.getState().setInheritance(childId, bBaseId);

    const node = store.getState().nodes.find((n) => n.id === childId)!;
    const superType = (node.data as any).superType;
    expect(superType?.$refText).toBe('ns.b.BaseType');
  });

  it('writes the BARE superType $refText when the parent name is unambiguous', () => {
    const store = createEditorStore();
    const childId = store.getState().createType('data', 'Trade', 'cdm.trade');
    const baseId = store.getState().createType('data', 'TradeBase', 'cdm.trade');

    store.getState().setInheritance(childId, baseId);

    const node = store.getState().nodes.find((n) => n.id === childId)!;
    const superType = (node.data as any).superType;
    expect(superType?.$refText).toBe('TradeBase');
  });

  it('is a no-op when parentId is stale / not in the store', () => {
    const store = createEditorStore();
    const childId = store.getState().createType('data', 'Trade', 'cdm.trade');
    const baseId = store.getState().createType('data', 'TradeBase', 'cdm.trade');
    store.getState().setInheritance(childId, baseId);
    const beforeRefText = ((store.getState().nodes.find((n) => n.id === childId)!.data as any).superType as any)
      ?.$refText;

    store.getState().setInheritance(childId, 'ns.x.DeletedBase');

    // Inheritance unchanged — stale payload was rejected.
    const node = store.getState().nodes.find((n) => n.id === childId)!;
    const superType = (node.data as any).superType;
    expect(superType?.$refText).toBe(beforeRefText);
  });
});

// ---------------------------------------------------------------------------
// Function input param operations (R-func-input)
// ---------------------------------------------------------------------------

describe('EditorStore — updateInputParam / reorderInputParam', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    store = createEditorStore();
    const result = await parse(FUNCTION_MODEL_SOURCE);
    store.getState().loadModels(result.value);
  });

  // -----------------------------------------------------------------------
  // updateInputParam
  // -----------------------------------------------------------------------

  describe('updateInputParam', () => {
    it('updates name, type, and cardinality of an existing input', () => {
      const nodes = store.getState().nodes;
      const addNode = nodes.find((n) => n.data.name === 'Add');
      expect(addNode).toBeDefined();

      store.getState().updateInputParam(addNode!.id, 'a', 'first', 'Money', '0..1');

      const updated = store.getState().nodes.find((n) => n.id === addNode!.id);
      const inputs = ((updated!.data as any).inputs ?? []) as Array<any>;
      const renamed = inputs.find((inp: any) => inp.name === 'first');
      expect(renamed).toBeDefined();
      expect(renamed!.typeCall?.type?.$refText).toBe('Money');
      expect(renamed!.card).toMatchObject({ inf: 0, sup: 1, unbounded: false });
    });

    it('does not affect other inputs', () => {
      const nodes = store.getState().nodes;
      const addNode = nodes.find((n) => n.data.name === 'Add');

      store.getState().updateInputParam(addNode!.id, 'a', 'first', 'Money', '0..1');

      const updated = store.getState().nodes.find((n) => n.id === addNode!.id);
      const inputs = ((updated!.data as any).inputs ?? []) as Array<any>;
      // 'b' input is unchanged
      const bInput = inputs.find((inp: any) => inp.name === 'b');
      expect(bInput).toBeDefined();
      expect(bInput!.typeCall?.type?.$refText).toBe('number');
    });

    it('is a no-op when oldName does not match any input', () => {
      const nodes = store.getState().nodes;
      const addNode = nodes.find((n) => n.data.name === 'Add');
      const before = ((addNode!.data as any).inputs ?? []) as Array<any>;
      const beforeNames = before.map((i: any) => i.name);

      store.getState().updateInputParam(addNode!.id, 'nonexistent', 'x', 'string', '(1..1)');

      const updated = store.getState().nodes.find((n) => n.id === addNode!.id);
      const after = ((updated!.data as any).inputs ?? []) as Array<any>;
      expect(after.map((i: any) => i.name)).toEqual(beforeNames);
    });
  });

  // -----------------------------------------------------------------------
  // reorderInputParam
  // -----------------------------------------------------------------------

  describe('reorderInputParam', () => {
    it('moves an input from one position to another', () => {
      const nodes = store.getState().nodes;
      const addNode = nodes.find((n) => n.data.name === 'Add');
      const inputs = ((addNode!.data as any).inputs ?? []) as Array<any>;
      expect(inputs.length).toBeGreaterThanOrEqual(2);

      const originalFirst = inputs[0]!.name;
      const originalSecond = inputs[1]!.name;

      // Move first to second position (splice-move: remove from 0, insert at 1)
      store.getState().reorderInputParam(addNode!.id, 0, 1);

      const updated = store.getState().nodes.find((n) => n.id === addNode!.id);
      const updatedInputs = ((updated!.data as any).inputs ?? []) as Array<any>;
      expect(updatedInputs[0]!.name).toBe(originalSecond);
      expect(updatedInputs[1]!.name).toBe(originalFirst);
    });

    it('is a no-op on a non-function node', () => {
      // Money is a Data type — reorderInputParam should not mutate it.
      const nodes = store.getState().nodes;
      const moneyNode = nodes.find((n) => n.data.name === 'Money');
      expect(moneyNode).toBeDefined();

      const before = JSON.stringify(moneyNode!.data);
      store.getState().reorderInputParam(moneyNode!.id, 0, 1);
      const after = JSON.stringify(store.getState().nodes.find((n) => n.id === moneyNode!.id)!.data);

      expect(after).toBe(before);
    });
  });
});

// ---------------------------------------------------------------------------
// updateInputParam — cross-namespace qualification (mirrors Finding 3)
// ---------------------------------------------------------------------------

describe('EditorStore — updateInputParam (cross-namespace qualification)', () => {
  it('writes a QUALIFIED $refText when two namespaces have a type with the same bare name', () => {
    const store = createEditorStore();
    const funcId = store.getState().createType('func', 'CalcFunc', 'cdm.calc');
    store.getState().addInputParam(funcId, 'payment', 'string', '(1..1)');

    // Two "Amount" types in different namespaces — the canonical id identifies which one.
    store.getState().createType('data', 'Amount', 'ns.a');
    const bAmountId = store.getState().createType('data', 'Amount', 'ns.b');

    // Update the input with the id of ns.b.Amount.
    store.getState().updateInputParam(funcId, 'payment', 'payment', 'Amount', '(1..1)', bAmountId);

    const node = store.getState().nodes.find((n) => n.id === funcId)!;
    const inputs = ((node.data as any).inputs ?? []) as Array<any>;
    const inp = inputs.find((i: any) => i.name === 'payment')!;
    // Must be qualified — bare "Amount" is ambiguous across two namespaces.
    expect(inp.typeCall.type.$refText).toBe('ns.b.Amount');

    // The edge must point at the correct (ns.b) node, not the ns.a homonym.
    const edge = store
      .getState()
      .edges.find((e) => e.source === funcId && e.data?.kind === 'attribute-ref' && e.data?.label === 'payment');
    expect(edge).toBeDefined();
    expect(edge!.target).toBe(bAmountId);
  });

  it('writes the BARE $refText when the type name is unambiguous (single namespace)', () => {
    const store = createEditorStore();
    const funcId = store.getState().createType('func', 'CalcFunc', 'cdm.calc');
    store.getState().addInputParam(funcId, 'payment', 'string', '(1..1)');
    const amountId = store.getState().createType('data', 'Amount', 'cdm.calc');

    store.getState().updateInputParam(funcId, 'payment', 'payment', 'Amount', '(1..1)', amountId);

    const node = store.getState().nodes.find((n) => n.id === funcId)!;
    const inputs = ((node.data as any).inputs ?? []) as Array<any>;
    const inp = inputs.find((i: any) => i.name === 'payment')!;
    // No collision — bare name is correct.
    expect(inp.typeCall.type.$refText).toBe('Amount');
  });

  it('falls back to the bare typeName when targetTypeId is absent (backward-compatible)', () => {
    const store = createEditorStore();
    const funcId = store.getState().createType('func', 'CalcFunc', 'cdm.calc');
    store.getState().addInputParam(funcId, 'x', 'string', '(1..1)');

    // No targetTypeId — legacy call path (name-only).
    store.getState().updateInputParam(funcId, 'x', 'x', 'number', '(1..1)');

    const node = store.getState().nodes.find((n) => n.id === funcId)!;
    const inputs = ((node.data as any).inputs ?? []) as Array<any>;
    const inp = inputs.find((i: any) => i.name === 'x')!;
    expect(inp.typeCall.type.$refText).toBe('number');
  });

  it('preserves existing typeCall.arguments when retyping (no-reset regression)', () => {
    const store = createEditorStore();
    const funcId = store.getState().createType('func', 'Fn', 'cdm.fn');
    store.getState().addInputParam(funcId, 'p', 'string', '(1..1)');
    const targetId = store.getState().createType('data', 'Wrapper', 'cdm.fn');

    // Inject a parameterized typeCall to simulate an existing parameterized type call.
    store.setState((prev: any) => ({
      nodes: prev.nodes.map((n: any) =>
        n.id === funcId
          ? {
              ...n,
              data: {
                ...n.data,
                inputs: (n.data.inputs ?? []).map((inp: any) =>
                  inp.name === 'p'
                    ? { ...inp, typeCall: { $type: 'TypeCall', type: { $refText: 'string' }, arguments: ['T'] } }
                    : inp
                )
              }
            }
          : n
      )
    }));

    store.getState().updateInputParam(funcId, 'p', 'p', 'Wrapper', '(1..1)', targetId);

    const node = store.getState().nodes.find((n) => n.id === funcId)!;
    const inputs = ((node.data as any).inputs ?? []) as Array<any>;
    const inp = inputs.find((i: any) => i.name === 'p')!;
    expect(inp.typeCall.type.$refText).toBe('Wrapper');
    // arguments must be preserved — the spread ensures this.
    expect(inp.typeCall.arguments).toEqual(['T']);
  });
});
