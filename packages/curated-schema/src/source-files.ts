// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import type { CuratedModelId } from './index.js';

const SOURCE_ROOTS: Record<CuratedModelId, string> = {
  cdm: 'rosetta-source/src/main/rosetta/',
  fpml: 'rosetta-source/src/main/rosetta/',
  'rune-dsl': 'rune-runtime/src/main/resources/model/'
};

/** Select production models from an upstream archive, excluding tests and metadata companions. */
export function isCuratedSourceFile(modelId: CuratedModelId, path: string): boolean {
  const normalized = path.replace(/^\.\//, '');
  const relative = normalized.startsWith(SOURCE_ROOTS[modelId])
    ? normalized
    : normalized.slice(normalized.indexOf('/') + 1);
  return (
    relative.startsWith(SOURCE_ROOTS[modelId]) &&
    relative.endsWith('.rosetta') &&
    !relative.split('/').some((part) => part.startsWith('._') || part === '..')
  );
}
