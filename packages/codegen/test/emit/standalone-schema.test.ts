// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { buildNamespaceIndexes } from '../../src/preview-schema.js';
import { buildGlobalTypeIndex, findTargetNode } from '../../src/emit/standalone-schema.js';

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
