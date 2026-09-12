// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { expect, it } from 'vitest';
import { computeNamespaceGraph, isCuratedSourceFile } from '../src/index.js';

it.each(['cdm', 'fpml'] as const)('selects only production %s sources', (id) => {
  for (const prefix of ['', 'upstream-main/', './upstream-main/']) {
    expect(isCuratedSourceFile(id, `${prefix}rosetta-source/src/main/rosetta/model.rosetta`)).toBe(true);
  }
  for (const path of [
    'upstream/rosetta-source/src/test/rosetta/model.rosetta',
    'upstream/rosetta-source/src/main/rosetta/._model.rosetta',
    'upstream/rosetta-source/src/main/rosetta/../test.rosetta',
    'upstream/rosetta-source/src/main/rosetta/model.txt'
  ])
    expect(isCuratedSourceFile(id, path)).toBe(false);
});

it('selects Rune runtime models without upstream language tests', () => {
  expect(isCuratedSourceFile('rune-dsl', 'rune/rune-runtime/src/main/resources/model/basictypes.rosetta')).toBe(true);
  expect(isCuratedSourceFile('rune-dsl', 'rune/rune-lang/src/test/resources/test.rosetta')).toBe(false);
});

it('records resolved dependencies across bundle boundaries', () => {
  const graph = computeNamespaceGraph(
    [
      {
        path: 'trade.rosetta',
        exports: [],
        modelJson: JSON.stringify({
          name: 'cdm.trade',
          elements: [
            { type: { $ref: 'file:///%5Bfpml%5D/enums.rosetta#/elements@0' } },
            { type: { $ref: 'file:///%5Bfpml%5D/enums.rosetta#/elements@1' } }
          ]
        })
      }
    ],
    'cdm',
    new Map([['fpml/enums.rosetta', 'fpml.enums']])
  );
  expect(graph['cdm.trade']?.deps).toEqual(['fpml.enums']);
  expect(Object.keys(graph)).toEqual(['cdm.trade']);
});
