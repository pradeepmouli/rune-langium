// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Model loader — routes to the appropriate load path based on the source.
 *
 * - If `source.archiveUrl` is set AND `options.archiveLoader` is supplied,
 *   routes to the curated-archive (CF R2) path. This is the only supported
 *   path for deployed Studio.
 * - If neither condition is met, throws NETWORK — non-curated git-clone is
 *   not supported in production builds.
 *
 * @see specs/008-core-editor-features/contracts/model-loader-api.md
 */

import type { ModelSource, LoadProgress, LoadedModel } from '../types/model-types.js';
import { ModelLoadError } from '../types/model-types.js';

interface LoadOptions {
  signal?: AbortSignal;
  useCache?: boolean;
  onProgress?: (progress: LoadProgress) => void;
  /**
   * When `source.archiveUrl` is set (curated entries on the deployed CF
   * site), the caller can supply a curated-archive loader to short-circuit
   * the git-clone path. Dependency-injected so this module stays decoupled
   * from OPFS imports — the actual implementation lives in
   * `./curated-loader.ts` and is wired by the component layer
   * (ModelLoader.tsx).
   */
  archiveLoader?: (
    source: ModelSource,
    opts: { signal?: AbortSignal; onProgress?: (p: LoadProgress) => void }
  ) => Promise<LoadedModel>;
}

/**
 * Load a Rune DSL model.
 *
 * Only the curated-archive path (archiveUrl + archiveLoader) is supported
 * in deployed Studio. Non-curated sources throw NETWORK immediately.
 *
 * The progress + cancellation surface is identical across both paths.
 */
export async function loadModel(source: ModelSource, options: LoadOptions = {}): Promise<LoadedModel> {
  const { signal, onProgress, archiveLoader } = options;

  if (source.archiveUrl && archiveLoader) {
    if (signal?.aborted) throw new ModelLoadError('CANCELLED', 'Load cancelled');
    return archiveLoader(source, { signal, onProgress });
  }

  // Check cancellation
  if (signal?.aborted) {
    throw new ModelLoadError('CANCELLED', 'Load cancelled');
  }

  // Non-curated sources are not supported — Studio exclusively serves
  // curated archives. Callers must supply both source.archiveUrl and
  // options.archiveLoader to reach the fast CF R2 path.
  throw new ModelLoadError(
    'NETWORK',
    `No archive loader available for "${source.name}". Only curated archive sources are supported in this build.`
  );
}
