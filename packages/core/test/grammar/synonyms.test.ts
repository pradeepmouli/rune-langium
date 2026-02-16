import { describe, it, expect } from 'vitest';
import { parse } from '../../src/index.js';
import type { RosettaModel, Data, RosettaEnumeration } from '../../src/index.js';

/**
 * Helper: parse and assert no errors.
 */
async function parseOk(input: string) {
  const result = await parse(input);
  const allErrors = [
    ...result.lexerErrors.map((e) => `Lexer: ${e.message}`),
    ...result.parserErrors.map((e) => `Parser: ${e.message}`)
  ];
  expect(allErrors, allErrors.join('\n')).toHaveLength(0);
  return result;
}

describe('Synonym Parsing (T090)', () => {
  describe('Class synonyms', () => {
    it('should parse a data type with a class synonym', async () => {
      const result = await parseOk(`
        namespace test.synonyms
        version "1.0.0"

        type Foo:
          [synonym FpML value "Bar"]
          bar int (1..1)
      `);
      const model = result.value;
      const data = model.elements[0] as Data;
      expect(data.name).toBe('Foo');
    });

    it('should parse a data type with multiple class synonyms', async () => {
      const result = await parseOk(`
        namespace test.synonyms
        version "1.0.0"

        type Foo:
          [synonym FpML value "Bar"]
          [synonym ISO value "Baz"]
          bar int (1..1)
      `);
      const model = result.value;
      const data = model.elements[0] as Data;
      expect(data.name).toBe('Foo');
    });
  });

  describe('Attribute synonyms', () => {
    it('should parse synonyms on attributes', async () => {
      const result = await parseOk(`
        namespace test.synonyms
        version "1.0.0"

        type Foo:
          bar int (1..1)
            [synonym FpML value "baz"]
      `);
      const model = result.value;
      const data = model.elements[0] as Data;
      expect(data.attributes[0]?.name).toBe('bar');
    });

    it('should parse synonyms with path', async () => {
      const result = await parseOk(`
        namespace test.synonyms
        version "1.0.0"

        type Foo:
          bar int (1..1)
            [synonym FpML value "baz" path "root->child"]
      `);
      expect(result.hasErrors).toBe(false);
    });
  });

  describe('Enum synonyms', () => {
    it('should parse synonyms on enum values', async () => {
      const result = await parseOk(`
        namespace test.synonyms
        version "1.0.0"

        enum Currency:
          USD
            [synonym FpML value "usd"]
          EUR
      `);
      const model = result.value;
      const enumType = model.elements[0] as RosettaEnumeration;
      expect(enumType.enumValues).toHaveLength(2);
    });
  });
});
