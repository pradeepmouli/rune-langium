// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import type { TypeGraphNode } from '@rune-langium/visual-editor';
import { resolveFunctionOutputTarget } from '../../src/services/function-output-target.js';

function node(id: string, namespace: string, data: object): TypeGraphNode {
  return { id, data, meta: { namespace } } as TypeGraphNode;
}

describe('resolveFunctionOutputTarget', () => {
  it('resolves a singular same-namespace Data output', () => {
    const nodes = new Map([
      [
        'test.Rename',
        node('test.Rename', 'test', {
          $type: 'RosettaFunction',
          output: { typeCall: { type: { $refText: 'Party' } }, card: { inf: 1, sup: 1 } }
        })
      ],
      ['test.Party', node('test.Party', 'test', { $type: 'Data', name: 'Party' })]
    ]);
    expect(resolveFunctionOutputTarget(nodes, 'test.Rename')).toEqual({ typeFqn: 'test.Party', kind: 'data' });
  });

  it('rejects collection and primitive outputs', () => {
    const nodes = new Map([
      [
        'test.Many',
        node('test.Many', 'test', {
          $type: 'RosettaFunction',
          output: { typeCall: { type: { $refText: 'Party' } }, card: { inf: 0, sup: 2 } }
        })
      ],
      [
        'test.Text',
        node('test.Text', 'test', {
          $type: 'RosettaFunction',
          output: { typeCall: { type: { $refText: 'string' } }, card: { inf: 1, sup: 1 } }
        })
      ],
      ['test.Party', node('test.Party', 'test', { $type: 'Data', name: 'Party' })]
    ]);
    expect(resolveFunctionOutputTarget(nodes, 'test.Many')).toBeUndefined();
    expect(resolveFunctionOutputTarget(nodes, 'test.Text')).toBeUndefined();
  });
});
