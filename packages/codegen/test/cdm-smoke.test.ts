// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CDM Smoke Test Suite.
 *
 * Validates that the generator produces TypeScript-compilable Zod schemas
 * from the curated CDM schema fixtures, and that the JSON battery cases
 * parse correctly.
 *
 * Phase 2: All tests are .todo — the emitter lands in Phase 3 (US1).
 * Phase 3 will activate the Zod-target section (T046).
 *
 * SC-002: tsc --noEmit over generated output must pass with zero errors.
 * FR-023: Generated Zod schemas must compile with tsc.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, it } from 'vitest';
import type { GeneratorOutput } from '../src/types.js';

const execFileAsync = promisify(execFile);

/**
 * Runs `tsc --project <tsconfigPath> --noEmit` in the given working directory
 * and returns the exit code and stderr output.
 *
 * Used in Phase 3+ to verify that generated Zod schemas compile cleanly.
 * SC-002.
 *
 * @param tsconfigPath - Path to the tsconfig file to use.
 * @param cwd - Working directory for the tsc invocation.
 */
export async function runTscNoEmit(
  tsconfigPath: string,
  cwd: string
): Promise<{ exitCode: number; stderr: string }> {
  try {
    await execFileAsync('tsc', ['--project', tsconfigPath, '--noEmit'], { cwd });
    return { exitCode: 0, stderr: '' };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & { code?: number; stderr?: string };
    return {
      exitCode: typeof error.code === 'number' ? error.code : 1,
      stderr: error.stderr ?? ''
    };
  }
}

/**
 * Runs a JSON battery against a generated Zod schema using Zod's safeParse.
 * Returns counts of passing and failing cases.
 *
 * Used in Phase 4+ to verify condition semantics.
 *
 * @param schema - A Zod schema object (z.ZodType).
 * @param validCases - JSON payloads that should parse successfully.
 * @param invalidCases - JSON payloads that should fail to parse.
 */
export function runJsonBattery(
  schema: { safeParse: (input: unknown) => { success: boolean } },
  validCases: unknown[],
  invalidCases: unknown[]
): { pass: number; fail: number } {
  let pass = 0;
  let fail = 0;

  for (const c of validCases) {
    if (schema.safeParse(c).success) pass++;
    else fail++;
  }
  for (const c of invalidCases) {
    if (!schema.safeParse(c).success) pass++;
    else fail++;
  }

  return { pass, fail };
}

// Type alias for generator output (used in activated phases)
type GeneratorOutputArray = GeneratorOutput[];
void (null as unknown as GeneratorOutputArray); // suppress unused type warning

describe('cdm-smoke: Zod target', () => {
  it.todo('generates Zod schemas for the full CDM curated schema (SC-002)');
  it.todo('tsc --noEmit over generated Zod output exits 0 (FR-023)');
  it.todo('generated Zod schemas parse valid CDM JSON payloads');
  it.todo('generated Zod schemas reject invalid CDM JSON payloads');
  it.todo('generation is deterministic: identical input produces byte-identical output (SC-007)');
  it.todo('generation completes within 5 seconds for the full CDM namespace set (SC-009)');
});

describe('cdm-smoke: json-schema target', () => {
  it.todo('generates JSON Schema for the full CDM curated schema');
  it.todo('generated JSON Schema is valid draft 2020-12');
  it.todo('generated JSON Schema accepts valid CDM JSON payloads (ajv)');
  it.todo('generated JSON Schema rejects invalid CDM JSON payloads (ajv)');
});

describe('cdm-smoke: typescript target', () => {
  it.todo('generates TypeScript interfaces and classes for the full CDM curated schema');
  it.todo('tsc --noEmit over generated TypeScript output exits 0');
  it.todo('generated TypeScript funcs are callable at runtime');
});
