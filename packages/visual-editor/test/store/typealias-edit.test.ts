// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';

const SRC = `namespace test\nversion "1.0.0"\n\ntypeAlias MyNum: number\n`;

describe('updateTypeAliasType', () => {
  it('writes typeCall.type.$refText and dirties the node', async () => {
    const { value } = await parse(SRC);
    const store = createEditorStore();
    store.getState().loadModels(value);
    const ta = store.getState().nodes.find((n) => n.data.name === 'MyNum')!;
    store.getState().updateTypeAliasType(ta.id, 'int');
    const updated = store.getState().nodesById.get(ta.id)!;
    expect((updated.data as { typeCall: { type: { $refText: string } } }).typeCall.type.$refText).toBe('int');
    expect(store.getState().pendingEditPatches.some((p) => Array.isArray(p.path) && p.path.includes('typeCall'))).toBe(
      true
    );
  });
});
