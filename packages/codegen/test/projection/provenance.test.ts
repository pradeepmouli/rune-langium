// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { expect, it } from 'vitest';
import { URI } from 'langium';
import {
  BASICTYPES_ROSETTA,
  createRuneDslServices,
  getFunctionImplementationRegion,
  isRosettaFunction,
  type RosettaModel
} from '@rune-langium/core';
import {
  generate,
  generatePythonModule,
  selectTypeScriptProjection,
  selectPythonProjection
} from '../../src/export.js';

it.each(['// trailing body comment', '/* trailing body comment */'])(
  'selects generated functions with %s without admitting neighboring declarations',
  async (comment) => {
    const { RuneDsl } = createRuneDslServices();
    const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
    const source = `namespace comments
func Calculate:
 output: result int (1..1)
 set result: 1
 ${comment}
// Neighbor documentation
func Neighbor:
 output: result int (1..1)
 set result: 2
`;
    const doc = factory.fromString<RosettaModel>(source, URI.parse('file:///comments.rosetta'));
    const basics = factory.fromString(BASICTYPES_ROSETTA, URI.parse('file:///basics.rosetta'));
    await RuneDsl.shared.workspace.DocumentBuilder.build([basics, doc]);
    expect(doc.parseResult.parserErrors).toEqual([]);
    const owner = doc.parseResult.value.elements.find(isRosettaFunction)!;
    const subject = {
      uri: doc.uri.toString(),
      nodeId: 'selected:Calculate',
      region: getFunctionImplementationRegion(owner, source)
    };
    const typescript = await generate([doc], { target: 'typescript', strict: true });
    const python = generatePythonModule([doc]);
    const projections = [
      (current: typeof subject) => selectTypeScriptProjection(typescript, current, 'function'),
      (current: typeof subject) => selectPythonProjection(python, current, 'function')
    ];
    for (const project of projections) {
      const result = project(subject);
      expect(result.code).toContain('Calculate(');
      expect(result.code).not.toContain('Neighbor');
      expect(result.subject).toEqual(subject);
      expect(result.sourceMap[0]).toMatchObject({ sourceUri: subject.uri, sourceLine: 2 });
      expect(() => project({ ...subject, region: { ...subject.region, to: source.length } })).toThrow(
        'No generated function'
      );
    }
  }
);
