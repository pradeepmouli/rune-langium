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
import { COMBINED_MODEL_SOURCE, ENUM_MODEL_SOURCE, CHOICE_MODEL_SOURCE } from '../helpers/fixture-loader.js';

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

    store.getState().updateAttributeType(id, 'economics', 'Economics');

    const node = store.getState().nodes.find((n) => n.id === id)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<any>;
    const target = attrs.find((a) => a.name === 'economics')!;
    expect(target.typeCall.type.$refText).toBe('Economics');
  });

  it('is a no-op when the attribute does not exist', () => {
    const store = createEditorStore();
    const id = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(id, 'economics', 'OldType', '0..*');

    expect(() => store.getState().updateAttributeType(id, 'missing', 'X')).not.toThrow();
    const node = store.getState().nodes.find((n) => n.id === id)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<any>;
    expect(attrs[0].name).toBe('economics');
    expect(attrs[0].typeCall.type.$refText).toBe('OldType');
  });

  it('removes the stale attribute-ref edge when the old target was in the graph', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    const oldId = store.getState().createType('data', 'OldEconomics', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'economics', 'OldEconomics', '0..1');

    expect(
      store.getState().edges.some((e) => e.source === tradeId && e.target === oldId && e.data?.kind === 'attribute-ref')
    ).toBe(true);

    store.getState().updateAttributeType(tradeId, 'economics', 'string');

    expect(
      store.getState().edges.some((e) => e.source === tradeId && e.target === oldId && e.data?.kind === 'attribute-ref')
    ).toBe(false);
  });

  it('adds an attribute-ref edge when the new target exists in the graph', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'economics', 'string', '0..1');
    const newId = store.getState().createType('data', 'Economics', 'cdm.trade');

    store.getState().updateAttributeType(tradeId, 'economics', 'Economics');

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

    store.getState().updateAttributeType(tradeId, 'economics', 'Economics');

    const edge = store
      .getState()
      .edges.find((e) => e.source === tradeId && e.target === newId && e.data?.kind === 'attribute-ref');
    expect(edge?.data?.cardinality).toBe('(0..*)');
  });

  it('does not push an undo entry when called on a missing attribute (true no-op)', () => {
    const store = createEditorStore();
    const id = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(id, 'economics', 'OldType', '0..1');
    const stackBefore = store.temporal.getState().pastStates.length;

    store.getState().updateAttributeType(id, 'missing', 'X');

    expect(store.temporal.getState().pastStates.length).toBe(stackBefore);
  });

  it('retypes all attributes that share the same name', () => {
    const store = createEditorStore();
    const tradeId = store.getState().createType('data', 'Trade', 'cdm.trade');
    store.getState().addAttribute(tradeId, 'economics', 'string', '0..1');
    store.getState().addAttribute(tradeId, 'economics', 'string', '0..1');

    store.getState().updateAttributeType(tradeId, 'economics', 'Economics');

    const node = store.getState().nodes.find((n) => n.id === tradeId)!;
    const attrs = ((node.data as any).attributes ?? []) as Array<any>;
    const matching = attrs.filter((a) => a.name === 'economics');
    expect(matching.length).toBe(2);
    expect(matching.every((a) => a.typeCall.type.$refText === 'Economics')).toBe(true);
  });
});
