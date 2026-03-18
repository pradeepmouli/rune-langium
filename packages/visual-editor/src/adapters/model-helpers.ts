/**
 * Display formatting helpers for AstNodeModel fields.
 *
 * These convert structured AST model objects (cardinalities, references,
 * annotations, conditions) into display strings for the UI layer.
 * They live here (not in components) so both node components and
 * form components can share them.
 */

import type { AstNodeModel, AstNodeShape } from '../types.js';

// ---------------------------------------------------------------------------
// Cardinality
// ---------------------------------------------------------------------------

interface CardinalityShape {
  inf: number;
  sup?: number;
  unbounded: boolean;
}

/** Format a RosettaCardinality model as a display string, e.g. `(1..*)`. */
export function formatCardinality(card: CardinalityShape | undefined): string {
  if (!card) return '';
  if (card.unbounded) return `(${card.inf}..*)`;
  const sup = card.sup ?? card.inf;
  return `(${card.inf}..${sup})`;
}

/** Parse a cardinality display string back to structured form. */
export function parseCardinality(card?: string): CardinalityShape {
  if (!card) return { inf: 1, sup: 1, unbounded: false };
  const match = card.match(/\(?(\d+)\.\.(\*|\d+)\)?/);
  if (!match) return { inf: 1, sup: 1, unbounded: false };
  const inf = parseInt(match[1]!, 10);
  if (match[2] === '*') return { inf, unbounded: true };
  const sup = parseInt(match[2]!, 10);
  return { inf, sup, unbounded: false };
}

// ---------------------------------------------------------------------------
// Type references
// ---------------------------------------------------------------------------

interface ReferenceShape {
  $refText?: string;
  ref?: unknown;
}

interface TypeCallShape {
  type?: ReferenceShape;
}

/** Get the display name of a type reference (e.g. from a TypeCall). */
export function getTypeRefText(typeCall: TypeCallShape | undefined): string | undefined {
  return typeCall?.type?.$refText;
}

/** Get display text from a Reference-like object. */
export function getRefText(ref: ReferenceShape | undefined): string | undefined {
  return ref?.$refText;
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

interface AnnotationRefShape {
  annotation?: ReferenceShape;
  attribute?: ReferenceShape;
}

export interface AnnotationDisplayInfo {
  name: string;
  attribute?: string;
}

/** Convert AstNodeModel<AnnotationRef>[] to display-friendly objects. */
export function annotationsToDisplay(
  annotations: AnnotationRefShape[] | undefined
): AnnotationDisplayInfo[] {
  if (!annotations || annotations.length === 0) return [];
  return annotations.map((ref) => ({
    name: ref.annotation?.$refText ?? 'unknown',
    attribute: ref.attribute?.$refText
  }));
}

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

interface ConditionShape {
  name?: string;
  definition?: string;
  expression?: unknown;
  postCondition?: boolean;
}

export interface ConditionDisplayInfo {
  name?: string;
  definition?: string;
  expressionText: string;
  isPostCondition?: boolean;
  /** Raw AST expression object for direct tree conversion in the expression builder. */
  expressionAst?: unknown;
}

/**
 * Get expression text from a condition model.
 * Tries $cstText (preserved by worker) then falls back to empty.
 */
function getExpressionText(condition: ConditionShape): string {
  const expr = condition.expression;
  if (expr && typeof expr === 'object') {
    // Try $cstText (preserved by parser worker before structured clone)
    const cstText = (expr as Record<string, unknown>).$cstText;
    if (typeof cstText === 'string') return cstText.trim();
    // Try $cstNode.text (available if CST survived)
    const cstNode = (expr as Record<string, unknown>).$cstNode;
    if (cstNode && typeof cstNode === 'object') {
      const text = (cstNode as Record<string, unknown>).text;
      if (typeof text === 'string') return text.trim();
    }
  }
  return '';
}

/** Convert condition models to display-friendly objects. */
export function conditionsToDisplay(
  conditions: ConditionShape[] | undefined,
  postConditions?: ConditionShape[] | undefined
): ConditionDisplayInfo[] {
  const result: ConditionDisplayInfo[] = [];
  for (const c of conditions ?? []) {
    result.push({
      name: c.name ?? undefined,
      definition: c.definition ?? undefined,
      expressionText: getExpressionText(c),
      isPostCondition: false,
      expressionAst: c.expression
    });
  }
  for (const c of postConditions ?? []) {
    result.push({
      name: c.name ?? undefined,
      definition: c.definition ?? undefined,
      expressionText: getExpressionText(c),
      isPostCondition: true,
      expressionAst: c.expression
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Synonyms
// ---------------------------------------------------------------------------

interface ClassSynonymShape {
  value?: { name?: string; path?: string };
}

interface EnumSynonymShape {
  body?: { values?: Array<{ name?: string; path?: string }> };
}

/** Extract display strings from Data/Choice class synonyms. */
export function classExprSynonymsToStrings(synonyms: ClassSynonymShape[] | undefined): string[] {
  if (!synonyms) return [];
  return synonyms
    .map((s) => {
      const name = s.value?.name;
      const path = s.value?.path;
      if (!name) return undefined;
      return path ? `${name}->${path}` : name;
    })
    .filter((s): s is string => s !== undefined);
}

/** Extract display strings from Enum synonyms. */
export function enumSynonymsToStrings(synonyms: EnumSynonymShape[] | undefined): string[] {
  if (!synonyms) return [];
  return synonyms
    .flatMap((s) => s.body?.values ?? [])
    .map((v) => {
      if (!v.name) return undefined;
      return v.path ? `${v.name}->${v.path}` : v.name;
    })
    .filter((s): s is string => s !== undefined);
}

// ---------------------------------------------------------------------------
// Member list access (type-aware)
// ---------------------------------------------------------------------------

/**
 * Kind-to-ReactFlow-type mapping. Used to set `Node.type` for
 * component selection, and for display badges.
 */
export const AST_TYPE_TO_NODE_TYPE: Record<string, string> = {
  Data: 'data',
  Choice: 'choice',
  RosettaEnumeration: 'enum',
  RosettaFunction: 'func',
  RosettaRecordType: 'record',
  RosettaTypeAlias: 'typeAlias',
  RosettaBasicType: 'basicType',
  Annotation: 'annotation'
};

export const NODE_TYPE_TO_AST_TYPE: Record<string, string> = {
  data: 'Data',
  choice: 'Choice',
  enum: 'RosettaEnumeration',
  func: 'RosettaFunction',
  record: 'RosettaRecordType',
  typeAlias: 'RosettaTypeAlias',
  basicType: 'RosettaBasicType',
  annotation: 'Annotation'
};
