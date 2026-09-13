// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, expect, it } from 'vitest';
import { URI } from 'langium';
import {
  addLegacyAnnotations,
  assertValidDocuments,
  createRuneDslServices,
  BASICTYPES_ROSETTA,
  ANNOTATIONS_ROSETTA,
  isAnnotation,
  isRosettaModel
} from '../../src/index.js';

describe('legacy annotation compatibility', () => {
  it('links old and new annotation syntax together without replacing upstream declarations', async () => {
    const { RuneDsl } = createRuneDslServices();
    const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
    const original = factory.fromString(
      `namespace com.rosetta.model
annotation projection:
 XML boolean (0..1)
 CUSTOM boolean (0..1)
annotation externalConfig:
`,
      URI.parse('inmemory:///annotations.rosetta')
    );
    const compatible = addLegacyAnnotations(original, factory);
    const consumer = factory.fromString(
      `namespace example
func Read:
 [ingest XML]
 output: result string (0..1)
func Write:
 [projection CUSTOM]
 output: result string (0..1)
func Enrich:
 [enrich]
 output: result string (0..1)
enum WireFormat:
 XML
schema Example XML
 [externalConfig]
`,
      URI.parse('inmemory:///consumer.rosetta')
    );
    const docs = [
      compatible,
      consumer,
      factory.fromString(BASICTYPES_ROSETTA, URI.parse('inmemory:///basictypes.rosetta'))
    ];
    await RuneDsl.shared.workspace.DocumentBuilder.build(docs, { validation: false });
    assertValidDocuments(docs);
    expect(addLegacyAnnotations(compatible, factory)).toBe(compatible);
    const model = compatible.parseResult.value;
    expect(isRosettaModel(model) && model.elements.filter(isAnnotation).map((annotation) => annotation.name)).toEqual([
      'projection',
      'externalConfig',
      'ingest',
      'enrich'
    ]);
  });

  it('preserves the existing stdlib and still rejects unknown annotations', async () => {
    const { RuneDsl } = createRuneDslServices();
    const factory = RuneDsl.shared.workspace.LangiumDocumentFactory;
    const original = factory.fromString(ANNOTATIONS_ROSETTA, URI.parse('inmemory:///annotations.rosetta'));
    expect(addLegacyAnnotations(original, factory)).toBe(original);
    const consumer = factory.fromString(
      'namespace example\nfunc Read:\n [unknown]\n output: result string (0..1)',
      URI.parse('inmemory:///consumer.rosetta')
    );
    const docs = [
      original,
      consumer,
      factory.fromString(BASICTYPES_ROSETTA, URI.parse('inmemory:///basictypes.rosetta'))
    ];
    await RuneDsl.shared.workspace.DocumentBuilder.build(docs, { validation: false });
    expect(() => assertValidDocuments(docs)).toThrow("Annotation named 'unknown'");
  });
});
