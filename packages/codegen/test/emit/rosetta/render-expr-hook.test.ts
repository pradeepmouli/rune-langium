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

describe('exprText unexpected-throw observability', () => {
  it('warns and falls back to CST text on an unexpected (non-Unsupported) throw', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const broken = {
      $type: 'RosettaConditionalExpression',
      if: null,
      ifthen: { $type: 'RosettaBooleanLiteral', value: true },
      full: false,
      $cstText: 'if x then True'
    } as never;
    const sc = { $type: 'ShortcutDeclaration', name: 'a', expression: broken } as never;
    expect(renderNode(sc, regen)).toBe('alias a:\n    if x then True');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('RosettaConditionalExpression');
    warn.mockRestore();
  });

  it('does NOT warn on an unknown $type (designed CST-fallback signal)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unknown = { $type: 'SomethingBrandNew', $cstText: 'whatever raw text' } as never;
    const sc = { $type: 'ShortcutDeclaration', name: 'a', expression: unknown } as never;
    expect(renderNode(sc, regen)).toBe('alias a:\n    whatever raw text');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
