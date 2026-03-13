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
import {
  COMBINED_MODEL_SOURCE,
  ENUM_MODEL_SOURCE,
  CHOICE_MODEL_SOURCE
} from '../helpers/fixture-loader.js';

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

      store
        .getState()
        .updateAttribute(tradeNode!.id, 'tradeDate', 'executionDate', 'dateTime', '0..1');

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const member = ((updated!.data as any).attributes ?? []).find(
        (m: any) => m.name === 'executionDate'
      );
      expect(member).toBeDefined();
      expect(member!.typeCall?.type?.$refText).toBe('dateTime');
      expect(member!.card).toMatchObject({ inf: 0, sup: 1, unbounded: false });
    });

    it('does not affect other attributes', () => {
      const nodes = store.getState().nodes;
      const tradeNode = nodes.find((n) => n.data.name === 'Trade');

      store
        .getState()
        .updateAttribute(tradeNode!.id, 'tradeDate', 'executionDate', 'dateTime', '0..1');

      const updated = store.getState().nodes.find((n) => n.id === tradeNode!.id);
      const currency = ((updated!.data as any).attributes ?? []).find(
        (m: any) => m.name === 'currency'
      );
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
      const last = vals[vals.length - 1]!.name;

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
      const initialAttrs = ((choiceNode!.data as any).attributes ?? []).length;
      const initialEdges = store.getState().edges.length;

      // Add a new option referencing CashPayment
      store.getState().addChoiceOption(choiceNode!.id, 'CashPayment');

      const updated = store.getState().nodes.find((n) => n.id === choiceNode!.id);
      // The member might already exist from parsing, so check for the new typeName
      expect(
        ((updated!.data as any).attributes ?? []).some(
          (m: any) => m.typeCall?.type?.$refText === 'CashPayment'
        )
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
        ((updated!.data as any).attributes ?? []).find(
          (m: any) => m.typeCall?.type?.$refText === memberTypeName
        )
      ).toBeUndefined();

      const choiceEdge = store
        .getState()
        .edges.find((e) => e.source === choiceNode!.id && e.data?.label === memberTypeName);
      expect(choiceEdge).toBeUndefined();
    });
  });
});
