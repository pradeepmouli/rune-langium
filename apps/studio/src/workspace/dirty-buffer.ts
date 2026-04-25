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

export async function saveDirtyBuffer(
  fs: OpfsFs,
  wsId: string,
  path: string,
  content: string
): Promise<void> {
  const encoded = encodePath(path);
  await fs.writeFile(`/${wsId}/${DIRTY_DIR}/${encoded}`, content);
}

export async function loadDirtyBuffer(
  fs: OpfsFs,
  wsId: string,
  path: string
): Promise<string | null> {
  const encoded = encodePath(path);
  try {
    const v = await fs.readFile(`/${wsId}/${DIRTY_DIR}/${encoded}`, 'utf8');
    return typeof v === 'string' ? v : new TextDecoder().decode(v);
  } catch {
    return null;
  }
}

export async function clearDirtyBuffer(fs: OpfsFs, wsId: string, path: string): Promise<void> {
  const encoded = encodePath(path);
  try {
    await fs.unlink(`/${wsId}/${DIRTY_DIR}/${encoded}`);
  } catch {
    // Already gone; fine.
  }
}

export async function listDirtyBuffers(fs: OpfsFs, wsId: string): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.readdir(`/${wsId}/${DIRTY_DIR}`);
  } catch {
    return [];
  }
  return names.map(decodePath);
}
