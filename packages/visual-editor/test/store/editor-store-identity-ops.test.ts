// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';
import { SIMPLE_INHERITANCE_SOURCE, ENUM_MODEL_SOURCE, CHOICE_MODEL_SOURCE } from '../helpers/fixture-loader.js';

const attrs = (store: ReturnType<typeof createEditorStore>, id: string) =>
  ((store.getState().nodes.find((n) => n.id === id)!.data as any).attributes ?? []) as Array<{ name?: string; typeCall?: any }>;

describe('editor-store identity mutations (characterization)', () => {
  let store: ReturnType<typeof createEditorStore>;
  beforeEach(() => { store = createEditorStore(); });

  async function loadData(): Promise<string> {
    store.getState().loadModels((await parse(SIMPLE_INHERITANCE_SOURCE)).value);
    return store.getState().nodes.find((n) => n.data.$type === 'Data')!.id;
  }

  it('removeAttribute drains ALL duplicate-named attributes', async () => {
    const id = await loadData();
    store.getState().addAttribute(id, 'dup', 'string', '(1..1)');
    store.getState().addAttribute(id, 'dup', 'string', '(1..1)');
    expect(attrs(store, id).filter((a) => a.name === 'dup')).toHaveLength(2);
    store.getState().removeAttribute(id, 'dup');
    expect(attrs(store, id).filter((a) => a.name === 'dup')).toHaveLength(0);
  });

  it('removeAttribute is a no-op for an absent name', async () => {
    const id = await loadData();
    const before = attrs(store, id).length;
    store.getState().removeAttribute(id, 'does-not-exist');
    expect(attrs(store, id).length).toBe(before);
  });

  it('addAttribute appends (initializing an absent array)', async () => {
    const id = await loadData();
    const before = attrs(store, id).length;
    store.getState().addAttribute(id, 'fresh', 'string', '(1..1)');
    expect(attrs(store, id).map((a) => a.name)).toContain('fresh');
    expect(attrs(store, id).length).toBe(before + 1);
  });

  it('reorderAttribute moves by index', async () => {
    const id = await loadData();
    store.getState().addAttribute(id, 'aa', 'string', '(1..1)');
    store.getState().addAttribute(id, 'bb', 'string', '(1..1)');
    const names = attrs(store, id).map((a) => a.name);
    const ai = names.indexOf('aa'); const bi = names.indexOf('bb');
    store.getState().reorderAttribute(id, bi, ai);
    const after = attrs(store, id).map((a) => a.name);
    expect(after.indexOf('bb')).toBeLessThan(after.indexOf('aa'));
  });

  it('removeEnumValue removes by name', async () => {
    store.getState().loadModels((await parse(ENUM_MODEL_SOURCE)).value);
    const id = store.getState().nodes.find((n) => n.data.$type === 'RosettaEnumeration')!.id;
    store.getState().addEnumValue(id, 'TEMP');
    const vals = () => ((store.getState().nodes.find((n) => n.id === id)!.data as any).enumValues ?? []) as Array<{ name: string }>;
    expect(vals().some((v) => v.name === 'TEMP')).toBe(true);
    store.getState().removeEnumValue(id, 'TEMP');
    expect(vals().some((v) => v.name === 'TEMP')).toBe(false);
  });

  it('removeChoiceOption removes the arm matching typeCall.type.$refText', async () => {
    store.getState().loadModels((await parse(CHOICE_MODEL_SOURCE)).value);
    const id = store.getState().nodes.find((n) => n.data.$type === 'Choice')!.id;
    const arm = attrs(store, id)[0];
    const ref = arm?.typeCall?.type?.$refText;
    expect(ref).toBeTruthy();
    const before = attrs(store, id).length;
    store.getState().removeChoiceOption(id, ref as string);
    expect(attrs(store, id).length).toBe(before - 1);
    expect(attrs(store, id).some((o) => o.typeCall?.type?.$refText === ref)).toBe(false);
  });
});
