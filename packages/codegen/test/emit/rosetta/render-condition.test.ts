// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

describe('renderNode — Condition', () => {
  it('renders a named condition with $cstText body', () => {
    const cond = {
      $type: 'Condition', name: 'NonEmpty', postCondition: false, definition: undefined,
      expression: { $cstText: 'if bar exists then baz exists' },
      annotations: [], references: []
    } as never;
    expect(renderNode(cond, regen)).toBe('condition NonEmpty:\n  if bar exists then baz exists');
  });
  it('renders a post-condition with the post-condition keyword', () => {
    const cond = {
      $type: 'Condition', name: 'Done', postCondition: true, definition: undefined,
      expression: { $cstText: 'result exists' }, annotations: [], references: []
    } as never;
    expect(renderNode(cond, regen)).toBe('post-condition Done:\n  result exists');
  });
  it('renders an anonymous condition + definition', () => {
    const cond = {
      $type: 'Condition', name: undefined, postCondition: false, definition: 'a check',
      expression: { $cstText: 'True' }, annotations: [], references: []
    } as never;
    expect(renderNode(cond, regen)).toBe('condition:\n  <"a check">\n  True');
  });
});
