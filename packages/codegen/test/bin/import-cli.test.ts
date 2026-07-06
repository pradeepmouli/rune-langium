// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for `rune-codegen import` (specs/021-codegen-inbound Phase 1 T4/T6).
 *
 * Convention: mirrors `packages/cli/test/cli-parse.test.ts` — the action
 * body is exported (`runImport`) and unit-tested directly, no process
 * spawning, no built `dist/` dependency. A couple of thin process-spawn
 * smoke tests are kept separately (see the second `describe` below) purely
 * to prove the actual commander wiring in `bin/rune-codegen.ts` — most
 * notably the `--out-file` (not `--output`/`-o`) naming, which exists
 * because of a real commander gotcha: a subcommand option colliding with a
 * PARENT option on either the short flag OR the long name silently drops
 * its own value (see the comment in `bin/rune-codegen.ts` above the
 * `import` subcommand's `.option('--out-file ...)` line) — that class of
 * bug can only be caught by actually invoking commander's parser, not by
 * calling `runImport` directly.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parse } from '@rune-langium/core';
import { runImport } from '../../src/import/cli.js';

const execFileAsync = promisify(execFile);

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

function baseOpts(): Parameters<typeof runImport>[1] {
  return { from: 'json-schema', synonyms: true, conditions: true, onUntranslatable: 'stub' };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runImport (direct — no process spawn)', () => {
  it('imports a JSON Schema file to stdout and the output parses with zero errors', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-'));
    const schemaPath = join(tmpDir, 'party.json');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    let stdout = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runImport(schemaPath, baseOpts());
    expect(exitCode).toBe(0);
    expect(stdout).toContain('type Party:');
    expect(stdout).toContain('condition ValueRange:');

    const result = await parse(stdout);
    expect(result.hasErrors).toBe(false);
  });

  it('writes to outFile and the file parses with zero errors', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-'));
    const schemaPath = join(tmpDir, 'party.json');
    const outPath = join(tmpDir, 'party.rune');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    const exitCode = await runImport(schemaPath, { ...baseOpts(), outFile: outPath });
    expect(exitCode).toBe(0);

    const written = await readFile(outPath, 'utf-8');
    const result = await parse(written);
    expect(result.hasErrors).toBe(false);
  });

  it('rejects an unsupported --from value with exit code 1', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-'));
    const schemaPath = join(tmpDir, 'party.json');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    let stderr = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    });

    const exitCode = await runImport(schemaPath, { ...baseOpts(), from: 'typescript' });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('not yet supported');
  });

  it('--namespace overrides $id-derived namespace', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-'));
    const schemaPath = join(tmpDir, 'party.json');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    let stdout = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runImport(schemaPath, { ...baseOpts(), namespace: 'my.override' });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('namespace my.override');
  });

  it('synonyms: false suppresses synonym annotations', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-'));
    const schemaPath = join(tmpDir, 'party.json');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    let stdout = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runImport(schemaPath, { ...baseOpts(), synonyms: false });
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('synonym');
  });

  it('conditions: false performs a structural-only import', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-'));
    const schemaPath = join(tmpDir, 'party.json');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    let stdout = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runImport(schemaPath, { ...baseOpts(), conditions: false });
    expect(exitCode).toBe(0);
    expect(stdout).not.toContain('condition ');
  });

  it('a nonexistent input file returns exit code 1 with a clear error, not a throw', async () => {
    let stderr = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    });

    const exitCode = await runImport('/nonexistent/path/schema.json', baseOpts());
    expect(exitCode).toBe(1);
    expect(stderr.length).toBeGreaterThan(0);
  });

  it('--from openapi imports a YAML OpenAPI document and produces zero-parse-error .rune output (T4)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-'));
    const specPath = join(tmpDir, 'petstore.yaml');
    await writeFile(
      specPath,
      [
        'openapi: 3.0.3',
        'info:',
        '  title: CLI Openapi Demo',
        '  version: 1.0.0',
        'paths: {}',
        'components:',
        '  schemas:',
        '    Party:',
        '      type: object',
        '      required: [partyId]',
        '      properties:',
        '        partyId: { type: string }',
        '        value: { type: integer, minimum: 0 }',
        ''
      ].join('\n'),
      'utf-8'
    );

    let stdout = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runImport(specPath, { ...baseOpts(), from: 'openapi' });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('type Party:');
    expect(stdout).toContain('synonym source OpenApi');

    const result = await parse(stdout);
    expect(result.hasErrors).toBe(false);
  });

  it('--from sql imports a CREATE TABLE script and produces zero-parse-error .rune output (T3, Phase 2c)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-'));
    const ddlPath = join(tmpDir, 'party.sql');
    await writeFile(
      ddlPath,
      `CREATE TABLE party (id INT PRIMARY KEY, party_id TEXT NOT NULL, value NUMERIC CHECK (value >= 0))`,
      'utf-8'
    );

    let stdout = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runImport(ddlPath, { ...baseOpts(), from: 'sql', namespace: 'test.sql.cli' });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('type Party:');
    expect(stdout).toContain('synonym source Sql');
    expect(stdout).toContain('condition ValueRange:');

    const result = await parse(stdout);
    expect(result.hasErrors).toBe(false);
  });

  it('--from sql without --namespace fails with a clear error (exit code 1, not a throw)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-'));
    const ddlPath = join(tmpDir, 'party.sql');
    await writeFile(ddlPath, `CREATE TABLE party (id INT PRIMARY KEY)`, 'utf-8');

    let stderr = '';
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      stderr += String(chunk);
      return true;
    });

    const exitCode = await runImport(ddlPath, { ...baseOpts(), from: 'sql' });
    expect(exitCode).toBe(1);
    expect(stderr).toContain('requires --namespace');
  });

  it('--from sql --sql-dialect sqlserver imports NVARCHAR/DECIMAL DDL cleanly', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-'));
    const ddlPath = join(tmpDir, 'party.sql');
    await writeFile(
      ddlPath,
      `CREATE TABLE party (id INT PRIMARY KEY, name NVARCHAR(100) NOT NULL, amount DECIMAL(18,4))`,
      'utf-8'
    );

    let stdout = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });

    const exitCode = await runImport(ddlPath, {
      ...baseOpts(),
      from: 'sql',
      namespace: 'test.sql.dialect',
      sqlDialect: 'sqlserver'
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('name string (1..1)');

    const result = await parse(stdout);
    expect(result.hasErrors).toBe(false);
  });
});

// ---- thin process-spawn smoke tests: prove the actual commander wiring ----

const PKG_DIR = resolve(new URL('.', import.meta.url).pathname, '../..');
const CLI_PATH = join(PKG_DIR, 'dist/bin/rune-codegen.js');

// `describe.skipIf` evaluates its condition at COLLECTION time, before any
// `beforeAll` hook runs — an async `access()` check inside `beforeAll` never
// resolves in time to gate it (verified empirically). `existsSync` at
// module scope is synchronous and actually gates correctly.
const cliBuilt = existsSync(CLI_PATH);

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [CLI_PATH, ...args]);
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { code?: number; stdout?: string; stderr?: string };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: typeof e.code === 'number' ? e.code : 1 };
  }
}

describe.skipIf(!cliBuilt)('rune-codegen CLI wiring (process spawn — commander integration only)', () => {
  it('import subcommand dispatches and --out-file writes a file (proves the -o/--output collision fix)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-wiring-'));
    const schemaPath = join(tmpDir, 'party.json');
    const outPath = join(tmpDir, 'party.rune');
    await writeFile(schemaPath, PARTY_SCHEMA, 'utf-8');

    const { exitCode, stdout } = await runCli(['import', schemaPath, '--from', 'json-schema', '--out-file', outPath]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(outPath);

    const written = await readFile(outPath, 'utf-8');
    const result = await parse(written);
    expect(result.hasErrors).toBe(false);
  });

  it('the existing default (outbound) invocation is unaffected by the import subcommand registration', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-wiring-'));
    const runeSource = 'namespace test.clicheck\nversion "0.0.0"\n\ntype Foo:\n  bar string (1..1)\n';
    const runePath = join(tmpDir, 'sample.rune');
    await writeFile(runePath, runeSource, 'utf-8');
    const outDir = join(tmpDir, 'out');

    const { exitCode, stdout } = await runCli([runePath, '-t', 'zod', '-o', outDir]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('done');
  });

  it('-t sql (and other already-shipped, previously CLI-rejected targets) is accepted, not "unknown target"', async () => {
    // Real bug found via review: runDefault's target validation used a
    // hand-maintained ['zod', 'json-schema', 'typescript'] list that was
    // never updated when sql/excel/openapi/xsd shipped their own real
    // emitters — the CLI's own front door rejected them with "unknown
    // target" before ever reaching the generator, even though `generate()`
    // itself fully supported them. Fixed by deriving from
    // IMPLEMENTED_TARGETS (generator.ts's own emitter-registry-derived
    // list) instead. This test exercises the REAL commander-parsed CLI
    // process, not just runGenerate() directly, since the bug lived
    // entirely in bin/rune-codegen.ts's own pre-generate validation.
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-wiring-'));
    const runeSource = 'namespace test.clicheck.sql\nversion "0.0.0"\n\ntype Foo:\n  bar string (1..1)\n';
    const runePath = join(tmpDir, 'sample.rune');
    await writeFile(runePath, runeSource, 'utf-8');
    const outDir = join(tmpDir, 'out');

    const { exitCode, stdout, stderr } = await runCli([runePath, '-t', 'sql', '-o', outDir]);
    expect(stderr).not.toContain('unknown target');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('done');
  });

  it('a genuinely unknown target is still rejected with a clear error and exit code 2', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-wiring-'));
    const runeSource = 'namespace test.clicheck.bogus\nversion "0.0.0"\n\ntype Foo:\n  bar string (1..1)\n';
    const runePath = join(tmpDir, 'sample.rune');
    await writeFile(runePath, runeSource, 'utf-8');
    const outDir = join(tmpDir, 'out');

    const { exitCode, stderr } = await runCli([runePath, '-t', 'bogus-target', '-o', outDir]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("unknown target 'bogus-target'");
  });

  it('--from openapi dispatches through the real CLI process and writes a zero-parse-error .rune file (T4)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-wiring-'));
    const specPath = join(tmpDir, 'petstore.yaml');
    const outPath = join(tmpDir, 'petstore.rune');
    await writeFile(
      specPath,
      [
        'openapi: 3.0.3',
        'info:',
        '  title: Wiring Openapi Demo',
        '  version: 1.0.0',
        'paths: {}',
        'components:',
        '  schemas:',
        '    Party:',
        '      type: object',
        '      required: [partyId]',
        '      properties:',
        '        partyId: { type: string }',
        ''
      ].join('\n'),
      'utf-8'
    );

    const { exitCode, stdout } = await runCli(['import', specPath, '--from', 'openapi', '--out-file', outPath]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(outPath);

    const written = await readFile(outPath, 'utf-8');
    const result = await parse(written);
    expect(result.hasErrors).toBe(false);
  });

  it('--from sql --sql-dialect dispatches through the real CLI process and writes a zero-parse-error .rune file (T3, Phase 2c)', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'rune-codegen-import-wiring-'));
    const ddlPath = join(tmpDir, 'party.sql');
    const outPath = join(tmpDir, 'party.rune');
    await writeFile(ddlPath, `CREATE TABLE party (id INT PRIMARY KEY, name TEXT NOT NULL)`, 'utf-8');

    const { exitCode, stdout } = await runCli([
      'import',
      ddlPath,
      '--from',
      'sql',
      '--namespace',
      'test.sql.wiring',
      '--sql-dialect',
      'postgres',
      '--out-file',
      outPath
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain(outPath);

    const written = await readFile(outPath, 'utf-8');
    const result = await parse(written);
    expect(result.hasErrors).toBe(false);
    expect(written).toContain('type Party:');
  });
});
