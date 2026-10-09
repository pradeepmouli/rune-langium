// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { expect, it } from 'vitest';
import { parse, createRuneDslServices, serializeRuneModel } from '@rune-langium/core';
import { makeNodeId } from '@rune-langium/visual-editor/identifiers';
import { buildExpressionOwnerFiles } from '../../src/shell/expression-owner-files.js';

it.each([false, true])('keeps split dispatch source and owner together, serialized=%s', async (serialized) => {
  const sources = [
    ['variant.rosetta', 'namespace test\nfunc Compute(kind: Kind -> Cash):\n set result: amount + 1'],
    [
      'base.rosetta',
      'namespace test\nfunc Compute:\n inputs: amount int (1..1)\n output: result int (1..1)\n set result: amount'
    ],
    ['other.rosetta', 'namespace other\nfunc Compute:\n output: result int (1..1)\n set result: 9'],
    ['data.rosetta', 'namespace test\ntype Compute:\n amount int (1..1)']
  ] as const;
  const { RuneDsl } = createRuneDslServices();
  const entries = await Promise.all(
    sources.map(async ([filePath, source]) => {
      const { value, parserErrors } = await parse(source);
      expect(parserErrors).toEqual([]);
      const model: typeof value = serialized
        ? JSON.parse(serializeRuneModel(RuneDsl.serializer.JsonSerializer, value))
        : value;
      return { filePath, model };
    })
  );
  const id = makeNodeId('test', 'Compute', 'RosettaFunction');
  for (const models of [entries, [...entries].reverse()]) {
    const owners = buildExpressionOwnerFiles(models);
    expect(owners.get(id)).toEqual({ owner: entries[1]!.model.elements[0], filePath: 'base.rosetta' });
    expect(owners.get(makeNodeId('other', 'Compute', 'RosettaFunction'))?.filePath).toBe('other.rosetta');
    expect(owners.get(makeNodeId('test', 'Compute', 'Data'))?.filePath).toBe('data.rosetta');
  }
  const loneVariant = buildExpressionOwnerFiles([entries[0]!]);
  expect(loneVariant.has(id)).toBe(true);
  expect(loneVariant.get(id)).toBeUndefined();
  expect(
    buildExpressionOwnerFiles([...entries, { ...entries[1]!, filePath: 'duplicate.rosetta' }]).get(id)
  ).toBeUndefined();
});
