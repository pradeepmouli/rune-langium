#!/usr/bin/env node
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import {
  addLegacyAnnotations,
  assertValidDocuments,
  createRuneDslServices,
  isRosettaModel
} from '../packages/core/dist/index.js';
import { resolveExportSelection } from '../packages/codegen/dist/src/export.js';

const { URI } = await import(new URL('../packages/core/node_modules/langium/lib/index.js', import.meta.url));
const pins = JSON.parse(await readFile(new URL('./fixtures/cdm-reference/sources.json', import.meta.url)));
const cases = JSON.parse(await readFile(new URL('./fixtures/cdm-reference/inputs.json', import.meta.url)));
const artifacts = await Promise.all(
  pins.map(async ({ id }) => {
    const bytes = await readFile(
      new URL(`../dist/cdm-reference-artifacts/${id}/latest.serialized.json.gz`, import.meta.url)
    );
    return JSON.parse(gunzipSync(bytes));
  })
);
const contents = new Map(
  artifacts.flatMap((artifact) =>
    artifact.documents.map((doc) => [URI.file(`[${artifact.modelId}]/${doc.path}`).toString(), doc.content])
  )
);
const { RuneDsl } = createRuneDslServices();
const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
const documents = [...contents].map(([key, content]) => {
  const uri = URI.parse(key);
  const document = factory.fromString(content, uri);
  return uri.path.endsWith('/annotations.rosetta') ? addLegacyAnnotations(document, factory) : document;
});
await RuneDsl.shared.workspace.DocumentBuilder.build(documents, { validation: false });
assertValidDocuments(documents);
const declarations = [...new Set(cases.map((c) => c.function))].map((fqn) => {
  const index = fqn.lastIndexOf('.');
  return { namespace: fqn.slice(0, index), name: fqn.slice(index + 1), kind: 'RosettaFunction' };
});
const selection = resolveExportSelection(documents, { namespaces: [], declarations });
if (selection.unknown.length) throw new Error(JSON.stringify(selection.unknown));
const out = new URL('../packages/codegen/test/fixtures/cdm-reference/', import.meta.url);
await mkdir(out, { recursive: true });
const files = [];
for (const doc of selection.documents) {
  const model = doc.parseResult.value;
  if (!isRosettaModel(model)) throw new Error('Expected Rune model');
  // Parser source ranges and root text both address the original input,
  // including bare functional expressions; no bracket normalization is emitted.
  const original = model.$cstNode.root.fullText;
  const first = documents.find((document) => document.uri.toString() === doc.uri.toString()).parseResult.value
    .elements[0].$cstNode.offset;
  const content =
    original.slice(0, first) +
    model.elements
      .map((element) => {
        const { offset, end } = element.$cstNode;
        return original.slice(offset, end);
      })
      .join('\n\n') +
    '\n';
  const name = `${model.name.replace(/^"|"$/g, '')}--${doc.uri.path.split('/').at(-1)}`;
  await writeFile(new URL(name, out), content);
  files.push({ name, upstreamPath: doc.uri.path.slice(1), sha256: createHash('sha256').update(content).digest('hex') });
}
await writeFile(
  new URL('sources.json', out),
  JSON.stringify(
    {
      pins,
      files,
      declarations,
      normalization: 'Declaration bodies retained from original upstream source via source-mapped CST ranges'
    },
    null,
    2
  ) + '\n'
);
console.log(`Extracted ${selection.included.length} upstream declarations into ${files.length} source fixtures`);
