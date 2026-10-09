// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { parseExpression } from '@rune-langium/core';
import { projectPythonExpression } from '../../src/projection/python.js';
import { pythonContext, runPython, linkedExpressions } from './python-test-utils.js';
import { transpileExpression } from '../../src/expr/transpiler.js';
import { RUNTIME_HELPER_JS_SOURCE } from '../../src/helpers.js';
import { pythonHelperDependencies } from '../../src/projection/python-operations.js';

function project(text: string) {
  const parsed = parseExpression(text);
  expect(parsed.hasErrors, text).toBe(false);
  return projectPythonExpression(parsed.value, pythonContext());
}
const semanticCases = [
  ['(1 + 2) * 3', {}, 9],
  ['1 + 2 * 3', {}, 7],
  ['if True then 1 else 1 / 0', {}, 1],
  ['a default 9', { a: 0 }, 0],
  ['a default 9', { a: false }, false],
  ['a default 9', { a: '' }, ''],
  ['a default 9', { a: [] }, 9],
  ['a default 9', {}, 9],
  ['a exists', { a: 0 }, true],
  ['a single exists', { a: [1, 2] }, false],
  ['a multiple exists', { a: [1, 2] }, true],
  ['a = b', { a: { value: 0 }, b: { value: false } }, false],
  ['[1, 2] = [1, 2]', {}, true],
  ['[1, 2] <> [2, 1]', {}, true],
  ['[1, 3] any < 2', {}, true],
  ['[1, 3] all < 2', {}, false],
  ['[1, 2] extract [item + 1]', {}, [2, 3]],
  ['[1, 2] filter [item > 1]', {}, [2]],
  ['[1, 2, 3] reduce x, y [x + y]', {}, 6],
  ['[1, 2] then item count', {}, 2],
  ['[3, 1, 2] sort', {}, [1, 2, 3]],
  ['[3, 1, 2] min', {}, 1],
  ['[3, 1, 2] max', {}, 3],
  ['[1, 1, 2] distinct', {}, [1, 2]],
  ['[1, 2] reverse', {}, [2, 1]],
  ['[1, 2] sum', {}, 3],
  ['[[1, 2], [3]] flatten', {}, [1, 2, 3]],
  ['[1, 2] contains 1', {}, true],
  ['[1, 2] disjoint [3]', {}, true],
  ['a only-element', { a: [1, 2] }, null],
  ['a only-element', { a: [0] }, 0],
  ['a switch 1 then "one", 2 then "two", default "other"', { a: 2 }, 'two'],
  ['"2.5" to-int', {}, null],
  ['"0x10" to-number', {}, 16],
  ['"false" to-string', {}, 'false'],
  ['[1, 2] join ","', {}, '1,2'],
  ['"2026-10-08" to-date', {}, '2026-10-08'],
  ['"12:34:56.123456789" to-time', {}, '12:34:56.123456789'],
  ['"2026-10-08T12:34:56.000" to-date-time', {}, '2026-10-08T12:34:56.000'],
  ['"2026-10-08T12:34:56Z" to-zoned-date-time', {}, '2026-10-08T12:34:56Z'],
  ['"2026-10-08T12:34:56" to-date', {}, null],
  ['"12:34:56Z" to-time', {}, null],
  ['9007199254740992 + 1', {}, 9007199254740992],
  ['9007199254740992 = 9007199254740993', {}, true],
  ['(9007199254740992 + 1) = 9007199254740992', {}, true]
] as const;

describe('forward Python expression projections', () => {
  it('reports namespace methods and callback dependencies without pulling unrelated helpers', () => {
    expect(pythonHelperDependencies('rune.equals(left, right)')).toEqual([
      'rune.equals',
      'rune_list',
      'rune_value_key'
    ]);
    expect(pythonHelperDependencies('rune.exists(value)')).toEqual(['rune.exists', 'rune_exists']);
    expect(pythonHelperDependencies('rune.normalizeObject(value, {"name": rune.identity})')).toEqual([
      'rune.identity',
      'rune.normalizeObject',
      'rune_identity',
      'rune_normalize_object'
    ]);
  });
  it('executes parsed Rune expressions with grouping, laziness and collection semantics', async () => {
    const expressions = await linkedExpressions(semanticCases.map(([text]) => text));
    const output = runPython(
      semanticCases.map(([, data], index) => ({
        expression: projectPythonExpression(expressions[index]!, pythonContext()).code,
        data
      }))
    );
    expect(output).toEqual(semanticCases.map(([, , value]) => ({ value })));
  });
  it('retains literal and converted negative zero and their reciprocal signs', async () => {
    const expressions = await linkedExpressions([
      '-0.0',
      '1 / -0.0',
      '-0.0 to-int',
      '"-0" to-int',
      '1 / ("-0" to-int)'
    ]);
    const python = expressions.map((expression) => projectPythonExpression(expression, pythonContext()).code);
    expect(runPython(python.map((expression) => ({ expression: `math.copysign(1, ${expression})` })))).toEqual([
      { value: -1 },
      { value: -1 },
      { value: -1 },
      { value: -1 },
      { value: -1 }
    ]);
    const values = expressions.map((expression) => {
      const code = transpileExpression(expression, {
        selfName: 'data',
        emitMode: 'ts-expression',
        typeName: 'Fixture',
        conditionName: 'NegativeZero',
        attributeTypes: new Map(),
        diagnostics: []
      });
      return new Function(RUNTIME_HELPER_JS_SOURCE + '\nreturn (' + code + ');')();
    });
    expect(Object.is(values[0], -0)).toBe(true);
    expect(values[1]).toBe(-Infinity);
    expect(Object.is(values[2], -0)).toBe(true);
    expect(Object.is(values[3], -0)).toBe(true);
    expect(values[4]).toBe(-Infinity);
  });

  it('uses native scalar operators where the shared type proof permits them', async () => {
    expect(project('1 + 2').code).toBe('(1.0 + 2.0)');
    expect(project('True <> False').code).toBe('(True != False)');
    expect(project('1 < 2').code).toBe('(1.0 < 2.0)');
    const [equality] = await linkedExpressions(['a = b']);
    const projection = projectPythonExpression(equality!, pythonContext());
    expect(projection.code).toContain('rune.equals(');
    expect(projection.requiredHelpers).toContain('rune.equals');
    expect(projection.requiredHelpers).toContain('rune_value_key');
  });
});
