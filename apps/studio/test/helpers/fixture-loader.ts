/**
 * Fixture loader for studio integration tests (T039).
 *
 * Re-uses the CDM corpus from `.resources/cdm/` at the monorepo root
 * for realistic LSP integration testing.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = resolve(currentDir, '../../../../.resources');

/**
 * Load a single fixture file by relative path.
 *
 * @param relativePath - Path relative to `.resources/` (e.g., 'cdm/base-datetime-type.rosetta')
 */
export async function loadFixture(relativePath: string): Promise<string> {
  const filePath = join(RESOURCES_DIR, relativePath);
  return readFile(filePath, 'utf-8');
}

/**
 * List all `.rosetta` files in a resource subdirectory.
 *
 * @param subdir - Subdirectory name (e.g., 'cdm', 'rune-dsl')
 */
export async function listFixtures(subdir: string): Promise<string[]> {
  const dirPath = join(RESOURCES_DIR, subdir);
  try {
    const entries = await readdir(dirPath);
    return entries.filter((f) => f.endsWith('.rosetta')).sort();
  } catch {
    return [];
  }
}

/**
 * Load all `.rosetta` files from a resource subdirectory.
 *
 * @param subdir - Subdirectory name (e.g., 'cdm')
 * @returns Array of `{ name, content }` objects.
 */
export async function loadAllFixtures(
  subdir: string
): Promise<Array<{ name: string; content: string }>> {
  const filenames = await listFixtures(subdir);
  return Promise.all(
    filenames.map(async (name) => ({
      name,
      content: await loadFixture(join(subdir, name))
    }))
  );
}

/**
 * Load a small subset of CDM files suitable for quick integration tests.
 * Picks files covering data types, enums, and functions.
 */
export async function loadCdmSubset(): Promise<Array<{ name: string; content: string }>> {
  const subset = [
    'base-datetime-type.rosetta',
    'base-datetime-enum.rosetta',
    'base-math-type.rosetta',
    'base-math-enum.rosetta',
    'base-staticdata-asset-common-type.rosetta'
  ];

  const results: Array<{ name: string; content: string }> = [];
  for (const name of subset) {
    try {
      const content = await loadFixture(join('cdm', name));
      results.push({ name, content });
    } catch {
      // Skip missing files gracefully
    }
  }
  return results;
}
