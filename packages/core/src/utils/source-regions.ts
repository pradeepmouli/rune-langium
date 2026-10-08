// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { Data, RosettaFunction, RosettaExpression } from '../generated/ast.js';
import type { Dehydrated } from '../serializer/dehydrated.js';
import { CstUtils, isLeafCstNode } from 'langium';

export type SourceRegion = Readonly<{ from: number; to: number }>;
export type ExpressionRegion = Readonly<{
  region: SourceRegion;
  kind: 'alias' | 'precondition' | 'operation' | 'postcondition';
  index: number;
  expression: RosettaExpression;
}>;

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
  if (statements.length === 0) return { from: declaration.to, to: declaration.to };
  const first = getNodeSourceRegion(statements[0]!);
  const afterHeader = (end: number): SourceRegion => {
    const lineEnd = source.indexOf('\n', end);
    return { from: lineEnd >= 0 && lineEnd < first.from ? lineEnd + 1 : first.from, to: declaration.to };
  };
  if ('$cstNode' in func && func.$cstNode) {
    const headerLeaves = CstUtils.streamCst(func.$cstNode)
      .filter(isLeafCstNode)
      .filter((leaf) => !leaf.hidden && leaf.end <= first.from)
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
    .filter((range) => range.end <= first.from);
  if (headerAssignments.length) {
    const headerEnd = Math.max(...headerAssignments.map((range) => range.end));
    return afterHeader(headerEnd);
  }
  let from = source.lastIndexOf('\n', first.from - 1) + 1;
  while (from > declaration.from) {
    const previousEnd = from - 1;
    const previousStart = source.lastIndexOf('\n', previousEnd - 1) + 1;
    const line = source.slice(previousStart, previousEnd).trim();
    if (line && !line.startsWith('//')) break;
    from = previousStart;
  }
  return { from, to: declaration.to };
}

/** Root expressions in grammar order; indexes address their original owner arrays. */
export function getExpressionRegions(owner: Data | RosettaFunction): readonly ExpressionRegion[] {
  const groups: [ExpressionRegion['kind'], readonly { expression: RosettaExpression }[]][] =
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
