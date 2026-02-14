/**
 * Duplicate name prevention tests (T074).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { detectDuplicateName } from '../../src/validation/edit-validator.js';

const SOURCE = `
namespace test.dup
version "1.0.0"

type Foo:
  bar string (1..1)

type Bar:
  baz number (0..1)
`;

describe('Duplicate name prevention', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    const result = await parse(SOURCE);
    store = createEditorStore();
    store.getState().loadModels(result.value);
  });

  it('should detect duplicate type names in the same namespace', () => {
    const state = store.getState();

    const result = detectDuplicateName('Foo', 'test.dup', state.nodes);
    expect(result).toBe(true);
  });

  it('should allow unique names', () => {
    const state = store.getState();

    const result = detectDuplicateName('Unique', 'test.dup', state.nodes);
    expect(result).toBe(false);
  });

  it('should allow same name in different namespace', () => {
    const state = store.getState();

    const result = detectDuplicateName('Foo', 'other.ns', state.nodes);
    expect(result).toBe(false);
  });

  it('should detect duplicate attribute names', () => {
    const state = store.getState();
    const fooNode = state.nodes.find((n) => n.data.name === 'Foo');
    expect(fooNode).toBeDefined();

    // 'bar' already exists
    const result = detectDuplicateName('bar', 'test.dup', state.nodes, fooNode!.id);
    expect(result).toBe(true);
  });
});
