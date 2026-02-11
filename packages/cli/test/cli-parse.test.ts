import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { runParse } from '../src/parse.js';

const TMP_DIR = resolve(__dirname, '.tmp-parse-test');

const VALID_ROSETTA = `namespace test.cli
type Foo:
  bar string (1..1)
`;

const INVALID_ROSETTA = `namespace test.cli
type Foo:
  bar string @@@ invalid
`;

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(resolve(TMP_DIR, 'valid.rosetta'), VALID_ROSETTA);
  writeFileSync(resolve(TMP_DIR, 'invalid.rosetta'), INVALID_ROSETTA);
  writeFileSync(resolve(TMP_DIR, 'not-rosetta.txt'), 'hello');
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('CLI parse command', () => {
  it('should parse a valid .rosetta file and exit 0', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(' '));

    const exitCode = await runParse([resolve(TMP_DIR, 'valid.rosetta')], {});

    console.log = origLog;
    expect(exitCode).toBe(0);
    expect(logs.some((l) => l.includes('OK'))).toBe(true);
  });

  it('should report errors for an invalid .rosetta file and exit 1', async () => {
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => errors.push(args.join(' '));

    const exitCode = await runParse([resolve(TMP_DIR, 'invalid.rosetta')], {});

    console.error = origError;
    expect(exitCode).toBe(1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should discover .rosetta files in a directory', async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const origLog = console.log;
    const origError = console.error;
    console.log = (...args: any[]) => logs.push(args.join(' '));
    console.error = (...args: any[]) => errors.push(args.join(' '));

    const exitCode = await runParse([TMP_DIR], {});

    console.log = origLog;
    console.error = origError;
    // Directory contains both valid and invalid files
    expect(exitCode).toBe(1);
    // At least the valid file should show OK
    expect(logs.some((l) => l.includes('OK'))).toBe(true);
  });

  it('should output JSON when --json flag is set', async () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(' '));

    await runParse([resolve(TMP_DIR, 'valid.rosetta')], { json: true });

    console.log = origLog;
    expect(logs.length).toBe(1);
    const parsed = JSON.parse(logs[0]);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]).toHaveProperty('file');
    expect(parsed[0]).toHaveProperty('errors');
    expect(parsed[0]).toHaveProperty('elementCount');
  });

  it('should exit 1 when no .rosetta files are found', async () => {
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...args: any[]) => errors.push(args.join(' '));

    const exitCode = await runParse([resolve(TMP_DIR, 'not-rosetta.txt')], {});

    console.error = origError;
    expect(exitCode).toBe(1);
    expect(errors.some((l) => l.includes('No .rosetta files found'))).toBe(true);
  });
});
