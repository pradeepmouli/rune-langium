// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { AstUtils, type AstNode } from 'langium';
import { getNodeSourceRegion } from '@rune-langium/core';
import type { EmittedProjection, ProjectionSubject } from './types.js';

/** Record original source identity alongside authoritative generated text. */
export function recordedProjection(
  node: AstNode,
  code: string,
  kind: EmittedProjection['kind']
): EmittedProjection | undefined {
  let document, region;
  try {
    document = AstUtils.getDocument(node);
    region = getNodeSourceRegion(node);
  } catch {
    return undefined;
  }
  const serialized = node as AstNode & { $textRegion?: { range?: { start: { line: number; character: number } } } };
  const start =
    node.$cstNode?.range.start ?? serialized.$textRegion?.range?.start ?? document.textDocument.positionAt(region.from);
  const uri = document.uri.toString();
  return {
    kind,
    source: { uri, region },
    code,
    sourceMap: [{ outputLine: 0, sourceUri: uri, sourceLine: start.line + 1, sourceChar: start.character + 1 }]
  };
}

export function findProjectionFragment(
  projections: readonly EmittedProjection[],
  subject: ProjectionSubject,
  kind: EmittedProjection['kind']
): EmittedProjection | undefined {
  return projections.find(
    (entry) =>
      entry.kind === kind &&
      entry.source.uri === subject.uri &&
      (kind === 'condition'
        ? entry.source.region.from === subject.region.from && entry.source.region.to === subject.region.to
        : entry.source.region.from <= subject.region.from && entry.source.region.to >= subject.region.to)
  );
}
