// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { mkdtempSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Compile and execute generated modules against the package's installed dependencies. */
export function generatedDirectory(prefix: string): string {
  const directory = mkdtempSync(prefix);
  symlinkSync(fileURLToPath(new URL('../../node_modules', import.meta.url)), join(directory, 'node_modules'), 'dir');
  return directory;
}
