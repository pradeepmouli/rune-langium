// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, expect, it } from 'vitest';
import { findDataNode, resolveFields } from '../../src/instances/resolve-fields.js';

async function parseModel(source: string) {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    source,
    URI.parse('inmemory:///resolve-fields.rosetta')
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
  grandchild Root (0..1)
  name string (1..1)
`;

describe('resolveFields', () => {
  it('resolves exactly one level at the top', async () => {
    const docs = await parseModel(FIXTURE);
    const fields = resolveFields('test.instances.Root', [], docs);
    expect(fields).toHaveLength(1);
    expect(fields[0]?.path).toBe('child');
    expect(fields[0]?.kind).toBe('object');
    expect((fields[0] as { expandable?: boolean }).expandable).toBe(true);
  });

  it('resolves one more level when given a path', async () => {
    const docs = await parseModel(FIXTURE);
    const fields = resolveFields('test.instances.Root', ['child'], docs);
    const names = fields.map((f) => f.path);
    expect(names).toEqual(['child.grandchild', 'child.name']);
  });

  it('does not hang on a recursive type — the cycle re-emits an expandable stub, not an eager loop', async () => {
    const docs = await parseModel(FIXTURE);
    const fields = resolveFields('test.instances.Root', ['child', 'grandchild'], docs);
    expect(fields[0]?.kind).toBe('object');
    expect((fields[0] as { expandable?: boolean }).expandable).toBe(true);
  });
});

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
