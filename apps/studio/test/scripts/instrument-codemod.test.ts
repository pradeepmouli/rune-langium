// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodemod } from '../../scripts/instrument-codemod.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codemod-test-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runCodemod', () => {
  it('wraps an exported function declaration in withInstrumentation', () => {
    const file = join(dir, 'sample.ts');
    writeFileSync(file, 'export function add(a: number, b: number): number {\n  return a + b;\n}\n');
    runCodemod(file);
    const rewritten = readFileSync(file, 'utf-8');
    expect(rewritten).toContain('withInstrumentation(');
    expect(rewritten).toContain("op: 'add'");
  });

  it('is idempotent — running twice does not double-wrap', () => {
    const file = join(dir, 'sample2.ts');
    writeFileSync(file, 'export function sub(a: number, b: number): number {\n  return a - b;\n}\n');
    runCodemod(file);
    const once = readFileSync(file, 'utf-8');
    runCodemod(file);
    const twice = readFileSync(file, 'utf-8');
    expect(twice).toBe(once);
  });
});
