// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { Data, RosettaFunction, RosettaExpression, RosettaModel } from '../generated/ast.js';
import type { Dehydrated } from '../serializer/dehydrated.js';
import { CstUtils, isLeafCstNode } from 'langium';

export type SourceRegion = Readonly<{ from: number; to: number }>;
export type ExpressionRegion = Readonly<{
  region: SourceRegion;
  kind: 'alias' | 'precondition' | 'operation' | 'postcondition';
  index: number;
  expression: RosettaExpression | Dehydrated<RosettaExpression>;
}>;

/** Resolve an expression owner by declaration identity; ambiguous kindless names fail closed. */
export function findExpressionOwner(
  model: Pick<RosettaModel, 'elements'>,
  identity: { name: string; kind?: string }
): Data | RosettaFunction | undefined {
  const matches = model.elements.filter(
    (element): element is Data | RosettaFunction =>
      (element.$type === 'Data' || element.$type === 'RosettaFunction') &&
      element.name === identity.name &&
      (identity.kind === undefined || element.$type === identity.kind)
  );
  return matches.length === 1 ? matches[0] : undefined;
}

type LocatedNode = {
  $cstNode?: { offset: number; end: number };
  $cstRange?: { offset: number; end: number };
  $textRegion?: { offset: number; end: number };
};

/** Original UTF-16 range, shared by parsed and serialized model consumers. */
export function getNodeSourceRegion(node: LocatedNode): SourceRegion {
  const range = node.$cstNode ?? node.$cstRange ?? node.$textRegion;
  if (
    !range ||
    !Number.isInteger(range.offset) ||
    !Number.isInteger(range.end) ||
    range.offset < 0 ||
    range.offset > range.end
  ) {
    throw new Error('Source coordinates are unavailable for this declaration');
  }
  return { from: range.offset, to: range.end };
}

/** Implementation range excludes the signature and retains preceding body comments. */
export function getFunctionImplementationRegion(
  func: RosettaFunction | Dehydrated<RosettaFunction>,
  source: string
): SourceRegion {
  const declaration = getNodeSourceRegion(func);
  const statements = [...func.shortcuts, ...func.conditions, ...func.operations, ...func.postConditions];
  const declarationIndent = declaration.from - (source.lastIndexOf('\n', declaration.from - 1) + 1);
  const trailingComment = /\s*(\/\*[\s\S]*?\*\/|\/\/[^\r\n]*)/y;
  let to = declaration.to;
  for (;;) {
    trailingComment.lastIndex = to;
    const match = trailingComment.exec(source);
    if (!match) break;
    const commentStart = match.index + match[0].length - match[1]!.length;
    const lineStart = source.lastIndexOf('\n', commentStart - 1) + 1;
    // Later top-level comments belong to the following declaration, not this body.
    if (lineStart > to && commentStart - lineStart <= declarationIndent) break;
    to = trailingComment.lastIndex;
  }
  const firstFrom = statements.length ? getNodeSourceRegion(statements[0]!).from : to;
  const afterHeader = (end: number): SourceRegion => {
    const lineEnd = source.indexOf('\n', end);
    const sameLineEnd = lineEnd >= 0 ? Math.min(lineEnd, firstFrom) : firstFrom;
    const comment = source.slice(end, sameLineEnd).search(/\/[/*]/);
    return {
      from: comment >= 0 ? end + comment : lineEnd >= 0 && lineEnd < firstFrom ? lineEnd + 1 : firstFrom,
      to
    };
  };
  if (statements.length === 0) return afterHeader(declaration.to);
  if ('$cstNode' in func && func.$cstNode) {
    const headerLeaves = CstUtils.streamCst(func.$cstNode)
      .filter(isLeafCstNode)
      .filter((leaf) => !leaf.hidden && leaf.end <= firstFrom)
      .toArray();
    const headerLeaf = headerLeaves[headerLeaves.length - 1];
    if (headerLeaf) {
      return afterHeader(headerLeaf.end);
    }
  }
  const textRegion = (func as { $textRegion?: { assignments?: Record<string, { offset: number; end: number }[]> } })
    .$textRegion;
  const headerAssignments = Object.values(textRegion?.assignments ?? {})
    .flat()
    .filter((range) => range.end <= firstFrom);
  if (headerAssignments.length) {
    const headerEnd = Math.max(...headerAssignments.map((range) => range.end));
    return afterHeader(headerEnd);
  }
  let from = source.lastIndexOf('\n', firstFrom - 1) + 1;
  while (from > declaration.from) {
    const previousEnd = from - 1;
    const previousStart = source.lastIndexOf('\n', previousEnd - 1) + 1;
    const line = source.slice(previousStart, previousEnd).trim();
    if (line && !line.startsWith('//')) break;
    from = previousStart;
  }
  return { from, to };
}

/** Root expressions in grammar order; indexes address their original owner arrays. */
export function getExpressionRegions(
  owner: Data | RosettaFunction | Dehydrated<Data> | Dehydrated<RosettaFunction>
): readonly ExpressionRegion[] {
  const groups: [
    ExpressionRegion['kind'],
    readonly { expression: RosettaExpression | Dehydrated<RosettaExpression> }[]
  ][] =
    owner.$type === 'RosettaFunction'
      ? [
          ['alias', owner.shortcuts],
          ['precondition', owner.conditions],
          ['operation', owner.operations],
          ['postcondition', owner.postConditions]
        ]
      : [['precondition', owner.conditions]];
  return groups.flatMap(([kind, nodes]) =>
    nodes.map(({ expression }, index) => ({ kind, index, expression, region: getNodeSourceRegion(expression) }))
  );
}
