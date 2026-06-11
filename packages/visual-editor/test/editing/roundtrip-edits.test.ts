// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Round-trip tests for visual editing (T060).
 *
 * Flow: parse → load graph → edit → serialize → re-parse → verify
 */

import { describe, it, expect } from 'vitest';
import { parse, serializeModel } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { modelsToAst } from '../../src/adapters/model-to-ast.js';

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
    const models = modelsToAst(store.getState().nodes, store.getState().edges);
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
    const models = modelsToAst(store.getState().nodes, store.getState().edges);
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

    const models = modelsToAst(store.getState().nodes, store.getState().edges);
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

    const models = modelsToAst(store.getState().nodes, store.getState().edges);
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

    const models = modelsToAst(store.getState().nodes, store.getState().edges);
    const text = serializeModel(models[0]);

    expect(text).toContain('type Foo extends SuperBase:');
  });
});

// ---------------------------------------------------------------------------
// Phase 3D-2 conformance: generated-accessor write paths produce valid output
// ---------------------------------------------------------------------------

const ENUM_SOURCE = `
namespace test.enum.conformance
version "1.0.0"

enum Status:
  Active
  Inactive
`;

const FUNCTION_SOURCE = `
namespace test.func.conformance
version "1.0.0"

type Money:
  amount number (1..1)

func Compute:
  inputs:
    a number (1..1)
  output:
    result number (1..1)
  set result:
    a
`;

describe('Phase 3D-2 generated-accessor conformance (T060-3D2)', () => {
  it('addEnumValue (via addRosettaEnumerationEnumValues) round-trips with valid serialization', async () => {
    const result = await parse(ENUM_SOURCE);
    expect(result.value).toBeDefined();

    const store = createEditorStore();
    store.getState().loadModels(result.value);

    const enumNode = store.getState().nodes.find((n) => (n.data as any).name === 'Status');
    expect(enumNode).toBeDefined();

    // Apply the converted action — now backed by addRosettaEnumerationEnumValues
    store.getState().addEnumValue(enumNode!.id, 'Pending');

    const models = modelsToAst(store.getState().nodes, store.getState().edges);
    const text = serializeModel(models[0]);

    // New value must be present in serialized output
    expect(text).toContain('Pending');
    // Original values must be preserved
    expect(text).toContain('Active');
    expect(text).toContain('Inactive');

    // Re-parse: value must round-trip (same check pattern as existing roundtrip-edits tests)
    const reparsed = await parse(text);
    const elements = (reparsed.value as { elements?: unknown[] }).elements ?? [];
    const enumEl = elements.find((e) => (e as { name?: string }).name === 'Status') as
      | { enumValues?: { name: string }[] }
      | undefined;
    expect(enumEl).toBeDefined();
    const valueNames = (enumEl?.enumValues ?? []).map((v) => v.name);
    expect(valueNames).toContain('Pending');
    expect(valueNames).toContain('Active');
    expect(valueNames).toContain('Inactive');
  });

  it('addInputParam (via addRosettaFunctionInputs) writes to graph node data correctly', async () => {
    // Note: serializeModel silently drops RosettaFunction elements (documented limitation).
    // We verify the accessor wrote correctly at the graph-data level via modelsToAst,
    // which exposes the pure domain model carried on node.data.
    const result = await parse(FUNCTION_SOURCE);
    expect(result.value).toBeDefined();

    const store = createEditorStore();
    store.getState().loadModels(result.value);

    const funcNode = store.getState().nodes.find((n) => (n.data as any).name === 'Compute');
    expect(funcNode).toBeDefined();

    // Apply the converted action — now backed by addRosettaFunctionInputs
    store.getState().addInputParam(funcNode!.id, 'b', 'number');

    // Verify the write was applied to the graph node data
    const models = modelsToAst(store.getState().nodes, store.getState().edges);
    const funcModel = models[0].elements.find((e) => (e as { name?: string }).name === 'Compute') as
      | { inputs?: { name: string }[] }
      | undefined;
    expect(funcModel).toBeDefined();
    const inputNames = (funcModel?.inputs ?? []).map((i) => i.name);
    // Both the original and new input must be present (behavior-identity proof)
    expect(inputNames).toContain('a');
    expect(inputNames).toContain('b');
  });
});
