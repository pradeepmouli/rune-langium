// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * operation-carrier — parse-first verification of the func↔operation
 * correspondence carrier (spec.md Phase 2b Implementation Addendum:
 * "Grammar verification RESOLVED": `RosettaFunction` does NOT accept
 * `Synonyms`, only `AnnotationRef`; the correspondence carrier is a declared
 * `annotation` consumed via `[openApi ...]`).
 *
 * This test proves the exact grammar shape the emitter (T3) and reader (T4)
 * must produce/consume: a real `annotation openApi:` declaration with one
 * `op` attribute, referenced from a func via
 * `[openApi op "METHOD /path"]` — using `AnnotationRef`'s existing
 * `attribute=[Attribute:ValidID] (qualifiers+=AnnotationQualifier)*` shape,
 * where the qualifier's `qualValue` (a STRING) carries the operation text.
 * `rosetta-render-core.ts`'s `renderAnnotationRef` already renders qualifiers
 * (`[name attr "qualName"="qualValue"]`) — no renderer change needed.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderNode, type RenderChild } from '../../src/emit/rosetta/rosetta-render-core.js';
import {
  buildOperationAnnotationDecl,
  buildOperationAnnotationRef,
  renderOperationAnnotationDecl,
  OPENAPI_ANNOTATION_NAME,
  OPERATION_ATTRIBUTE_NAME,
  OPERATION_QUALIFIER_NAME,
  readOperationCarrier
} from '../../src/import/operation-carrier.js';

const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

describe('operation-carrier — AnnotationRef carries the operation string (parse-first)', () => {
  it('hand-written .rune with [openApi op "GET /trades/{id}"] parses with zero errors', async () => {
    const src = `namespace test.carrier
version "0.0.0"

annotation openApi: <"Carries the OpenAPI operation for a func.">
    op string (0..1)

func GetTrade:
    [openApi op "value"="GET /trades/{id}"]
    inputs:
        id string (1..1)
    output:
        result string (1..1)
    set result: id
`;
    const result = await parse(src);
    expect(result.hasErrors).toBe(false);

    const model = result.value as { elements?: unknown[] };
    const func = model.elements?.find((e) => (e as { $type?: string }).$type === 'RosettaFunction') as
      | { annotations?: unknown[] }
      | undefined;
    expect(func).toBeDefined();
    expect(func!.annotations).toHaveLength(1);
  });

  it('buildOperationAnnotationDecl renders + reparses as the annotation declaration', async () => {
    const decl = buildOperationAnnotationDecl();
    // renderNode has NO `Annotation` case (verified — see module doc); the
    // declaration is hand-assembled via renderOperationAnnotationDecl,
    // which itself delegates the nested `op string (0..1)` line to
    // renderNode (the existing `Attribute` case).
    const attrText = renderNode(decl.attributes[0] as never, regen);
    expect(attrText).not.toBeNull();
    const text = renderOperationAnnotationDecl(decl, attrText!);
    expect(text).toContain(`annotation ${OPENAPI_ANNOTATION_NAME}:`);
    expect(text).toContain(OPERATION_ATTRIBUTE_NAME);

    const src = `namespace test.carrier\nversion "0.0.0"\n\n${text}\n`;
    const result = await parse(src);
    expect(result.hasErrors).toBe(false);
  });

  it('buildOperationAnnotationRef renders + reparses attached to a func, and round-trips through readOperationCarrier', async () => {
    const decl = buildOperationAnnotationDecl();
    const attrText = renderNode(decl.attributes[0] as never, regen)!;
    const declText = renderOperationAnnotationDecl(decl, attrText);
    const refNode = buildOperationAnnotationRef('GET /trades/{id}');
    const refText = renderNode(refNode as never, regen);
    expect(refText).toBe(
      `[${OPENAPI_ANNOTATION_NAME} ${OPERATION_ATTRIBUTE_NAME} "${OPERATION_QUALIFIER_NAME}"="GET /trades/{id}"]`
    );

    const src = `namespace test.carrier
version "0.0.0"

${declText}

func GetTrade:
    ${refText}
    inputs:
        id string (1..1)
    output:
        result string (1..1)
    set result: id
`;
    const result = await parse(src);
    expect(result.hasErrors).toBe(false);

    const model = result.value as { elements?: unknown[] };
    const func = model.elements?.find((e) => (e as { $type?: string }).$type === 'RosettaFunction') as
      | Record<string, unknown>
      | undefined;
    expect(func).toBeDefined();

    const operation = readOperationCarrier(func!);
    expect(operation).toBe('GET /trades/{id}');
  });

  it('readOperationCarrier returns undefined when no carrier annotation is present', () => {
    expect(readOperationCarrier({ annotations: [] })).toBeUndefined();
    expect(readOperationCarrier({})).toBeUndefined();
  });
});
