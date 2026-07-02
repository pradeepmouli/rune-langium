// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NODE_MODULES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'node_modules');

/**
 * `mkdtemp` plus a `node_modules` symlink back to this package's own, so a
 * dynamic `import()` of an emitted module written into the dir can resolve
 * bare specifiers (`import { z } from 'zod'`) under NATIVE Node ESM
 * resolution too. The package-level vitest run resolves that import through
 * the Vite module runner (rooted at the project, always finds zod), but the
 * root-level `vitest run --coverage` executes it through Node's own
 * type-stripping loader, where resolution walks up from the OS tmpdir and
 * finds nothing — the CI-only "Cannot find package 'zod' imported from
 * /tmp/..." failure mode.
 */
export async function mkdtempWithNodeModules(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  await symlink(PACKAGE_NODE_MODULES, join(dir, 'node_modules'), 'dir');
  return dir;
}
