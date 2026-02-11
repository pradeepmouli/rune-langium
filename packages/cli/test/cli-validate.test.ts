import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { runValidate } from '../src/validate.js';

const TMP_DIR = resolve(__dirname, '.tmp-validate-test');

// Self-contained: enum has no cross-references that need resolving
const VALID_ROSETTA = `namespace test.cli
enum Direction:
  North
  South
  East
  West
`;

const DUPLICATE_ATTR_ROSETTA = `namespace test.cli
enum Duplicate:
  Foo
  Foo
`;

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(resolve(TMP_DIR, 'empty'), { recursive: true });
  writeFileSync(resolve(TMP_DIR, 'valid.rosetta'), VALID_ROSETTA);
  writeFileSync(resolve(TMP_DIR, 'duplicates.rosetta'), DUPLICATE_ATTR_ROSETTA);
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('CLI validate command', () => {
  it('should validate a correct .rosetta file and exit 0', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(' '));

    const exitCode = await runValidate([resolve(TMP_DIR, 'valid.rosetta')], {});

    console.log = origLog;
    expect(exitCode).toBe(0);
    expect(logs.some((l) => l.includes('OK'))).toBe(true);
  });

  it('should report validation errors for a file with duplicate enum values and exit 1', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(' '));

    const exitCode = await runValidate([resolve(TMP_DIR, 'duplicates.rosetta')], {});

    console.log = origLog;
    expect(exitCode).toBe(1);
    expect(logs.some((l) => l.includes('ERROR') && l.includes('Duplicate'))).toBe(true);
  });

  it('should discover .rosetta files in a directory', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(' '));

    const exitCode = await runValidate([TMP_DIR], {});

    console.log = origLog;
    // Directory has both valid and invalid files
    expect(exitCode).toBe(1);
  });

  it('should output JSON when --json flag is set', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(' '));

    await runValidate([resolve(TMP_DIR, 'duplicates.rosetta')], { json: true });

    console.log = origLog;
    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty('file');
    expect(parsed[0]).toHaveProperty('diagnostics');
    expect(parsed[0].diagnostics.length).toBeGreaterThan(0);
    expect(parsed[0].diagnostics[0]).toHaveProperty('severity');
    expect(parsed[0].diagnostics[0]).toHaveProperty('message');
    expect(parsed[0].diagnostics[0]).toHaveProperty('line');
  });

  it('should exit 1 when no .rosetta files are found', async () => {
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => errors.push(args.join(' '));

    // Use an empty directory — no .rosetta files inside
    const exitCode = await runValidate([resolve(TMP_DIR, 'empty')], {});

    console.error = origError;
    expect(exitCode).toBe(1);
    expect(errors.some((l) => l.includes('No .rosetta files found'))).toBe(true);
  });
});
