import { describe, it, expect } from 'vitest';
import { createRuneDslServices } from '../../src/index.js';
import { NodeFileSystem } from 'langium/node';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const CDM_DIR = resolve(__dirname, '../../../../.resources/cdm');

describe('CDM Error Detail', () => {
  it('should parse all CDM files without errors', () => {
    if (!existsSync(CDM_DIR)) {
      console.log(`Skipping: CDM fixture directory not found at ${CDM_DIR}`);
      return;
    }

    const services = createRuneDslServices(NodeFileSystem).RuneDsl;
    const parser = services.parser.LangiumParser;

    const files = readdirSync(CDM_DIR)
      .filter((f) => f.endsWith('.rosetta'))
      .sort();
    expect(files.length).toBeGreaterThan(0);

    const failures: Array<{ file: string; errors: string[] }> = [];

    for (const file of files) {
      const text = readFileSync(resolve(CDM_DIR, file), 'utf-8');
      const result = parser.parse(text);
      if (result.parserErrors.length > 0) {
        failures.push({
          file,
          errors: result.parserErrors
            .slice(0, 3)
            .map(
              (e: any) =>
                `L${e.token?.startLine}:${e.token?.startColumn} [${e.token?.image?.substring(0, 30)}] ${e.message.substring(0, 150)}`
            )
        });
      }
    }

    if (failures.length > 0) {
      // Print categorized errors for debugging
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

      if (Object.keys(categories).length > 0) {
        console.log(`\nError categories (${Object.keys(categories).length}):`);
        for (const [key, catFiles] of Object.entries(categories)) {
          console.log(`  ${key}: ${catFiles.length} file(s)`);
        }
      }
    }

    // SC-001: 100% parse rate — all CDM files must parse without errors
    expect(failures, `${failures.length}/${files.length} CDM files had parse errors`).toHaveLength(
      0
    );
  }, 30_000);
});
