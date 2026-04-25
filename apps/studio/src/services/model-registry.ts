// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Curated registry of well-known Rune DSL model repositories.
 * @see specs/008-core-editor-features/data-model.md — ModelRegistry, ModelSource
 */

import type { ModelSource } from '../types/model-types.js';

const MIRROR_BASE = 'https://www.daikonic.dev/curated';

/**
 * Built-in curated model sources. The `archiveUrl` is the preferred load path
 * (CF R2 mirror — FR-006); `repoUrl`/`ref` are kept for the custom-URL flow
 * (FR-007) and as a documentation pointer to upstream.
 */
const CURATED_MODELS: readonly ModelSource[] = [
  {
    id: 'cdm',
    name: 'CDM (Common Domain Model)',
    repoUrl: 'https://github.com/REGnosys/rosetta-cdm.git',
    ref: 'master',
    paths: ['rosetta-source/src/main/rosetta/**/*.rosetta'],
    archiveUrl: `${MIRROR_BASE}/cdm/latest.tar.gz`
  },
  {
    id: 'fpml',
    name: 'Rune FpML',
    repoUrl: 'https://github.com/finos/rune-fpml.git',
    ref: 'main',
    paths: ['src/main/rosetta/**/*.rosetta'],
    archiveUrl: `${MIRROR_BASE}/fpml/latest.tar.gz`
  },
  {
    id: 'rune-dsl',
    name: 'Rune DSL (Built-in Types)',
    repoUrl: 'https://github.com/REGnosys/rosetta-dsl.git',
    ref: 'master',
    paths: ['rosetta-lang/src/main/resources/**/*.rosetta'],
    archiveUrl: `${MIRROR_BASE}/rune-dsl/latest.tar.gz`
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
