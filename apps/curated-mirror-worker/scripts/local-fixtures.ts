// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { CuratedModelId } from '@rune-langium/curated-schema';

function loadResourceTree(
  resourcesRoot: string,
  resourceSubdir: string,
  archiveWrapper: string
): Record<string, string> {
  const root = join(resourcesRoot, resourceSubdir);
  // Report missing clones before archive creation obscures the setup error.
  try {
    const st = statSync(root);
    if (!st.isDirectory()) {
      throw new Error(`.resources/${resourceSubdir} exists but is not a directory`);
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'ENOENT') {
      throw new Error(
        `[seed] Missing corpus directory: ${root}\n` +
          `       The '.resources/' tree is gitignored and must be populated locally before\n` +
          `       running 'seed:local'. Expected subdirectory: .resources/${resourceSubdir}/\n` +
          `       Populate it by cloning the upstream model repo into that location, e.g.:\n` +
          `         git clone https://github.com/finos/common-domain-model .resources/cdm\n` +
          `         git clone https://github.com/finos/rune-dsl .resources/rune-dsl\n` +
          `         git clone https://github.com/finos/rune-fpml .resources/rune-fpml\n` +
          `       (The seed walks each subtree recursively for *.rosetta files.)`
      );
    }
    throw err;
  }

  // Preserve repository-relative paths beneath one archive wrapper.
  const out: Record<string, string> = {};
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!st.isFile() || !name.endsWith('.rosetta')) continue;
      // Preserve nested path relative to the resource root so the archive
      // mirrors the on-disk layout. Posix separators (`/`) are required by
      // tar; relative() uses platform separators on Windows so normalize.
      const rel = relative(root, full).split(/[\\/]/).join('/');
      out[`${archiveWrapper}/${rel}`] = readFileSync(full, 'utf8');
    }
  }

  if (Object.keys(out).length === 0) {
    throw new Error(
      `[seed] No *.rosetta files found under ${root}.\n` +
        `       The directory exists but contains no Rosetta sources. Verify the corpus\n` +
        `       was cloned completely and that '*.rosetta' files are present somewhere\n` +
        `       under .resources/${resourceSubdir}/.`
    );
  }

  return out;
}

/** Read repository-root clones while preserving their upstream archive layout. */
export function loadLocalFixtures(resourcesRoot: string): Record<CuratedModelId, Record<string, string>> {
  return {
    cdm: loadResourceTree(resourcesRoot, 'cdm', 'common-domain-model-local'),
    fpml: loadResourceTree(resourcesRoot, 'rune-fpml', 'fpml-local'),
    'rune-dsl': loadResourceTree(resourcesRoot, 'rune-dsl', 'rune-dsl-local')
  };
}
