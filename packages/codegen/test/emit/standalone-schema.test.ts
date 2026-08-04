// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { buildNamespaceIndexes } from '../../src/preview-schema.js';
import { buildGlobalTypeIndex, findTargetNode, computeStandaloneClosure } from '../../src/emit/standalone-schema.js';

const skipIfNodeLt22 = it.skipIf(Number(process.versions.node.split('.')[0]) < 22);

async function parseModels(sources: readonly string[]) {
  const { RuneDsl } = createRuneDslServices();
  const docs = sources.map((source, i) =>
    RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      source,
      URI.parse(`inmemory:///standalone-schema-${i}.rosetta`)
    )
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build(docs);
  for (const doc of docs) {
    expect(doc.parseResult.parserErrors.map((error) => error.message)).toEqual([]);
  }
  return docs;
}

describe('buildGlobalTypeIndex', () => {
  skipIfNodeLt22('merges per-namespace indexes into one flat lookup, findable by bare name', async () => {
    const docs = await parseModels([
      `
      namespace "test.alpha"
      version "1"

      type Foo:
        x string (0..1)
      `,
      `
      namespace "test.beta"
      version "1"

      type Bar:
        y string (0..1)
      `
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    expect(globalIndex.dataByName.has('Foo')).toBe(true);
    expect(globalIndex.dataByName.has('Bar')).toBe(true);
  });
});

describe('findTargetNode', () => {
  skipIfNodeLt22('resolves a namespace-qualified targetId to its real AST node', async () => {
    const docs = await parseModels([
      `
      namespace "test.alpha"
      version "1"

      type Foo:
        x string (0..1)
      `
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.alpha.Foo');
    expect(target?.kind).toBe('data');
    expect(target?.node.name).toBe('Foo');
  });

  skipIfNodeLt22('returns undefined for an unknown targetId', async () => {
    const docs = await parseModels([
      `
      namespace "test.alpha"
      version "1"

      type Foo:
        x string (0..1)
      `
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    expect(findTargetNode(namespaceIndexes, 'test.alpha.DoesNotExist')).toBeUndefined();
  });
});

describe('computeStandaloneClosure', () => {
  skipIfNodeLt22('returns a closure of just the target for a scalar-only Data type', async () => {
    const docs = await parseModels([
      `
      namespace "test.alpha"
      version "1"

      type Foo:
        x string (0..1)
      `
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.alpha.Foo')!;
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    const closure = computeStandaloneClosure(target, globalIndex);
    expect(Array.from(closure.dataByName.keys())).toEqual(['Foo']);
    expect(closure.choiceByName.size).toBe(0);
    expect(closure.enumByName.size).toBe(0);
    expect(closure.typeAliasByName.size).toBe(0);
  });

  skipIfNodeLt22('walks a 2-hop alias chain to a Data type, without adding the intermediate aliases', async () => {
    const docs = await parseModels([
      `
      namespace "test.alpha"
      version "1"

      type Target:
        y string (0..1)
      typeAlias Inner: Target
      typeAlias Outer: Inner
      type Foo:
        bar Outer (0..1)
      `
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.alpha.Foo')!;
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    const closure = computeStandaloneClosure(target, globalIndex);
    expect(Array.from(closure.dataByName.keys()).sort()).toEqual(['Foo', 'Target']);
    expect(closure.typeAliasByName.size).toBe(0);
  });

  skipIfNodeLt22('does not stack-overflow on a self-referencing cyclic Data type', async () => {
    const docs = await parseModels([
      `
      namespace "test.alpha"
      version "1"

      type Node:
        children Node (0..*)
      `
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.alpha.Node')!;
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    const closure = computeStandaloneClosure(target, globalIndex);
    expect(Array.from(closure.dataByName.keys())).toEqual(['Node']);
  });

  skipIfNodeLt22('walks a Choice option across namespaces, through an alias, to an Enum', async () => {
    const docs = await parseModels([
      `
      namespace test.other
      version "1"

      enum Status: ACTIVE INACTIVE
      `,
      `
      namespace test.main
      version "1"

      import test.other.*

      typeAlias StatusAlias: Status
      choice Wrapper:
        StatusAlias
      `
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.main.Wrapper')!;
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    const closure = computeStandaloneClosure(target, globalIndex);
    expect(Array.from(closure.choiceByName.keys())).toEqual(['Wrapper']);
    expect(Array.from(closure.enumByName.keys())).toEqual(['Status']);
    expect(closure.docs.length).toBe(2);
  });

  skipIfNodeLt22('adds the typeAlias node itself when the target IS a type alias', async () => {
    const docs = await parseModels([
      `
      namespace "test.alpha"
      version "1"

      typeAlias MyAlias: int
      `
    ]);
    const namespaceIndexes = buildNamespaceIndexes(docs);
    const target = findTargetNode(namespaceIndexes, 'test.alpha.MyAlias')!;
    const globalIndex = buildGlobalTypeIndex(namespaceIndexes);
    const closure = computeStandaloneClosure(target, globalIndex);
    expect(Array.from(closure.typeAliasByName.keys())).toEqual(['MyAlias']);
    expect(closure.dataByName.size).toBe(0);
  });
});
