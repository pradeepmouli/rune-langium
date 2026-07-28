// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * operation-carrier — the func ↔ OpenAPI-operation correspondence carrier
 * (spec.md Phase 2b Implementation Addendum).
 *
 * GRAMMAR VERIFICATION (parse-first, see test/import/operation-carrier.test.ts):
 * `RosettaFunction` accepts `(References | Annotations)*` only — no
 * `Synonyms` fragment (rune-dsl.langium:147-159, confirmed directly against
 * the grammar source). The correspondence carrier is therefore carrier
 * option (a) from the addendum: a declared custom `annotation` consumed via
 * `AnnotationRef`, NOT a naming/definition-text convention (option (b)) —
 * `AnnotationRef` CAN carry a string payload via its `qualifiers+=
 * AnnotationQualifier` list (`qualName=STRING '=' (qualValue=STRING |
 * qualPath=...)`, rune-dsl.langium:109-111), and
 * `rosetta-render-core.ts`'s `renderAnnotationRef` already renders
 * qualifiers as `"qualName"="qualValue"` — no renderer change needed.
 *
 * Concretely: one annotation declared ONCE per emitted document —
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
 * `renderNode` has NO case for `$type: 'Annotation'` (the DECLARATION, as
 * opposed to `AnnotationRef`, the USAGE) — verified empirically, same
 * "unimplemented → null" contract every other unhandled `$type` has. This
 * mirrors the exact situation `ast-builder.ts`'s module doc records for
 * `RosettaSynonymSource` (`synonym source <Name>` — also undispatched):
 * the fix is the SAME established pattern — hand-assemble the declaration
 * as literal text (reusing `renderNode`'s OWN `Attribute` rendering for the
 * nested `op string (0..1)` line, via the caller's `renderChild`, so the
 * attribute line itself is never duplicated logic) and splice it into the
 * emitted document once, the same way `import/index.ts`'s `splice()`
 * already inserts the `synonym source` line after `version "..."`. Zero
 * changes to `rosetta-render-core.ts`.
 *
 * `AnnotationRef` itself DOES have a `renderNode` case (used directly, no
 * hand-assembly needed for the per-func usage site).
 */

import type { Dehydrated } from '@rune-langium/core';
import type { Annotation, AnnotationRef, Attribute } from '@rune-langium/core';
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
