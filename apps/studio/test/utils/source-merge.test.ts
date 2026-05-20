// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Regression — mergeSerializedIntoSource preserves elements the lossy
 * serializer drops.
 *
 * 2026-05-20, PR #221 Codex P1: the visual editor source-sync calls
 * `serializeModel()`, which only emits Data/Choice/Enum and silently
 * drops every other root element kind (RosettaFunction body,
 * RosettaTypeAlias, RosettaRule, RosettaReport, RosettaRecordType,
 * RosettaBasicType, Annotation, …). Naive overwrite of file content with
 * that output erased every dropped element.
 *
 * `mergeSerializedIntoSource` performs a per-element splice keyed on
 * (name, $type) so unsupported elements survive verbatim and edits to
 * supported elements still propagate.
 */

import { describe, it, expect } from 'vitest';
import { mergeSerializedIntoSource } from '../../src/utils/source-merge.js';

const ORIGINAL_MIXED_SOURCE = `namespace test.mixed
version "1.0.0"

type Foo:
  bar string (1..1)
  baz number (0..1)

func myFunc:
  inputs:
    a number (1..1)
    b number (1..1)
  output:
    result number (1..1)
  set result:
    a + b

typeAlias MyAlias: number
`;

const SERIALIZER_OUTPUT_FOO_ONLY = `namespace test.mixed
version "0.0.0"

type Foo:
  bar string (1..1)
  renamedBaz number (0..1)
`;

describe('mergeSerializedIntoSource', () => {
  it('preserves RosettaFunction and RosettaTypeAlias when serializer only emits the Data type', async () => {
    const merged = await mergeSerializedIntoSource(ORIGINAL_MIXED_SOURCE, SERIALIZER_OUTPUT_FOO_ONLY);

    // The serializer's Data block should be spliced in (renamedBaz visible).
    expect(merged).toContain('renamedBaz');
    expect(merged).not.toMatch(/^\s*baz number/m);

    // The Function and TypeAlias the serializer dropped must survive.
    expect(merged).toContain('func myFunc:');
    expect(merged).toContain('inputs:');
    expect(merged).toMatch(/\bset result:\s*\n\s*a \+ b/);
    expect(merged).toContain('typeAlias MyAlias');
  });

  it('appends new elements that have no original counterpart', async () => {
    const serializedWithNew = `namespace test.mixed
version "0.0.0"

type Foo:
  bar string (1..1)
  baz number (0..1)

type Brand:
  brandName string (1..1)
`;
    const merged = await mergeSerializedIntoSource(ORIGINAL_MIXED_SOURCE, serializedWithNew);

    // New type was appended, originals preserved.
    expect(merged).toContain('type Brand:');
    expect(merged).toContain('brandName string');
    expect(merged).toContain('func myFunc:');
    expect(merged).toContain('typeAlias MyAlias');
  });

  it('keeps the original verbatim when the serialized output is unparseable', async () => {
    const merged = await mergeSerializedIntoSource(ORIGINAL_MIXED_SOURCE, '@@@ this is not rosetta @@@');
    expect(merged).toBe(ORIGINAL_MIXED_SOURCE);
  });

  it('returns serialized text when original is empty (no baseline to merge into)', async () => {
    const merged = await mergeSerializedIntoSource('', SERIALIZER_OUTPUT_FOO_ONLY);
    expect(merged).toContain('type Foo:');
    expect(merged).toContain('renamedBaz');
  });

  it('produces idempotent merges when serializer output matches original (modulo formatting)', async () => {
    // Roundtripping the serializer output against itself should be a fixed
    // point — same in, same out.
    const merged1 = await mergeSerializedIntoSource(SERIALIZER_OUTPUT_FOO_ONLY, SERIALIZER_OUTPUT_FOO_ONLY);
    const merged2 = await mergeSerializedIntoSource(merged1, SERIALIZER_OUTPUT_FOO_ONLY);
    expect(merged2).toBe(merged1);
  });
});
