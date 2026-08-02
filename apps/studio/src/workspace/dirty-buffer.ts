// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Crash-recovery shadow buffers. Each dirty (unsaved) edit is written
 * alongside the workspace at `<wsId>/.studio/dirty/<encoded>` so that a
 * crashed tab can recover the most recent in-progress content on next
 * open (FR-015).
 *
 * Path encoding: real `/` and our `__` separator are escaped via percent-
 * encoding so legitimate paths containing `__` don't collide with the
 * encoded form of `/`. The dirty/ directory is intentionally flat so
 * recovery is one `readdir` + decode pass.
 */

import type { OpfsFs } from '../opfs/opfs-fs.js';
import { withInstrumentation, Capture } from '../services/instrumentation/core.js';

const DIRTY_DIR = '.studio/dirty';

function encodePath(path: string): string {
  // Escape '%' first so we can use it as the marker; then '/' → '__';
  // any literal '__' in the original path is encoded as '%5F%5F' via the
  // initial pass — actually we do the inverse: encode underscores via %5F
  // BEFORE substituting / so the round-trip is unambiguous.
  return path.replace(/%/g, '%25').replace(/_/g, '%5F').replace(/\//g, '__');
}

function decodePath(encoded: string): string {
  return encoded.replace(/__/g, '/').replace(/%5F/g, '_').replace(/%25/g, '%');
}

// `content` is raw model source text — never captured. `wsId`/`path` are
// safe (workspace id + workspace-relative path, uri.ts convention).
export const saveDirtyBuffer = withInstrumentation(
  async function saveDirtyBuffer(fs: OpfsFs, wsId: string, path: string, content: string): Promise<void> {
    const encoded = encodePath(path);
    await fs.writeFile(`/${wsId}/${DIRTY_DIR}/${encoded}`, content);
  },
  {
    op: 'saveDirtyBuffer',
    capture: Capture.Input,
    sanitize: (value, which) => {
      if (which !== 'input') return undefined;
      const [, wsId, path] = value as [OpfsFs, string, string, string];
      return { wsId, path };
    }
  }
);

// Output is raw model source text — never captured.
export const loadDirtyBuffer = withInstrumentation(
  async function loadDirtyBuffer(fs: OpfsFs, wsId: string, path: string): Promise<string | null> {
    const encoded = encodePath(path);
    try {
      const v = await fs.readFile(`/${wsId}/${DIRTY_DIR}/${encoded}`, 'utf8');
      return typeof v === 'string' ? v : new TextDecoder().decode(v);
    } catch {
      return null;
    }
  },
  {
    op: 'loadDirtyBuffer',
    capture: Capture.Input,
    sanitize: (value, which) => {
      if (which !== 'input') return undefined;
      const [, wsId, path] = value as [OpfsFs, string, string];
      return { wsId, path };
    }
  }
);

export const clearDirtyBuffer = withInstrumentation(
  async function clearDirtyBuffer(fs: OpfsFs, wsId: string, path: string): Promise<void> {
    const encoded = encodePath(path);
    try {
      await fs.unlink(`/${wsId}/${DIRTY_DIR}/${encoded}`);
    } catch {
      // Already gone; fine.
    }
  },
  {
    op: 'clearDirtyBuffer',
    capture: Capture.Input,
    sanitize: (value, which) => {
      if (which !== 'input') return undefined;
      const [, wsId, path] = value as [OpfsFs, string, string];
      return { wsId, path };
    }
  }
);

// Output is a list of workspace-relative paths — safe.
export const listDirtyBuffers = withInstrumentation(
  async function listDirtyBuffers(fs: OpfsFs, wsId: string): Promise<string[]> {
    let names: string[];
    try {
      names = await fs.readdir(`/${wsId}/${DIRTY_DIR}`);
    } catch {
      return [];
    }
    return names.map(decodePath);
  },
  {
    op: 'listDirtyBuffers',
    capture: Capture.Output,
    sanitize: (value, which) => (which === 'output' ? value : undefined)
  }
);
