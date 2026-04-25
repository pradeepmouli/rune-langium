// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Types for git-based model loading, caching, and progress tracking.
 * @see specs/008-core-editor-features/data-model.md
 */

/** A git repository containing Rune DSL model files. */
export interface ModelSource {
  /** Unique identifier (e.g., "cdm", "fpml", or URL hash) */
  id: string;
  /** Display name (e.g., "CDM", "FpML") */
  name: string;
  /** Public git repository URL (HTTPS). Used by the custom-URL flow (FR-007). */
  repoUrl: string;
  /** Git tag, branch, or commit ref. Used by the custom-URL flow (FR-007). */
  ref: string;
  /** Glob patterns for .rosetta file discovery */
  paths: string[];
  /**
   * Optional CF R2 mirror archive URL (set on curated entries).
   * When present, the curated-loader path uses this instead of the git
   * clone path — feature 012-studio-workspace-ux, FR-006.
   */
  archiveUrl?: string;
}

/** A locally cached model with version tracking. */
export interface CachedModel {
  /** References ModelSource.id */
  sourceId: string;
  /** Git ref that was fetched */
  ref: string;
  /** Actual commit SHA at time of fetch */
  commitHash: string;
  /** Parsed .rosetta file contents */
  files: CachedFile[];
  /** Timestamp of last fetch (epoch ms) */
  fetchedAt: number;
  /** Count of .rosetta files in the model */
  totalFiles: number;
}

/** Individual cached .rosetta file within a model. */
export interface CachedFile {
  /** Relative path within the repository */
  path: string;
  /** Raw .rosetta file content */
  content: string;
  /** Extracted namespace from file */
  namespace: string;
}

/** Progress events yielded during model loading. */
export interface LoadProgress {
  phase: 'fetching' | 'discovering' | 'parsing';
  current: number;
  total: number;
}

/** A fully loaded model with parsed workspace files. */
export interface LoadedModel {
  source: ModelSource;
  commitHash: string;
  files: CachedFile[];
  loadedAt: number;
}

/** Error types for model loading failures. */
export type ModelLoadErrorCode = 'NETWORK' | 'NOT_FOUND' | 'NO_FILES' | 'CANCELLED';

export class ModelLoadError extends Error {
  constructor(
    public readonly code: ModelLoadErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'ModelLoadError';
  }
}
