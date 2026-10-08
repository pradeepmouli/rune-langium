// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PYTHON_RUNTIME_SOURCE } from '../../src/projection/python-runtime.js';
import { RUNTIME_HELPER_JS_SOURCE } from '../../src/helpers.js';

const cases = [
  ['rune_list(None)', 'runeList(null)'],
  ['rune_list(False)', 'runeList(false)'],
  ['rune_list(0)', 'runeList(0)'],
  ['rune_list("")', 'runeList("")'],
  ['rune_single([])', 'runeSingle([])'],
  ['rune_single([1, 2])', 'runeSingle([1, 2])'],
  ['rune_binary([], [2], lambda a, b: a + b)', 'runeBinary([], [2], (a, b) => a + b)'],
  ['rune_binary([1], [2], lambda a, b: a + b)', 'runeBinary([1], [2], (a, b) => a + b)'],
  ['rune_compare([], [2], lambda a, b: a < b)', 'runeCompare([], [2], (a, b) => a < b)'],
  ['rune_compare([1, 3], [2], lambda a, b: a < b, "any")', 'runeCompare([1, 3], [2], (a, b) => a < b, "any")'],
  ['rune_compare([1, 3], [2], lambda a, b: a < b, "all")', 'runeCompare([1, 3], [2], (a, b) => a < b, "all")'],
  ['rune_equals(False, 0)', 'runeValueEquals(false, 0)'],
  ['rune_equals({"a": 1, "missing": None}, {"a": 1})', 'runeValueEquals({a: 1, missing: null}, {a: 1})'],
  ['rune_equals({"value": False}, {"value": 0})', 'runeValueEquals({value: false}, {value: 0})'],
  ['rune_equals([1, 2], [2, 1])', 'runeValueEquals([1, 2], [2, 1])'],
  ['rune_divide(1, 0)', '1 / 0'],
  [
    'rune_to_field({"value": 0, "meta": {"scheme": "x"}}, "field")',
    'runeToField({value: 0, meta: {scheme: "x"}}, "field")'
  ],
  ['rune_to_field({"value": 7}, "value")', 'runeToField({value: 7}, "value")'],
  [
    'rune_to_reference({"externalReference": "id"}, "reference")',
    'runeToReference({externalReference: "id"}, "reference")'
  ],
  ['rune_to_field({"externalReference": "id"}, "reference")', 'runeToField({externalReference: "id"}, "reference")'],
  ['rune_as_key({"meta": {"externalKey": "id"}}, "value")', 'runeAsKey({meta: {externalKey: "id"}}, "value")'],
  ['(1 if True else rune_single([1, 2]))', '(true ? 1 : runeSingle([1, 2]))']
] as const;

describe('Python runtime contracts', () => {
  it('embeds exactly the authoritative Python file and regenerates deterministically', () => {
    expect(PYTHON_RUNTIME_SOURCE).toBe(
      readFileSync(new URL('../../src/projection/python-runtime.py', import.meta.url), 'utf8')
    );
    const result = spawnSync(process.execPath, ['scripts/generate-python-runtime.mjs', '--check'], {
      encoding: 'utf8'
    });
    expect(result.status, result.stderr).toBe(0);
  });
  it('preserves the authoritative TS semantics for scalars, collections, missing values and metadata', () => {
    const expected = cases.map(([, expression]) => {
      try {
        const value = new Function(RUNTIME_HELPER_JS_SOURCE + '\nreturn (' + expression + ');')();
        return { value: JSON.parse(JSON.stringify(value ?? null)) };
      } catch (error) {
        return { error: (error as Error).message };
      }
    });
    const result = spawnSync(
      process.env.PYTHON_BINARY ?? 'python3',
      [new URL('python-runtime-check.py', import.meta.url).pathname],
      {
        input: JSON.stringify({ source: PYTHON_RUNTIME_SOURCE, cases: cases.map(([expression]) => ({ expression })) }),
        encoding: 'utf8'
      }
    );
    expect(result.status, result.error?.message ?? result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(expected);
  });
});
