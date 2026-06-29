// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * End-to-end editable round-trip tests (Task 8 of B2).
 *
 * Each test:
 *  1. Parses a real Rosetta source snippet.
 *  2. Drives a real inspector store action on the resulting graph.
 *  3. Renders the mutated store via `buildSourceForNamespaces` (passing
 *     both `pendingEditPatches` AND `pendingInversePatches` from the store).
 *  4. Re-parses the rendered output.
 *  5. Asserts the intended change is present AND untouched siblings are intact.
 *
 * Tests are NOT weakened to pass — if a round-trip fails, it surfaces a real gap.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { buildSourceForNamespaces } from '../../src/hooks/useModelSourceSync.js';

/** Extract top-level element names from a re-parsed RosettaModel. */
function elementNames(model: unknown): string[] {
  return ((model as { elements: { name?: string }[] }).elements ?? []).map((e) => e.name ?? '').filter(Boolean);
}

// ---------------------------------------------------------------------------
// (1) add-condition
// ---------------------------------------------------------------------------

const SRC_ADD_CONDITION = `namespace test
version "1.0.0"

type Foo:
  bar string (1..1)

type Sibling:
  x int (0..1)
`;

describe('add-condition round-trip', () => {
  it('adding a condition persists to source and re-parses correctly', async () => {
    const { value } = await parse(SRC_ADD_CONDITION);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const foo = store.getState().nodes.find((n) => n.data.name === 'Foo');
    expect(foo).toBeDefined();

    store.getState().addCondition(foo!.id, { name: 'C1', expressionText: 'bar exists' });

    const sourceMap = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['test', SRC_ADD_CONDITION]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    });
    const out = sourceMap.get('test');
    expect(out).toBeTruthy();

    // Change is present
    expect(out).toContain('condition C1:');
    expect(out).toContain('bar exists');
    // Untouched siblings are byte-intact
    expect(out).toContain('bar string (1..1)');
    expect(out).toContain('type Sibling:');
    expect(out).toContain('x int (0..1)');

    // Re-parse succeeds
    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
    expect(elementNames(re.value)).toContain('Foo');
    expect(elementNames(re.value)).toContain('Sibling');
  });
});

// ---------------------------------------------------------------------------
// (2) edit-condition-expression
// ---------------------------------------------------------------------------

const SRC_EDIT_CONDITION = `namespace test
version "1.0.0"

type Foo:
  bar string (1..1)

  condition C1:
    bar exists

type Sibling:
  x int (0..1)
`;

describe('edit-condition-expression round-trip', () => {
  it('updating a condition expression persists and re-parses correctly', async () => {
    const { value } = await parse(SRC_EDIT_CONDITION);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const foo = store.getState().nodes.find((n) => n.data.name === 'Foo');
    expect(foo).toBeDefined();

    store.getState().updateCondition(foo!.id, 0, { expressionText: 'bar is absent' });

    const sourceMap = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['test', SRC_EDIT_CONDITION]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    });
    const out = sourceMap.get('test');
    expect(out).toBeTruthy();

    // Change is present
    expect(out).toContain('bar is absent');
    // Old expression is gone
    expect(out).not.toContain('bar exists');
    // Untouched content is intact
    expect(out).toContain('bar string (1..1)');
    expect(out).toContain('type Sibling:');
    expect(out).toContain('x int (0..1)');

    // Re-parse succeeds
    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
    expect(elementNames(re.value)).toContain('Foo');
    expect(elementNames(re.value)).toContain('Sibling');
  });
});

// ---------------------------------------------------------------------------
// (3) add-function-input
// ---------------------------------------------------------------------------

const SRC_ADD_INPUT = `namespace test
version "1.0.0"

func MyFunc:
  output:
    result string (1..1)
`;

describe('add-function-input round-trip', () => {
  it('adding a function input param persists and re-parses correctly', async () => {
    const { value } = await parse(SRC_ADD_INPUT);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const func = store.getState().nodes.find((n) => n.data.name === 'MyFunc');
    expect(func).toBeDefined();

    store.getState().addInputParam(func!.id, 'param1', 'string');

    const sourceMap = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['test', SRC_ADD_INPUT]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    });
    const out = sourceMap.get('test');
    expect(out).toBeTruthy();

    // New input is present
    expect(out).toContain('param1');
    // Existing output attribute is still present
    expect(out).toContain('result');

    // Re-parse succeeds and function has inputs
    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
    expect(elementNames(re.value)).toContain('MyFunc');

    const funcEl = (re.value as { elements: { name?: string; inputs?: unknown[] }[] }).elements.find(
      (e) => e.name === 'MyFunc'
    );
    expect(funcEl).toBeDefined();
    expect((funcEl!.inputs ?? []).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// (4) edit-function-body
// ---------------------------------------------------------------------------

const SRC_EDIT_BODY = `namespace test
version "1.0.0"

func MyFunc:
  inputs:
    x string (1..1)
  output:
    result string (1..1)

  set result:
    x
`;

describe('edit-function-body round-trip', () => {
  it('updating the function body expression persists and re-parses correctly', async () => {
    const { value } = await parse(SRC_EDIT_BODY);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const func = store.getState().nodes.find((n) => n.data.name === 'MyFunc');
    expect(func).toBeDefined();

    store.getState().updateExpression(func!.id, 'x count');

    const sourceMap = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['test', SRC_EDIT_BODY]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    });
    const out = sourceMap.get('test');
    expect(out).toBeTruthy();

    // Updated expression is present
    expect(out).toContain('x count');
    // Input attribute (sibling, not the expression) is still present
    expect(out).toContain('x string (1..1)');

    // Re-parse succeeds
    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
    expect(elementNames(re.value)).toContain('MyFunc');
  });
});

// ---------------------------------------------------------------------------
// (5) delete-type
// ---------------------------------------------------------------------------

const SRC_DELETE = `namespace test
version "1.0.0"

type Foo:
  bar string (1..1)

type Bar:
  baz int (0..1)
`;

describe('delete-type round-trip', () => {
  it('deleting a type removes it from source while preserving siblings', async () => {
    const { value } = await parse(SRC_DELETE);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const bar = store.getState().nodes.find((n) => n.data.name === 'Bar');
    expect(bar).toBeDefined();

    store.getState().deleteType(bar!.id);

    const sourceMap = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['test', SRC_DELETE]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    });
    const out = sourceMap.get('test');
    expect(out).toBeTruthy();

    // Sibling preserved
    expect(out).toContain('type Foo:');
    expect(out).toContain('bar string (1..1)');
    // Deleted type is gone
    expect(out).not.toContain('type Bar:');
    expect(out).not.toContain('baz int (0..1)');

    // Re-parse succeeds
    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
    expect(elementNames(re.value)).toContain('Foo');
    expect(elementNames(re.value)).not.toContain('Bar');
  });
});

// ---------------------------------------------------------------------------
// (7) updateExpression — function WITH output but NO pre-existing operation
//
// Bug: the "no operations" branch synthesized { $type:'Operation', operator:'set',
// expression:… } with no `assignRoot`. renderOperation emitted "set :" (empty root)
// which is invalid .rosetta and fails re-parse.
// Fix: seed assignRoot from fd.output.name and use `add: false`.
// ---------------------------------------------------------------------------

const SRC_NO_BODY = `namespace test
version "1.0.0"

func MyFunc:
  inputs:
    x string (1..1)
  output:
    result string (1..1)
`;

describe('updateExpression on function with output but no body', () => {
  it('synthesizes a valid set <output>: operation and re-parses without errors', async () => {
    const { value } = await parse(SRC_NO_BODY);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const func = store.getState().nodes.find((n) => n.data.name === 'MyFunc');
    expect(func).toBeDefined();

    store.getState().updateExpression(func!.id, 'x count');

    const sourceMap = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['test', SRC_NO_BODY]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    });
    const out = sourceMap.get('test');
    expect(out).toBeTruthy();

    // Valid "set result:" head must be present (not "set :")
    expect(out).toContain('set result:');
    expect(out).not.toMatch(/set\s+:/); // must not emit empty-root "set :"
    // Body expression is present
    expect(out).toContain('x count');
    // Existing attributes survive
    expect(out).toContain('x string (1..1)');
    expect(out).toContain('result string (1..1)');

    // Re-parse succeeds with no parse errors
    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
    expect(elementNames(re.value)).toContain('MyFunc');
  });
});

// ---------------------------------------------------------------------------
// (8) delete-last-in-namespace — deleting the only element must persist
//
// Bug: buildSourceForNamespaces drove the render loop from byNs (live nodes
// only). When the last node in a namespace was deleted, byNs had no entry for
// that namespace → renderNamespace was never called → the deleted type
// reappeared on reparse. removalsByNs had the range but was never consumed.
// Fix: iterate over UNION of byNs.keys() and removalsByNs.keys().
// ---------------------------------------------------------------------------

const SRC_SOLE_TYPE = `namespace solo
version "1.0.0"

type OnlyOne:
  x string (1..1)
`;

describe('delete-last-in-namespace round-trip', () => {
  it('persists the deletion when it is the only type in the namespace', async () => {
    const { value } = await parse(SRC_SOLE_TYPE);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const only = store.getState().nodes.find((n) => n.data.name === 'OnlyOne');
    expect(only).toBeDefined();

    store.getState().deleteType(only!.id);

    const sourceMap = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['solo', SRC_SOLE_TYPE]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    });
    const out = sourceMap.get('solo');
    expect(out).toBeTruthy();

    // Deleted type is gone
    expect(out).not.toContain('type OnlyOne:');
    expect(out).not.toContain('x string (1..1)');
    // Namespace header and version must survive
    expect(out).toContain('namespace solo');
    expect(out).toContain('version "1.0.0"');

    // Re-parse succeeds
    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
    expect(elementNames(re.value)).not.toContain('OnlyOne');
  });
});

// ---------------------------------------------------------------------------
// (6) rename-type — guards the occupied-range exclusion logic
//
// renameType does: delete old id + insert new id (same $cstRange).
// The inverse patch carries the old node's $cstRange. The occupied-range
// guard MUST see that the new node still occupies that range and NOT exclude
// it from the output. Without the guard, the renamed type would be silently
// deleted (the deletion logic would see the inverse patch's $cstRange as a
// "removed range" and subtract it from the output).
// ---------------------------------------------------------------------------

const SRC_RENAME = `namespace test
version "1.0.0"

type Foo:
  bar string (1..1)
`;

describe('rename-type round-trip', () => {
  it('renaming a type preserves content and is NOT dropped by the deletion logic', async () => {
    const { value } = await parse(SRC_RENAME);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const foo = store.getState().nodes.find((n) => n.data.name === 'Foo');
    expect(foo).toBeDefined();

    store.getState().renameType(foo!.id, 'FooRenamed');

    const sourceMap = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['test', SRC_RENAME]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    });
    const out = sourceMap.get('test');
    expect(out).toBeTruthy();

    // Renamed type is present under its new name
    expect(out).toContain('FooRenamed');
    // Old name is gone
    expect(out).not.toContain('type Foo:');
    // Content (attribute) is NOT dropped — guards the occupied-range exclusion
    expect(out).toContain('bar string (1..1)');

    // Re-parse succeeds with the new name
    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
    expect(elementNames(re.value)).toContain('FooRenamed');
    expect(elementNames(re.value)).not.toContain('Foo');
  });
});

// ---------------------------------------------------------------------------
// (9) Inline type-call args survive an attribute re-render (PR #350 review #6).
// Renaming an attribute marks it dirty → renderAttribute regenerates it. Its
// inline type-call args (`number(digits: 18, ...)`) must be preserved (they ride
// their CST slice via the renderChild policy), not silently dropped.
// ---------------------------------------------------------------------------

const SRC_TYPECALL_ARGS = `namespace test
version "1.0.0"

type Money:
  amount number(digits: 18, fractionalDigits: 2) (1..1)
`;

describe('inline type-call args round-trip', () => {
  it('preserves an attribute type-call args when the attribute is renamed', async () => {
    const { value } = await parse(SRC_TYPECALL_ARGS);
    const store = createEditorStore();
    store.getState().loadModels(value);

    const money = store.getState().nodes.find((n) => n.data.name === 'Money');
    expect(money).toBeDefined();

    store.getState().renameAttribute(money!.id, 'amount', 'total');

    const out = buildSourceForNamespaces({
      nodes: store.getState().nodes,
      edges: store.getState().edges,
      originalSourceByNamespace: new Map([['test', SRC_TYPECALL_ARGS]]),
      patches: store.getState().pendingEditPatches,
      inversePatches: store.getState().pendingInversePatches
    }).get('test');

    expect(out).toBeTruthy();
    // The rename applied AND the inline type-call args survived.
    expect(out).toContain('total number(digits: 18, fractionalDigits: 2) (1..1)');
    const re = await parse(out!);
    expect(re.hasErrors).toBe(false);
  });
});
