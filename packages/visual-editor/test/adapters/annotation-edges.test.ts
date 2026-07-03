// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { createEditorStore } from '../../src/store/editor-store.js';

const ANNOTATION_SOURCE = `namespace test.anno

type Payload:
  value string (0..1)

annotation myAnnotation:
  target Payload (0..1)
`;

describe('annotation edge materialization', () => {
  it('materializes an attribute-ref edge from the annotation to its attribute type', async () => {
    const parseResult = await parse(ANNOTATION_SOURCE);
    expect(parseResult.hasErrors).toBe(false);

    const store = createEditorStore();
    store.getState().loadModels(parseResult.value);
    const { nodesById, edgesById } = store.getState();
    const anno = [...nodesById.values()].find((n) => n.data.$type === 'Annotation');
    const payload = [...nodesById.values()].find((n) => n.data.name === 'Payload');
    expect(anno).toBeDefined();
    expect(payload).toBeDefined();
    const edge = [...edgesById.values()].find(
      (e) => e.source === anno!.id && e.target === payload!.id && e.data?.kind === 'attribute-ref'
    );
    expect(edge).toBeDefined();
    expect(edge!.data!.label).toBe('target'); // member-name label, same convention as Data attributes
  });
});
