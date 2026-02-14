/**
 * Circular inheritance prevention tests (T073).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { detectCircularInheritance } from '../../src/validation/edit-validator.js';

const INHERITANCE_SOURCE = `
namespace test.validation
version "1.0.0"

type Base:
  id string (1..1)

type Middle extends Base:
  name string (1..1)

type Leaf extends Middle:
  value number (1..1)
`;

describe('Circular inheritance prevention', () => {
  let store: ReturnType<typeof createEditorStore>;

  beforeEach(async () => {
    const result = await parse(INHERITANCE_SOURCE);
    store = createEditorStore();
    store.getState().loadModels(result.value);
  });

  it('should detect a direct circular inheritance', () => {
    const state = store.getState();
    const base = state.nodes.find((n) => n.data.name === 'Base');
    const leaf = state.nodes.find((n) => n.data.name === 'Leaf');
    expect(base).toBeDefined();
    expect(leaf).toBeDefined();

    // Trying to make Base extend Leaf would create: Base→Leaf→Middle→Base
    const result = detectCircularInheritance(base!.id, leaf!.id, state.edges);
    expect(result).toBe(true);
  });

  it('should detect a self-referencing inheritance', () => {
    const state = store.getState();
    const base = state.nodes.find((n) => n.data.name === 'Base');
    expect(base).toBeDefined();

    const result = detectCircularInheritance(base!.id, base!.id, state.edges);
    expect(result).toBe(true);
  });

  it('should allow valid inheritance', () => {
    const state = store.getState();
    const base = state.nodes.find((n) => n.data.name === 'Base');
    expect(base).toBeDefined();

    // Create a new standalone type
    state.createType('data', 'Standalone', 'test.validation');
    const standalone = store.getState().nodes.find((n) => n.data.name === 'Standalone');

    const result = detectCircularInheritance(standalone!.id, base!.id, store.getState().edges);
    expect(result).toBe(false);
  });

  it('should detect transitive circular inheritance', () => {
    const state = store.getState();
    const base = state.nodes.find((n) => n.data.name === 'Base');
    const middle = state.nodes.find((n) => n.data.name === 'Middle');
    expect(base).toBeDefined();
    expect(middle).toBeDefined();

    // Trying to make Base extend Middle would create: Base→Middle→Base
    const result = detectCircularInheritance(base!.id, middle!.id, state.edges);
    expect(result).toBe(true);
  });
});
