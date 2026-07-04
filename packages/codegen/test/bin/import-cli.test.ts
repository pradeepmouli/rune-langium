// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * CLI integration tests for `rune-codegen import` (specs/021-codegen-inbound
 * Phase 1 T4/T6). No prior CLI test convention exists in this package
 * (`bin/rune-codegen.ts` has no existing test file) — this file spawns the
 * BUILT CLI (`dist/bin/rune-codegen.js`) via `execFile`, mirroring
 * `cdm-smoke.test.ts`'s `runTscNoEmit` child-process pattern. Requires
 * `pnpm --filter @rune-langium/codegen run build` to have run first; skips
 * cleanly (via a `beforeAll` existence check) rather than failing hard when
 * `dist/` is stale/absent, matching this suite's "skip when a prerequisite
 * artifact is absent" convention (see cdm-smoke.test.ts's CDM-fixture
 * `it.todo`s).
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeAll } from 'vitest';
import { parse } from '@rune-langium/core';

const execFileAsync = promisify(execFile);

const PKG_DIR = resolve(new URL('.', import.meta.url).pathname, '../..');
const CLI_PATH = join(PKG_DIR, 'dist/bin/rune-codegen.js');

let cliBuilt = true;
beforeAll(async () => {
  try {
    await access(CLI_PATH);
  } catch {
    cliBuilt = false;
  }
});

const PARTY_SCHEMA = JSON.stringify({
  $id: 'https://example.com/schemas/party.json',
  $defs: {
    Party: {
      type: 'object',
      properties: {
        partyId: { type: 'string' },
        value: { type: 'integer', minimum: 0 }
      },
      required: ['partyId']
    }
  }
});

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI_PATH, ...args]);
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: number; stdout?: string; stderr?: string };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: typeof e.code === 'number' ? e.code : 1 };
  }
}

describe.skipIf(!cliBuilt)('rune-codegen import CLI', () => {
  it('imports a JSON Schema file to stdout and the output parses with zero errors', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-cli-'));
    const schemaPath = join(tmpDir, 'party.json');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    const { stdout, exitCode } = await runCli(['import', schemaPath, '--from', 'json-schema']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('type Party:');
    expect(stdout).toContain('condition ValueRange:');

    const result = await parse(stdout);
    expect(result.hasErrors).toBe(false);
  });

  it('writes to -o <file> and the file parses with zero errors', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-cli-'));
    const schemaPath = join(tmpDir, 'party.json');
    const outPath = join(tmpDir, 'party.rune');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    const { exitCode, stdout } = await runCli(['import', schemaPath, '--from', 'json-schema', '-o', outPath]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(outPath);

    const written = await readFile(outPath, 'utf-8');
    const result = await parse(written);
    expect(result.hasErrors).toBe(false);
  });

  it('rejects an unsupported --from value with exit code 1', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-cli-'));
    const schemaPath = join(tmpDir, 'party.json');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    const { exitCode, stderr } = await runCli(['import', schemaPath, '--from', 'typescript']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not yet supported');
  });

  it('the existing default (outbound) invocation is unaffected by the import subcommand', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-cli-'));
    const runeSource = 'namespace test.clicheck\nversion "0.0.0"\n\ntype Foo:\n  bar string (1..1)\n';
    const runePath = join(tmpDir, 'sample.rune');
    await writeFile(runePath, runeSource, 'utf-8');
    const outDir = join(tmpDir, 'out');

    const { exitCode, stdout } = await runCli([runePath, '-t', 'zod', '-o', outDir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('done');
  });

  it('--namespace overrides $id-derived namespace end to end', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-cli-'));
    const schemaPath = join(tmpDir, 'party.json');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    const { stdout, exitCode } = await runCli([
      'import',
      schemaPath,
      '--from',
      'json-schema',
      '--namespace',
      'my.override'
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('namespace my.override');
  });

  it('--no-synonyms suppresses synonym annotations end to end', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-cli-'));
    const schemaPath = join(tmpDir, 'party.json');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    const { stdout, exitCode } = await runCli(['import', schemaPath, '--from', 'json-schema', '--no-synonyms']);
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('synonym');
  });
});
