// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { buildNamespaceIndexes } from '../../src/preview-schema.js';
import {
  buildGlobalTypeIndex,
  findTargetNode,
  computeStandaloneClosure,
  emitStandaloneZodSchema
} from '../../src/emit/standalone-schema.js';

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

/**
 * Turns `emitStandaloneZodSchema`'s returned TypeScript into plain,
 * `new Function`-evaluable JavaScript: drops the leading `import { z } from
 * 'zod';` line (the caller is expected to bind `z` itself — see the
 * production JSDoc on `emitStandaloneZodSchema`), strips `export `, then
 * runs the result through the real TypeScript compiler to erase remaining
 * type syntax (generics, `: Type` annotations, cyclic-type `interface`
 * predeclarations, `type X = ...` aliases). Uses `typescript-classic` — this
 * package's existing devDependency pin for the classic Compiler API (see
 * `vitest-decorator-plugin.ts`'s own comment on why TS7's `typescript`
 * package no longer exposes `transpileModule`) — rather than hand-rolling a
 * second, approximate TS-stripper; this is test-only tooling, never a
 * production `src/` dependency.
 */
async function toEvaluableJs(tsCode: string): Promise<string> {
  const ts = (await import('typescript-classic')).default;
  const withoutBoilerplate = tsCode
    // Drop the inlined TS-typed runtime-helper block — the caller prepends
    // its JS-safe twin, RUNTIME_HELPER_JS_SOURCE, itself (see this test's
    // own usage below), matching the documented contract.
    .replace(/\/\/ --- rune-codegen runtime helpers \(inlined\) ---[\s\S]*?\/\/ --- end runtime helpers ---\n?/, '')
    .split('\n')
    .filter((line) => !/^import .*;$/.test(line))
    .map((line) => line.replace(/^export\s+/, ''))
    .join('\n');
  return ts.transpileModule(withoutBoilerplate, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 }
  }).outputText;
}

describe('emitStandaloneZodSchema', () => {
  skipIfNodeLt22('produces a self-contained script with no cross-namespace import statements', async () => {
    const docs = await parseModels([
      `
      namespace test.other
      version "1"

      type Bar:
        y string (0..1)
      `,
      `
      namespace test.main
      version "1"

      import test.other.*

      typeAlias BarAlias: Bar
      type Foo:
        bar BarAlias (0..1)
      `
    ]);
    const result = emitStandaloneZodSchema(docs, 'test.main.Foo');
    expect(result.diagnostics).toEqual([]);
    // The only surviving import is the genuine external 'zod' package
    // dependency — every cross-namespace generated-file import is stripped,
    // since Bar is already declared locally in this same script.
    expect(result.code.match(/^import .*/gm)).toEqual(["import { z } from 'zod';"]);
    expect(result.code).toContain('BarSchema');
  });

  skipIfNodeLt22('produces a script that genuinely evaluates and validates real sample data', async () => {
    const docs = await parseModels([
      `
      namespace test.other
      version "1"

      type Bar:
        y string (0..1)
      `,
      `
      namespace test.main
      version "1"

      import test.other.*

      typeAlias BarAlias: Bar
      type Foo:
        bar BarAlias (0..1)
      `
    ]);
    const result = emitStandaloneZodSchema(docs, 'test.main.Foo');
    // RUNTIME_HELPER_JS_SOURCE mirrors what apps/studio/src/workers/codegen-worker.ts
    // already prepends before evaluating generated func bodies — reuse the same
    // export here so this test proves the real end-to-end contract, not an
    // approximation of it.
    const { RUNTIME_HELPER_JS_SOURCE } = await import('../../src/export.js');
    const { z } = await import('zod');
    const evaluableJs = await toEvaluableJs(result.code);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const wrapper = new Function('z', `${RUNTIME_HELPER_JS_SOURCE}\n\n${evaluableJs}\nreturn FooSchema;`);
    const FooSchema = wrapper(z);
    expect(FooSchema.safeParse({ bar: { y: 'hello' } }).success).toBe(true);
    expect(FooSchema.safeParse({ bar: { y: 123 } }).success).toBe(false);
  });

  skipIfNodeLt22('produces a script for a target with no dependencies at all', async () => {
    const docs = await parseModels([
      `
      namespace test
      version "1"

      type Leaf:
        x string (0..1)
      `
    ]);
    const result = emitStandaloneZodSchema(docs, 'test.Leaf');
    expect(result.code.match(/^import .*/gm)).toEqual(["import { z } from 'zod';"]);
    expect(result.code).toContain('LeafSchema');
  });

  skipIfNodeLt22('returns a diagnostic and empty code for an unknown targetId', async () => {
    const docs = await parseModels([
      `
      namespace test
      version "1"

      type Leaf:
        x string (0..1)
      `
    ]);
    const result = emitStandaloneZodSchema(docs, 'test.DoesNotExist');
    expect(result.code).toBe('');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.severity).toBe('error');
  });

  skipIfNodeLt22('surfaces a genuinely unresolvable reference within the closure as a diagnostic', async () => {
    const docs = await parseModels([
      `
      namespace test
      version "1"

      type Foo:
        bar MissingType (0..1)
      `
    ]);
    const result = emitStandaloneZodSchema(docs, 'test.Foo');
    expect(result.diagnostics.some((d) => d.code === 'unresolved-ref')).toBe(true);
  });
});
