// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { beforeAll, describe, expect, it } from 'vitest';
import { AstUtils, URI } from 'langium';
import {
  createRuneDslServices,
  getNodeSourceRegion,
  isRosettaFunction,
  isData,
  getExpressionRegions
} from '@rune-langium/core';
import { generate, selectTypeScriptProjection } from '../../src/export.js';
import { referenceFiles } from '../helpers/cdm-reference.js';

describe('authoritative TypeScript projections', () => {
  const { RuneDsl } = createRuneDslServices();
  let outputs: Awaited<ReturnType<typeof generate>>;
  const documents = referenceFiles().map(({ uri, content }) =>
    RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(content, URI.parse(uri))
  );
  beforeAll(async () => {
    await RuneDsl.shared.workspace.DocumentBuilder.build(documents, { validation: false });
    outputs = await generate(documents, { target: 'typescript', strict: true });
  });

  it('displays each pinned typed function using its actual generated declaration', () => {
    let count = 0;
    for (const doc of documents)
      for (const node of AstUtils.streamAst(doc.parseResult.value)) {
        if (!isRosettaFunction(node)) continue;
        const generated = outputs.flatMap((output) => output.funcs).find((func) => func.name === node.name);
        if (!generated) continue;
        const subject = { uri: doc.uri.toString(), nodeId: `selected:${node.name}`, region: getNodeSourceRegion(node) };
        const projected = selectTypeScriptProjection(outputs, subject, 'function');
        expect(projected.code, node.name).toBe(generated.fileContents);
        if (projected.code.includes('rune.equals(')) expect(projected.requiredHelpers).toContain('rune');
        expect(projected.subject).toEqual(subject);
        expect(projected.sourceMap.length).toBeGreaterThan(0);
        count++;
      }
    expect(count).toBe(outputs.flatMap((output) => output.funcs).length);
    expect(count).toBeGreaterThan(10);
  });

  it('records Data condition code during emission using the same predicate', () => {
    let count = 0;
    for (const doc of documents)
      for (const node of AstUtils.streamAst(doc.parseResult.value)) {
        if (!isData(node)) continue;
        const regions = getExpressionRegions(node);
        for (const { region } of regions) {
          const subject = { uri: doc.uri.toString(), nodeId: 'selected:data-rule', region };
          const projected = selectTypeScriptProjection(outputs, subject, 'condition');
          expect(outputs.some((output) => output.content.includes(projected.code))).toBe(true);
          if (projected.code.includes('rune.equals(')) expect(projected.requiredHelpers).toContain('rune');
          expect(projected.sourceMap[0]!.sourceUri).toBe(subject.uri);
          count++;
        }
      }
    expect(count).toBeGreaterThan(0);
  });

  it('reports a real missing subject instead of a reversible-subset refusal', () => {
    expect(() =>
      selectTypeScriptProjection(
        outputs,
        { uri: 'file:///missing.rosetta', nodeId: 'missing', region: { from: 0, to: 1 } },
        'function'
      )
    ).toThrow('No generated');
  });
  it('retains provenance when namespaces are bundled into a single file', async () => {
    const bundled = await generate(documents, {
      target: 'typescript',
      strict: true,
      typescript: { layout: 'single-file' }
    });
    const owner = documents.flatMap((doc) =>
      [...AstUtils.streamAst(doc.parseResult.value)].filter(isRosettaFunction)
    )[0]!;
    const subject = {
      uri: AstUtils.getDocument(owner).uri.toString(),
      nodeId: owner.name,
      region: getNodeSourceRegion(owner)
    };
    const projected = selectTypeScriptProjection(bundled, subject, 'function');
    expect(bundled.some((output) => output.content.includes(projected.code))).toBe(true);
  });
});
