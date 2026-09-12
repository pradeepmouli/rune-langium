// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Carries OpenAPI operation metadata through a custom Rune annotation.
 * Functions accept annotations but not synonyms. AnnotationRef qualifiers carry
 * the string payload, with one declaration per emitted document:
 *
 * ```rune
 * annotation openApi: <"Carries the OpenAPI operation for a func.">
 *     op string (0..1)
 *
 * func GetTrade:
 *     [openApi op "value"="GET /trades/{id}"]
 *     ...
 * ```
 *
 * renderNode handles AnnotationRef usage but not Annotation declarations.
 * Assemble the declaration text once, using renderChild for the nested Attribute
 * so attribute rendering remains shared, and splice it after the version line.
 */

import type { Dehydrated, Annotation, AnnotationRef, Attribute } from '@rune-langium/core';
import { escapeString } from '../emit/rosetta/rosetta-render-core.js';

/** The declared annotation's name — `[openApi ...]` at each func's usage site. */
export const OPENAPI_ANNOTATION_NAME = 'openApi';

/** The single attribute the `openApi` annotation declares, referenced as `AnnotationRef.attribute`. */
export const OPERATION_ATTRIBUTE_NAME = 'op';

/** The `AnnotationQualifier.qualName` under which the operation string rides (`qualValue`). */
export const OPERATION_QUALIFIER_NAME = 'value';

/**
 * `Dehydrated<Annotation>`, with `name`/`definition` corrected to plain
 * `string`/`string | undefined` — the same `Dehydrated<T>` union-collapse
 * gap `constraint-translator.ts`'s module doc documents (gap 4: a
 * union-typed field, here `RosettaNamed.name: ValidID` and `RosettaDefinable`'s
 * `definition`, does not distribute cleanly through `Dehydrated<T>`'s field
 * mapper; empirically both resolve to `string | Dehydrated<never> |
 * (undefined)`, not the plain string shape). Corrected locally rather than
 * reshaping the emitted value — every real fixture already only ever
 * assigns a plain string.
 */
export type AnnotationDeclNode = Omit<Dehydrated<Annotation>, 'name' | 'definition'> & {
  name: string;
  definition: string | undefined;
};

/**
 * The `annotation openApi: ... op string (0..1)` declaration, as an
 * `AnnotationDeclNode` — ready for hand-assembly (see module doc:
 * `renderNode` has no `Annotation` case, so this is never passed to
 * `renderNode` directly; only its nested `attributes[0]` is, via the
 * caller's own `renderChild`/`renderNode(attr, ...)` call).
 */
export function buildOperationAnnotationDecl(): AnnotationDeclNode {
  const opAttribute: Dehydrated<Attribute> = {
    $type: 'Attribute',
    override: false,
    name: OPERATION_ATTRIBUTE_NAME,
    typeCall: { $type: 'TypeCall', type: { $refText: 'string' }, arguments: [] },
    typeCallArgs: [],
    card: { $type: 'RosettaCardinality', inf: 0, sup: 1, unbounded: false },
    definition: undefined,
    annotations: [],
    references: [],
    synonyms: [],
    labels: [],
    ruleReferences: []
  };
  return {
    $type: 'Annotation',
    name: OPENAPI_ANNOTATION_NAME,
    definition: 'Carries the OpenAPI operation (method + path) for a func.',
    prefix: undefined,
    attributes: [opAttribute]
  };
}

/**
 * Renders `buildOperationAnnotationDecl()`'s declaration to `.rune` text
 * by hand-assembling the `annotation <name>: <"...">` head + nested
 * attribute line — mirroring `renderModel`'s own hand-assembled
 * `namespace`/`version` lines (no `renderNode` dispatch exists for
 * `Annotation`; see module doc).
 *
 * @param renderAttributeText - the caller's own rendering of the nested
 *   `op string (0..1)` attribute line (typically `renderNode(decl.
 *   attributes[0], renderChild)`) — kept as a parameter rather than
 *   re-implemented here so the attribute line is never duplicated logic.
 */
export function renderOperationAnnotationDecl(decl: AnnotationDeclNode, renderAttributeText: string): string {
  const lines = [`annotation ${decl.name}: <"${escapeString(decl.definition ?? '')}">`];
  for (const line of renderAttributeText.split('\n')) {
    lines.push(line.trim() ? `    ${line}` : '');
  }
  return lines.join('\n');
}

/**
 * Builds one `AnnotationRef`-shaped node attaching the operation string to
 * a func: `[openApi op "value"="METHOD /path"]`. Renders via the EXISTING
 * `renderNode` `AnnotationRef` case (`rosetta-render-core.ts`'s
 * `renderAnnotationRef`) — no hand-assembly needed here, unlike the
 * declaration above.
 */
export function buildOperationAnnotationRef(operation: string): Dehydrated<AnnotationRef> {
  return {
    $type: 'AnnotationRef',
    annotation: { $refText: OPENAPI_ANNOTATION_NAME },
    attribute: { $refText: OPERATION_ATTRIBUTE_NAME },
    qualifiers: [
      {
        $type: 'AnnotationQualifier',
        qualName: OPERATION_QUALIFIER_NAME,
        qualValue: operation,
        qualPath: undefined
      }
    ]
  };
}

/**
 * Reads the operation string back off a func node (the inbound half of the
 * carrier, T4). Returns `undefined` when no `[openApi op "value"="..."]`
 * annotation ref is present — a func with no carrier is not an error (T4
 * treats it as "no correspondence recorded", not a translation failure).
 */
export function readOperationCarrier(func: { annotations?: readonly unknown[] }): string | undefined {
  for (const raw of func.annotations ?? []) {
    const ref = raw as {
      annotation?: { $refText?: string };
      attribute?: { $refText?: string };
      qualifiers?: ReadonlyArray<{ qualName?: string; qualValue?: string }>;
    };
    if (ref.annotation?.$refText !== OPENAPI_ANNOTATION_NAME) continue;
    if (ref.attribute?.$refText !== OPERATION_ATTRIBUTE_NAME) continue;
    const qualifier = ref.qualifiers?.find((q) => q.qualName === OPERATION_QUALIFIER_NAME);
    if (qualifier?.qualValue !== undefined) return qualifier.qualValue;
  }
  return undefined;
}
