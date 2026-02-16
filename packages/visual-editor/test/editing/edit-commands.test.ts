/**
 * Tests for visual editor edit commands (T059).
 *
 * Verifies create/rename/delete operations on the editor store.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import type { EditorStore } from '../../src/store/editor-store.js';

const SIMPLE_SOURCE = `
namespace test.edit
version "1.0.0"

type Foo:
  bar string (1..1)
`;

describe('Edit Commands', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    const result = await parse(SIMPLE_SOURCE);
    store = createEditorStore();
    store.getState().loadModels(result.value);
  });

  describe('createType', () => {
    it('should add a new data type node', () => {
      const state = store.getState();
      const initialCount = state.nodes.length;

      state.createType('data', 'NewType', 'test.edit');

      const updated = store.getState();
      expect(updated.nodes.length).toBe(initialCount + 1);

      const newNode = updated.nodes.find((n) => n.data.name === 'NewType');
      expect(newNode).toBeDefined();
      expect(newNode!.data.kind).toBe('data');
      expect(newNode!.data.namespace).toBe('test.edit');
    });

    it('should add a new choice type node', () => {
      const state = store.getState();
      state.createType('choice', 'MyChoice', 'test.edit');

      const newNode = store.getState().nodes.find((n) => n.data.name === 'MyChoice');
      expect(newNode).toBeDefined();
      expect(newNode!.data.kind).toBe('choice');
    });

    it('should add a new enum type node', () => {
      const state = store.getState();
      state.createType('enum', 'MyEnum', 'test.edit');

      const newNode = store.getState().nodes.find((n) => n.data.name === 'MyEnum');
      expect(newNode).toBeDefined();
      expect(newNode!.data.kind).toBe('enum');
    });

    it('should return the new node id', () => {
      const state = store.getState();
      const id = state.createType('data', 'ReturnId', 'test.edit');

      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
      const node = store.getState().nodes.find((n) => n.id === id);
      expect(node).toBeDefined();
    });
  });

  describe('deleteType', () => {
    it('should remove a type node', () => {
      const state = store.getState();
      const nodeToDelete = state.nodes[0];
      const initialCount = state.nodes.length;

      state.deleteType(nodeToDelete.id);

      const updated = store.getState();
      expect(updated.nodes.length).toBe(initialCount - 1);
      expect(updated.nodes.find((n) => n.id === nodeToDelete.id)).toBeUndefined();
    });

    it('should remove edges connected to deleted node', () => {
      const state = store.getState();
      // First add a node that references another
      state.createType('data', 'Child', 'test.edit');
      const childNode = store.getState().nodes.find((n) => n.data.name === 'Child');
      expect(childNode).toBeDefined();

      // Add an inheritance edge
      state.setInheritance(childNode!.id, store.getState().nodes[0].id);
      expect(store.getState().edges.length).toBeGreaterThan(0);

      // Delete the child — edges should be cleaned up
      state.deleteType(childNode!.id);
      const remaining = store
        .getState()
        .edges.filter((e) => e.source === childNode!.id || e.target === childNode!.id);
      expect(remaining.length).toBe(0);
    });

    it('should clear selection when deleted node was selected', () => {
      const state = store.getState();
      const nodeId = state.nodes[0].id;
      state.selectNode(nodeId);
      expect(store.getState().selectedNodeId).toBe(nodeId);

      state.deleteType(nodeId);
      expect(store.getState().selectedNodeId).toBeNull();
    });
  });

  describe('renameType', () => {
    it('should update the node name', () => {
      const state = store.getState();
      const nodeId = state.nodes[0].id;
      const oldName = state.nodes[0].data.name;

      state.renameType(nodeId, 'RenamedType');

      const updated = store.getState();
      // After T015, renameType cascades the node ID
      const node = updated.nodes.find((n) => n.data.name === 'RenamedType');
      expect(node).toBeDefined();
      expect(node!.data.name).toBe('RenamedType');
      expect(node!.data.name).not.toBe(oldName);
    });
  });

  describe('addAttribute', () => {
    it('should add an attribute to a data node', () => {
      const state = store.getState();
      const dataNode = state.nodes.find((n) => n.data.kind === 'data');
      expect(dataNode).toBeDefined();

      const initialMembers = dataNode!.data.members.length;

      state.addAttribute(dataNode!.id, 'newAttr', 'string', '1..1');

      const updated = store.getState();
      const updatedNode = updated.nodes.find((n) => n.id === dataNode!.id);
      expect(updatedNode!.data.members.length).toBe(initialMembers + 1);

      const newMember = updatedNode!.data.members.find((m) => m.name === 'newAttr');
      expect(newMember).toBeDefined();
      expect(newMember!.typeName).toBe('string');
      expect(newMember!.cardinality).toBe('(1..1)');
    });
  });

  describe('removeAttribute', () => {
    it('should remove an attribute from a node', () => {
      const state = store.getState();
      const dataNode = state.nodes.find((n) => n.data.kind === 'data');
      expect(dataNode).toBeDefined();
      expect(dataNode!.data.members.length).toBeGreaterThan(0);

      const attrName = dataNode!.data.members[0].name;
      state.removeAttribute(dataNode!.id, attrName);

      const updated = store.getState();
      const updatedNode = updated.nodes.find((n) => n.id === dataNode!.id);
      expect(updatedNode!.data.members.find((m) => m.name === attrName)).toBeUndefined();
    });
  });

  describe('setInheritance', () => {
    it('should add an inheritance edge', () => {
      const state = store.getState();
      // Create a second data type
      state.createType('data', 'Parent', 'test.edit');
      const updated = store.getState();
      const child = updated.nodes.find((n) => n.data.name === 'Foo');
      const parent = updated.nodes.find((n) => n.data.name === 'Parent');

      expect(child).toBeDefined();
      expect(parent).toBeDefined();

      state.setInheritance(child!.id, parent!.id);

      const edges = store.getState().edges;
      const inhEdge = edges.find(
        (e) => e.source === child!.id && e.target === parent!.id && e.data?.kind === 'extends'
      );
      expect(inhEdge).toBeDefined();
    });

    it('should clear inheritance when parentId is null', () => {
      const state = store.getState();
      state.createType('data', 'Parent', 'test.edit');
      const child = store.getState().nodes.find((n) => n.data.name === 'Foo');
      const parent = store.getState().nodes.find((n) => n.data.name === 'Parent');

      state.setInheritance(child!.id, parent!.id);
      expect(
        store.getState().edges.filter((e) => e.data?.kind === 'extends').length
      ).toBeGreaterThan(0);

      state.setInheritance(child!.id, null);
      const inhEdges = store
        .getState()
        .edges.filter((e) => e.source === child!.id && e.data?.kind === 'extends');
      expect(inhEdges.length).toBe(0);
    });
  });

  describe('updateCardinality', () => {
    it('should update the cardinality of an attribute', () => {
      const state = store.getState();
      const dataNode = state.nodes.find((n) => n.data.kind === 'data');
      const attrName = dataNode!.data.members[0].name;

      state.updateCardinality(dataNode!.id, attrName, '0..*');

      const updated = store.getState();
      const updatedNode = updated.nodes.find((n) => n.id === dataNode!.id);
      const member = updatedNode!.data.members.find((m) => m.name === attrName);
      expect(member!.cardinality).toBe('(0..*)');
    });
  });
});
