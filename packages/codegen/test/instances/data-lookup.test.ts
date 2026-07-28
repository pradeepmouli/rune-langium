// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { findDataNode } from '../../src/instances/data-lookup.js';

async function parseModel(source: string) {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///data-lookup.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  const parseErrors = doc.parseResult.parserErrors.map((error) => error.message);
  expect(parseErrors).toEqual([]);
  return [doc];
}

const FIXTURE = `
namespace test.instances
version "0.0.0"

type Root:
  child Child (1..1)

type Child:
  name string (1..1)
`;

describe('findDataNode', () => {
  it('returns the Data AST node for a known typeFqn', async () => {
    const docs = await parseModel(FIXTURE);
    const node = findDataNode('test.instances.Root', docs);
    expect(node?.name).toBe('Root');
  });

  it('returns undefined for an unknown typeFqn', async () => {
    const docs = await parseModel(FIXTURE);
    expect(findDataNode('test.instances.Nope', docs)).toBeUndefined();
    expect(findDataNode('not.a.namespace.Nope', docs)).toBeUndefined();
  });
});
