// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { AstUtils, type AstNode } from 'langium';
import { getNodeSourceRegion } from '@rune-langium/core';
import type { GeneratorOutput } from '../types.js';
import { RUNTIME_HELPER_JS_SOURCE } from '../helpers.js';
import type { EmittedProjection, GeneratedProjection, ProjectionSubject } from './types.js';

const runtimeNames = [
  ...new Set(Array.from(RUNTIME_HELPER_JS_SOURCE.matchAll(/\b(?:const|function) (rune\w+)/g), (match) => match[1]!))
];

/** Metadata only: code always comes from the authoritative emitter's traversal. */
export function emittedTypeScriptProjection(
  node: AstNode,
  code: string,
  kind: EmittedProjection['kind']
): EmittedProjection | undefined {
  let document;
  let region;
  try {
    document = AstUtils.getDocument(node);
    region = getNodeSourceRegion(node);
  } catch {
    // Synthetic model builders may deliberately omit original source coordinates.
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

/** Select recorded output; display availability is independent of inverse-lens coverage. */
export function selectTypeScriptProjection(
  outputs: readonly GeneratorOutput[],
  subject: ProjectionSubject,
  kind: EmittedProjection['kind']
): GeneratedProjection {
  const fragment = outputs
    .flatMap((output) => output.projections ?? [])
    .find(
      (entry) =>
        entry.kind === kind &&
        entry.source.uri === subject.uri &&
        (kind === 'condition'
          ? entry.source.region.from === subject.region.from && entry.source.region.to === subject.region.to
          : entry.source.region.from <= subject.region.from && entry.source.region.to >= subject.region.to)
    );
  if (!fragment) {
    const error = outputs.flatMap((output) => output.diagnostics).find((entry) => entry.severity === 'error');
    throw new Error(error?.message ?? `No generated ${kind} matches the current source region.`);
  }
  return {
    language: 'typescript',
    subject,
    code: fragment.code,
    sourceMap: fragment.sourceMap,
    requiredHelpers: runtimeNames.filter((name) => new RegExp(`\\b${name}\\b`).test(fragment.code))
  };
}
