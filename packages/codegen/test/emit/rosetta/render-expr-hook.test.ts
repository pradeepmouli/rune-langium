// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi } from 'vitest';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';
const regen: RenderChild = (c) => renderNode(c, regen) ?? '';
const expr = { $type: 'RosettaBooleanLiteral', value: true } as never;

describe('renderNode renderExpr hook', () => {
  it('routes all 3 body sites through the hook', () => {
    const renderExpr = vi.fn(() => 'HOOKED');
    const cond = { $type: 'Condition', name: 'C', expression: expr, annotations: [], references: [] } as never;
    const op = { $type: 'Operation', add: false, assignRoot: { $refText: 'r' }, expression: expr } as never;
    const sc = { $type: 'ShortcutDeclaration', name: 'a', expression: expr } as never;
    expect(renderNode(cond, regen, { renderExpr })).toContain('HOOKED');
    expect(renderNode(op, regen, { renderExpr })).toContain('HOOKED');
    expect(renderNode(sc, regen, { renderExpr })).toContain('HOOKED');
    expect(renderExpr).toHaveBeenCalledTimes(3);
    expect(renderExpr).toHaveBeenCalledWith(expr);
  });

  it('without opts, structural default is unchanged', () => {
    const sc = { $type: 'ShortcutDeclaration', name: 'a', expression: expr } as never;
    expect(renderNode(sc, regen)).toBe('alias a:\n    True');
  });

  it('hook is NOT called for an absent body', () => {
    const renderExpr = vi.fn(() => 'HOOKED');
    const cond = { $type: 'Condition', name: 'C', expression: undefined, annotations: [], references: [] } as never;
    renderNode(cond, regen, { renderExpr });
    expect(renderExpr).not.toHaveBeenCalled();
  });
});
