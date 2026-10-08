// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import {
  parse,
  isRosettaFunction,
  getFunctionImplementationRegion,
  getExpressionRegions,
  serializeRuneModel,
  createRuneDslServices
} from '../../src/index.js';

const header = `namespace test.regions
version "test"
func Calculate:
  inputs:
    x int (1..1)
  output:
    answer int (1..1)
`;
const implementation = `
  // 😀 preserve this comment
  alias increment: x + 1
  condition Positive: x > 0
  set answer: increment
  post-condition Valid: answer > 0`;
const neighbor = '\n\nfunc Neighbor:\n  output:\n    result int (1..1)\n  set result: 7\n';

describe('source regions', () => {
  it('does not skip a body placed on the same line as its signature', async () => {
    const source =
      'namespace test.regions\nversion "test"\nfunc Compact: output: result int (1..1) set result: 1' + neighbor;
    const parsed = await parse(source);
    expect(parsed.parserErrors).toEqual([]);
    const func = parsed.value.elements.find(isRosettaFunction)!;
    const region = getFunctionImplementationRegion(func, source);
    expect(source.slice(region.from, region.to)).toBe('set result: 1');
  });
  it.each(['\n', '\r\n'])(
    'retains comments and grammar-ordered implementation at original UTF-16 offsets with %j',
    async (newline) => {
      const source = (header + implementation + neighbor).replaceAll('\n', newline);
      const parsed = await parse(source);
      expect(parsed.parserErrors).toEqual([]);
      const func = parsed.value.elements.find(isRosettaFunction)!;
      const region = getFunctionImplementationRegion(func, source);
      expect(source.slice(region.from, region.to)).toBe(implementation.replaceAll('\n', newline));
      const expressions = getExpressionRegions(func);
      expect(expressions.map((e) => e.kind)).toEqual(['alias', 'precondition', 'operation', 'postcondition']);
      expect(expressions.map((e) => source.slice(e.region.from, e.region.to))).toEqual([
        'x + 1',
        'x > 0',
        'increment',
        'answer > 0'
      ]);
      const services = createRuneDslServices();
      const serialized = JSON.parse(serializeRuneModel(services.RuneDsl.serializer.JsonSerializer, parsed.value));
      expect(getFunctionImplementationRegion(serialized.elements[0], source)).toEqual(region);
    }
  );

  it.each(['', '  [native]\n', '  inputs:\n    x int (1..1)\n'])(
    'provides a zero-length insertion for an empty body %j',
    async (tail) => {
      const source = `namespace test.regions\nversion "test"\nfunc Empty:\n${tail}`;
      const parsed = await parse(source);
      expect(parsed.parserErrors).toEqual([]);
      const func = parsed.value.elements.find(isRosettaFunction)!;
      const region = getFunctionImplementationRegion(func, source);
      expect(region).toEqual({ from: func.$cstNode!.end, to: func.$cstNode!.end });
    }
  );

  it('keeps a no-output body outside its header and neighboring declaration', async () => {
    const source = 'namespace test.regions\nversion "test"\nfunc Base:\n  alias value: 1' + neighbor;
    const { value } = await parse(source);
    const func = value.elements.find(isRosettaFunction)!;
    const range = getFunctionImplementationRegion(func, source);
    expect(source.slice(range.from, range.to)).toBe('  alias value: 1');
  });

  it('includes multiline comments after an inherited signature', async () => {
    const body = '\n  /* retain\n     every line\n  */\n  set result: 1';
    const source =
      'namespace test.regions\nversion "test"\nfunc Parent:\n  output:\n    result int (1..1)\n\nfunc Derived extends Parent:\n' +
      body +
      neighbor;
    const parsed = await parse(source);
    expect(parsed.parserErrors).toEqual([]);
    const func = parsed.value.elements.filter(isRosettaFunction).find((f) => f.name === 'Derived')!;
    const region = getFunctionImplementationRegion(func, source);
    expect(source.slice(region.from, region.to)).toBe(body);
    const services = createRuneDslServices();
    const serialized = JSON.parse(serializeRuneModel(services.RuneDsl.serializer.JsonSerializer, parsed.value));
    expect(
      getFunctionImplementationRegion(
        serialized.elements.find((f: { name: string }) => f.name === 'Derived'),
        source
      )
    ).toEqual(region);
  });
});
