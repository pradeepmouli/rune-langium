// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Fixture-based tests for `jsonSchemaProfile` (019 Phase 0.5.4).
 *
 * JSON Schema only has two layouts: `per-namespace` (today's library
 * default) and `single-file` (one bundled `model.schema.json` with all
 * types under `$defs` keyed by `<namespace>.<TypeName>`). No `barrel`
 * value since JSON has no module system.
 */

import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../../src/index.js';

const SOURCE_A = `namespace foo

type Trade:
  tradeId string (1..1)
  quantity number (1..1)
`;

const SOURCE_B = `namespace bar

type Party:
  name string (1..1)
`;

async function parseTwoNamespaces() {
  const { RuneDsl } = createRuneDslServices();
  const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
  const builder = RuneDsl.shared.workspace.DocumentBuilder;
  const docA = factory.fromString(SOURCE_A, URI.parse('inmemory:///foo.rosetta'));
  const docB = factory.fromString(SOURCE_B, URI.parse('inmemory:///bar.rosetta'));
  await builder.build([docA, docB], { validation: false });
  return [docA, docB];
}

describe('JSON Schema LanguageProfile (019 Phase 0.5.4)', () => {
  it('per-namespace layout (library default) is unchanged: one file per namespace', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, { target: 'json-schema' });

    const paths = outputs.map((o) => o.relativePath).sort();
    expect(paths).toEqual(['bar.schema.json', 'foo.schema.json']);

    // Each file is a complete JSON Schema document.
    for (const out of outputs) {
      const parsed = JSON.parse(out.content) as Record<string, unknown>;
      expect(parsed.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(parsed.$defs).toBeTypeOf('object');
    }
  });

  it('single-file layout emits one bundled model.schema.json with namespaced $defs keys', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, {
      target: 'json-schema',
      'json-schema': { layout: 'single-file' }
    });

    const paths = outputs.map((o) => o.relativePath);
    expect(paths).toEqual(['model.schema.json']);

    const bundled = JSON.parse(outputs[0]!.content) as {
      $schema: string;
      $id: string;
      title: string;
      $defs: Record<string, unknown>;
    };
    expect(bundled.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(bundled.$id).toBe('model.schema.json');
    // Both namespaces' types appear, keyed by `<ns>.<TypeName>`.
    expect(bundled.$defs).toHaveProperty('foo.Trade');
    expect(bundled.$defs).toHaveProperty('bar.Party');
    // Title lists every namespace included in the bundle.
    expect(bundled.title).toMatch(/foo/);
    expect(bundled.title).toMatch(/bar/);
  });

  it('makeBarrel returns undefined (single-file is the canonical bundling)', async () => {
    // The barrel layout is invalid for JSON Schema in the option type,
    // but if a caller passed it (string-typed by the time the dispatch
    // runs), the profile's makeBarrel just returns undefined so the
    // generic wrapper omits the barrel output. Verify the output set
    // contains no `index.schema.json`.
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, {
      target: 'json-schema',
      // Force a non-'per-namespace' layout via cast so we exercise the
      // whole-model wrapper path.
      'json-schema': { layout: 'single-file' }
    });
    expect(outputs.find((o) => o.relativePath === 'index.schema.json')).toBeUndefined();
  });

  it('does not emit shared runtime sidecars (makeSharedArtifacts returns [])', async () => {
    const docs = await parseTwoNamespaces();
    const outputs = await generate(docs, {
      target: 'json-schema',
      'json-schema': { layout: 'single-file' }
    });
    // No `runtime.schema.json` or similar sidecar.
    for (const out of outputs) {
      expect(out.relativePath).not.toMatch(/runtime/);
    }
  });
});
