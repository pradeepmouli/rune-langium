import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '../../src/index.js';
import { NodeFileSystem } from 'langium/node';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const CDM_DIR = resolve(__dirname, '../../../../.resources/cdm');

describe('CDM Error Detail', () => {
  const services = createRuneDslServices(NodeFileSystem).RuneDsl;
  const parser = services.parser.LangiumParser;

  it('should show first 3 errors for each failing file', () => {
    const files = readdirSync(CDM_DIR)
      .filter((f) => f.endsWith('.rosetta'))
      .sort();
    const failures: Array<{ file: string; errors: string[] }> = [];

    for (const file of files) {
      const text = readFileSync(resolve(CDM_DIR, file), 'utf-8');
      const result = parser.parse(text);
      if (result.parserErrors.length > 0) {
        failures.push({
          file,
          errors: result.parserErrors
            .slice(0, 2)
            .map(
              (e: any) =>
                `L${e.token?.startLine}:${e.token?.startColumn} [${e.token?.image?.substring(0, 30)}] ${e.message.substring(0, 150)}`
            )
        });
      }
    }

    // Print categorized errors
    const categories: Record<string, string[]> = {};
    for (const f of failures) {
      const first = f.errors[0] ?? '';
      const key = first.replace(/L\d+:\d+/g, 'L*').replace(/\[.*?\]/, '[*]');
      if (!categories[key]) categories[key] = [];
      categories[key].push(f.file);
    }

    console.log(`\nTotal failing: ${failures.length}/${files.length}\n`);
    for (const f of failures) {
      console.log(`${f.file}:`);
      f.errors.forEach((e) => console.log(`  ${e}`));
    }

    // Don't actually fail - just print
    expect(true).toBe(true);
  }, 30_000);
});
