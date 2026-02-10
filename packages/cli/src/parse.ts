import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative, extname } from 'node:path';
import { parse } from '@rune-langium/core';
import type { ParseResult } from '@rune-langium/core';

export interface ParseCommandOptions {
  json?: boolean;
}

/**
 * Discover `.rosetta` files from a list of file/directory paths.
 */
async function discoverFiles(paths: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const p of paths) {
    const resolved = resolve(p);
    const s = await stat(resolved);
    if (s.isDirectory()) {
      const entries = await readdir(resolved, { recursive: true });
      for (const entry of entries) {
        if (extname(entry) === '.rosetta') {
          files.push(resolve(resolved, entry));
        }
      }
    } else if (extname(resolved) === '.rosetta') {
      files.push(resolved);
    }
  }
  return files;
}

/**
 * Parse one or more Rosetta DSL files and report results.
 */
export async function runParse(paths: string[], options: ParseCommandOptions): Promise<number> {
  const files = await discoverFiles(paths);
  if (files.length === 0) {
    console.error('No .rosetta files found.');
    return 1;
  }

  let hasErrors = false;
  const results: Array<{
    file: string;
    errors: string[];
    elementCount: number;
  }> = [];

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const result: ParseResult = await parse(content, `file:///${file}`);
    const errors = [
      ...result.lexerErrors.map(
        (e: { message: string; line?: number; column?: number }) =>
          `${relative(process.cwd(), file)}:${e.line ?? 0}:${e.column ?? 0}: ${e.message}`
      ),
      ...result.parserErrors.map(
        (e: { message: string; line?: number; column?: number }) =>
          `${relative(process.cwd(), file)}:${e.line ?? 0}:${e.column ?? 0}: ${e.message}`
      )
    ];

    if (errors.length > 0) hasErrors = true;

    results.push({
      file: relative(process.cwd(), file),
      errors,
      elementCount: result.value.elements.length
    });
  }

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      if (r.errors.length > 0) {
        for (const err of r.errors) {
          console.error(err);
        }
      } else {
        console.log(`${r.file}: OK (${r.elementCount} elements)`);
      }
    }
  }

  return hasErrors ? 1 : 0;
}
