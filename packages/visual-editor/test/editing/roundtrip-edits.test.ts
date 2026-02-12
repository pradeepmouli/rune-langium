/**
 * Round-trip tests for visual editing (T060).
 *
 * Flow: parse → load graph → edit → serialize → re-parse → verify
 */

import { describe, it, expect } from 'vitest';
import { parse, serializeModel } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { graphToModels } from '../../src/adapters/graph-to-ast.js';

const ROUNDTRIP_SOURCE = `
namespace test.roundtrip
version "1.0.0"

type Foo:
  bar string (1..1)
  baz number (0..1)

type Bar extends Foo:
  extra string (1..1)
`;

describe('Round-trip edits', () => {
  it('should round-trip a parsed model through graph and back', async () => {
    const result = await parse(ROUNDTRIP_SOURCE);
    expect(result.value).toBeDefined();

    const store = createEditorStore();
    store.getState().loadModels(result.value);

    // Export via graph-to-models helper
    const models = graphToModels(store.getState().nodes, store.getState().edges);
    expect(models.length).toBeGreaterThan(0);

    // Serialize back to text
    const text = serializeModel(models[0]);
    expect(text).toContain('namespace test.roundtrip');
    expect(text).toContain('type Foo');
    expect(text).toContain('bar string');
  });

  it('should round-trip an edit (add type) through serialize → re-parse', async () => {
    const result = await parse(ROUNDTRIP_SOURCE);
    const store = createEditorStore();
    store.getState().loadModels(result.value);

    // Create a new type
    store.getState().createType('data', 'NewThing', 'test.roundtrip');

    // Export graph to synthetic models
    const models = graphToModels(store.getState().nodes, store.getState().edges);
    const text = serializeModel(models[0]);

    // Re-parse
    const reparsed = await parse(text);
    const elements = (reparsed.value as { elements?: unknown[] }).elements ?? [];
    const names = elements.map((e) => (e as { name?: string }).name);
    expect(names).toContain('Foo');
    expect(names).toContain('Bar');
    expect(names).toContain('NewThing');
  });

  it('should round-trip an edit (delete type) through serialize → re-parse', async () => {
    const result = await parse(ROUNDTRIP_SOURCE);
    const store = createEditorStore();
    store.getState().loadModels(result.value);

    // Find and delete Bar
    const barNode = store.getState().nodes.find((n) => n.data.name === 'Bar');
    expect(barNode).toBeDefined();
    store.getState().deleteType(barNode!.id);

    const models = graphToModels(store.getState().nodes, store.getState().edges);
    const text = serializeModel(models[0]);

    const reparsed = await parse(text);
    const elements = (reparsed.value as { elements?: unknown[] }).elements ?? [];
    const names = elements.map((e) => (e as { name?: string }).name);
    expect(names).toContain('Foo');
    expect(names).not.toContain('Bar');
  });

  it('should round-trip an attribute addition', async () => {
    const result = await parse(ROUNDTRIP_SOURCE);
    const store = createEditorStore();
    store.getState().loadModels(result.value);

    const fooNode = store.getState().nodes.find((n) => n.data.name === 'Foo');
    expect(fooNode).toBeDefined();

    store.getState().addAttribute(fooNode!.id, 'newField', 'date', '1..1');

    const models = graphToModels(store.getState().nodes, store.getState().edges);
    const text = serializeModel(models[0]);

    expect(text).toContain('newField date');
    expect(text).toContain('(1..1)');
  });

  it('should round-trip an inheritance change', async () => {
    const result = await parse(ROUNDTRIP_SOURCE);
    const store = createEditorStore();
    store.getState().loadModels(result.value);

    // Create a new parent
    store.getState().createType('data', 'SuperBase', 'test.roundtrip');

    const fooNode = store.getState().nodes.find((n) => n.data.name === 'Foo');
    const superNode = store.getState().nodes.find((n) => n.data.name === 'SuperBase');
    expect(fooNode).toBeDefined();
    expect(superNode).toBeDefined();

    store.getState().setInheritance(fooNode!.id, superNode!.id);

    const models = graphToModels(store.getState().nodes, store.getState().edges);
    const text = serializeModel(models[0]);

    expect(text).toContain('type Foo extends SuperBase:');
  });
});
