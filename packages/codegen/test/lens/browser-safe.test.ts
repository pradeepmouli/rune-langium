// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const LENS_DIR = join(import.meta.dirname, '../../src/lens');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []
  );
}

// ts-grammar-loader.ts mirrors sql-grammar-loader.ts's precedent: a default
// Node-side WASM-loading path, alongside an explicit-bytes path callers use
// in the browser (see Task 3). Its Node-builtin imports (`node:fs/promises`,
// `node:module`) are dynamic (`await import(...)`), not static `from`
// imports, so it no longer needs an exception here — the regex below only
// matches static `from 'node:...'` imports.
const FS_ALLOWED = new Set<string>([]);

describe('codegen/lens is browser-safe', () => {
  it('imports no ExcelJS in any source file', () => {
    for (const file of walk(LENS_DIR)) {
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} must not import ExcelJS`).not.toMatch(/exceljs/i);
    }
  });

  it('imports no Node built-ins outside the grammar loader', () => {
    for (const file of walk(LENS_DIR)) {
      if (FS_ALLOWED.has(basename(file))) continue;
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} must not import 'fs'/'module'`).not.toMatch(/from ['"]node:(fs|module)(\/promises)?['"]/);
    }
  });
});
