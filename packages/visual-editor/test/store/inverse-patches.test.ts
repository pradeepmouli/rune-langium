// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';

const SRC = `namespace test\nversion "1.0.0"\n\ntype Foo:\n  bar string (1..1)\n\ntype Bar:\n  baz int (0..1)\n`;

describe('mutateGraph captures inverse patches', () => {
  it('records a remove inverse patch carrying the deleted node on deleteType', async () => {
    const { value } = await parse(SRC);
    const store = createEditorStore();
    store.getState().loadModels(value);
    const foo = store.getState().nodes.find((n) => n.data.name === 'Foo')!;
    store.getState().deleteType(foo.id);
    const inv = store.getState().pendingInversePatches;
    // The inverse of removing nodes/<id> is an add/replace carrying the old node value.
    const removeInverse = inv.find(
      (p) => Array.isArray(p.path) && p.path[0] === 'nodes' && String(p.path[1]) === foo.id
    );
    expect(removeInverse).toBeDefined();
    expect((removeInverse!.value as { data?: { $cstRange?: unknown } }).data?.$cstRange).toBeDefined();
  });
});
