/**
 * Curated registry of well-known Rune DSL model repositories.
 * @see specs/008-core-editor-features/data-model.md — ModelRegistry, ModelSource
 */

import type { ModelSource } from '../types/model-types.js';

/** Built-in curated model sources. */
const CURATED_MODELS: readonly ModelSource[] = [
  {
    id: 'cdm',
    name: 'CDM (Common Domain Model)',
    repoUrl: 'https://github.com/REGnosys/rosetta-cdm.git',
    ref: 'master',
    paths: ['rosetta-source/src/main/rosetta/**/*.rosetta']
  },
  {
    id: 'fpml',
    name: 'Rune FpML',
    repoUrl: 'https://github.com/finos/rune-fpml.git',
    ref: 'main',
    paths: ['src/main/rosetta/**/*.rosetta']
  },
  {
    id: 'rune-dsl',
    name: 'Rune DSL (Built-in Types)',
    repoUrl: 'https://github.com/REGnosys/rosetta-dsl.git',
    ref: 'master',
    paths: ['rosetta-lang/src/main/resources/**/*.rosetta']
  }
] as const;

/** Returns the curated list of well-known model sources. */
export function getModelRegistry(): readonly ModelSource[] {
  return CURATED_MODELS;
}

/** Look up a curated model by ID. */
export function getModelSource(id: string): ModelSource | undefined {
  return CURATED_MODELS.find((m) => m.id === id);
}

/**
 * Create a custom ModelSource from a user-provided URL.
 * Uses a hash of the URL as the ID.
 */
export function createCustomModelSource(
  repoUrl: string,
  ref: string = 'main',
  paths: string[] = ['**/*.rosetta']
): ModelSource {
  const id = `custom-${hashUrl(repoUrl)}`;
  const name = extractRepoName(repoUrl);
  return { id, name, repoUrl, ref, paths };
}

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function extractRepoName(url: string): string {
  const match = url.match(/\/([^/]+?)(?:\.git)?$/);
  return match?.[1] ?? url;
}
