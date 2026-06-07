// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { preserveCstText } from '../../src/serializer/preserve-cst-text.js';

describe('preserveCstText', () => {
  it('copies $cstNode.text to $cstText for Function condition parts and their expressions', () => {
    const model: { elements: Array<Record<string, any>> } = {
      elements: [
        {
          $type: 'RosettaFunction',
          conditions: [
            { $cstNode: { text: 'cond src' }, expression: { $cstNode: { text: 'expr src' } } }
          ],
          shortcuts: [{ $cstNode: { text: 'sc' } }],
          operations: [],
          postConditions: []
        }
      ]
    };
    preserveCstText(model);
    expect(model.elements[0].conditions[0].$cstText).toBe('cond src');
    expect(model.elements[0].conditions[0].expression.$cstText).toBe('expr src');
    expect(model.elements[0].shortcuts[0].$cstText).toBe('sc');
  });

  it('copies $cstText for Data/Choice condition arrays', () => {
    const model: { elements: Array<Record<string, any>> } = {
      elements: [
        { $type: 'Data', conditions: [{ $cstNode: { text: 'd cond' }, expression: { $cstNode: { text: 'd expr' } } }] }
      ]
    };
    preserveCstText(model);
    expect(model.elements[0].conditions[0].$cstText).toBe('d cond');
    expect(model.elements[0].conditions[0].expression.$cstText).toBe('d expr');
  });

  it('is a no-op for elements/parts without $cstNode and tolerates missing arrays', () => {
    const model = { elements: [{ $type: 'RosettaFunction' }, { $type: 'Data', conditions: [{}] }] };
    expect(() => preserveCstText(model)).not.toThrow();
    expect((model.elements[1] as { conditions: Array<{ $cstText?: string }> }).conditions[0].$cstText).toBeUndefined();
  });

  it('tolerates a null/undefined model', () => {
    expect(() => preserveCstText(undefined)).not.toThrow();
    expect(() => preserveCstText(null)).not.toThrow();
  });
});
