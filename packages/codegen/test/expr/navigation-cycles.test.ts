// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { expect, it } from 'vitest';
import { createRuneDslServices, isRosettaFunction, type RosettaModel } from '@rune-langium/core';
import { expressionIsMany, expressionType } from '../../src/expr/navigation.js';

it('continues to a concrete branch after a cyclic alias reference', () => {
  const services = createRuneDslServices();
  const model = services.RuneDsl.serializer.JsonSerializer.deserialize<RosettaModel>(
    JSON.stringify({
      $type: 'RosettaModel',
      name: 'cycles',
      imports: [],
      elements: [
        {
          $type: 'RosettaFunction',
          name: 'Cycle',
          shortcuts: [
            {
              $type: 'ShortcutDeclaration',
              name: 'loop',
              expression: {
                $type: 'DefaultOperation',
                left: {
                  $type: 'RosettaSymbolReference',
                  symbol: { $ref: '#/elements@0/shortcuts@0', $refText: 'loop' }
                },
                right: {
                  $type: 'ListLiteral',
                  elements: [{ $type: 'RosettaSymbolReference', symbol: { $ref: '#/elements@1', $refText: 'Item' } }]
                }
              }
            }
          ]
        },
        { $type: 'Data', name: 'Item', attributes: [] }
      ]
    })
  );
  const func = model.elements[0];
  if (!isRosettaFunction(func)) throw new Error('Expected function');
  const expression = func.shortcuts[0]!.expression;
  expect(expressionIsMany(expression)).toBe(true);
  expect(expressionType(expression)).toBe(model.elements[1]);
  expect(expressionIsMany(expression)).toBe(true);
});
