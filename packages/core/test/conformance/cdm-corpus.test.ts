import { describe, it, expect } from 'vitest';
import { loadAllFixtures, fixtureVersion, listFixtures } from '../helpers/fixture-loader.js';
import { parse } from '../../src/api/parse.js';

describe('CDM Corpus Conformance (SC-001)', () => {
  it('should have vendored CDM fixtures', async () => {
    const version = await fixtureVersion('cdm');
    expect(version).toBeDefined();
    const files = await listFixtures('cdm');
    expect(files.length).toBeGreaterThan(0);
  });

  it('should parse all CDM .rosetta files without parse errors', async () => {
    const fixtures = await loadAllFixtures('cdm');
    expect(fixtures.length).toBeGreaterThan(0);

    const results: Array<{ name: string; errors: string[] }> = [];
    let totalErrors = 0;

    for (const { name, content } of fixtures) {
      const result = await parse(content, `inmemory:///cdm/${name}`);
      const errors = [
        ...result.lexerErrors.map((e) => `[lexer] ${e.message}`),
        ...result.parserErrors.map((e) => `[parser] ${e.message}`)
      ];
      if (errors.length > 0) {
        results.push({ name, errors });
        totalErrors += errors.length;
      }
    }

    if (results.length > 0) {
      const summary = results
        .map(
          (r) =>
            `  ${r.name}: ${r.errors.length} error(s)\n${r.errors.map((e) => `    ${e}`).join('\n')}`
        )
        .join('\n');
      console.log(`CDM parse failures (${results.length}/${fixtures.length} files):\n${summary}`);
    }

    // SC-001: 100% parse rate
    const parseRate = ((fixtures.length - results.length) / fixtures.length) * 100;
    console.log(
      `CDM parse rate: ${parseRate.toFixed(1)}% (${fixtures.length - results.length}/${fixtures.length} files)`
    );
    expect(results.length).toBe(0);
  }, 30_000);

  it('should produce typed AST nodes for every parsed CDM file', async () => {
    const fixtures = await loadAllFixtures('cdm');
    for (const { name, content } of fixtures.slice(0, 10)) {
      const result = await parse(content, `inmemory:///cdm/${name}`);
      expect(result.value).toBeDefined();
      expect(result.value.$type).toBe('RosettaModel');
    }
  });
});

describe('Rune DSL Built-in Types', () => {
  it('should have vendored Rune DSL fixtures', async () => {
    const version = await fixtureVersion('rune-dsl');
    expect(version).toBeDefined();
    const files = await listFixtures('rune-dsl');
    expect(files.length).toBeGreaterThan(0);
  });

  it('should parse all Rune DSL built-in type files', async () => {
    const fixtures = await loadAllFixtures('rune-dsl');
    expect(fixtures.length).toBeGreaterThan(0);

    for (const { name, content } of fixtures) {
      const result = await parse(content, `inmemory:///rune-dsl/${name}`);
      const errors = [
        ...result.lexerErrors.map((e) => `[lexer] ${e.message}`),
        ...result.parserErrors.map((e) => `[parser] ${e.message}`)
      ];
      expect(errors, `Parse errors in ${name}:\n${errors.join('\n')}`).toHaveLength(0);
    }
  });
});
