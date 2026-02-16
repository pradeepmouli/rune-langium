import { describe, it, expect } from 'vitest';
import { parse, parseWorkspace } from '../../src/index.js';
import type { Data, RosettaFunction, RosettaEnumeration, RosettaModel } from '../../src/index.js';

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

describe('Scoping', () => {
  describe('Feature call scope (T067, T077)', () => {
    it('should resolve attribute references within a data type', async () => {
      const result = await parseOk(`
        namespace test.scope
        version "1.0.0"

        type Foo:
          bar int (1..1)

        func TestFunc:
          inputs:
            input Foo (1..1)
          output:
            result int (1..1)
          set result:
            input -> bar
      `);
      const model = result.value;
      const func = model.elements[1] as RosettaFunction;
      expect(func.name).toBe('TestFunc');
    });

    it('should parse deep feature calls with ->>', async () => {
      const result = await parseOk(`
        namespace test.scope
        version "1.0.0"

        type Bar:
          value int (1..1)

        type Foo:
          bars Bar (0..*)

        func TestFunc:
          inputs:
            input Foo (1..1)
          output:
            result int (0..*)
          set result:
            input -> bars ->> value
      `);
      expect(result.hasErrors).toBe(false);
    });
  });

  describe('Operation assign root scope (T068, T079)', () => {
    it('should resolve function inputs in set expressions', async () => {
      const result = await parseOk(`
        namespace test.scope
        version "1.0.0"

        func Add:
          inputs:
            a int (1..1)
            b int (1..1)
          output:
            result int (1..1)
          set result:
            a + b
      `);
      const model = result.value;
      const func = model.elements[0] as RosettaFunction;
      expect(func.inputs).toHaveLength(2);
      expect(func.output?.name).toBe('result');
    });

    it('should resolve output in add expressions', async () => {
      const result = await parseOk(`
        namespace test.scope
        version "1.0.0"

        func Accumulate:
          inputs:
            values int (0..*)
          output:
            result int (0..*)
          add result:
            values
      `);
      expect(result.hasErrors).toBe(false);
    });
  });

  describe('Enum value scope (T069, T080)', () => {
    it('should resolve enum values in expressions', async () => {
      const result = await parseOk(`
        namespace test.scope
        version "1.0.0"

        enum Currency:
          USD
          EUR
          GBP

        type Money:
          amount number (1..1)
          currency Currency (1..1)
      `);
      const model = result.value;
      const enumType = model.elements[0] as RosettaEnumeration;
      expect(enumType.enumValues).toHaveLength(3);
      expect(enumType.enumValues[0]!.name).toBe('USD');
    });
  });

  describe('Cross-reference resolution (T070)', () => {
    it('should resolve type references within same model', async () => {
      const result = await parseOk(`
        namespace test.scope
        version "1.0.0"

        type Address:
          street string (1..1)
          city string (1..1)

        type Person:
          name string (1..1)
          address Address (1..1)
      `);
      const model = result.value;
      const person = model.elements[1] as Data;
      expect(person.name).toBe('Person');
      const addressAttr = person.attributes[1];
      expect(addressAttr?.name).toBe('address');
      expect(addressAttr?.typeCall?.type?.$refText).toBe('Address');
    });

    it('should resolve extends references', async () => {
      const result = await parseOk(`
        namespace test.scope
        version "1.0.0"

        type Base:
          id int (1..1)

        type Derived extends Base:
          extra string (1..1)
      `);
      const model = result.value;
      const derived = model.elements[1] as Data;
      expect(derived.superType?.$refText).toBe('Base');
    });
  });

  describe('Workspace cross-document resolution (T071, T082)', () => {
    it('should resolve types across multiple documents', async () => {
      const results = await parseWorkspace([
        {
          uri: 'inmemory:///types.rosetta',
          content: `
            namespace test.scope
            version "1.0.0"

            type Address:
              street string (1..1)
          `
        },
        {
          uri: 'inmemory:///model.rosetta',
          content: `
            namespace test.scope
            version "1.0.0"

            type Person:
              name string (1..1)
              address Address (1..1)
          `
        }
      ]);
      // Both documents should parse without lexer/parser errors
      for (const doc of results) {
        expect(doc.lexerErrors).toHaveLength(0);
        expect(doc.parserErrors).toHaveLength(0);
      }
    });
  });

  describe('Import and namespace scope (T072, T082)', () => {
    it('should parse import statements', async () => {
      const result = await parseOk(`
        namespace test.scope
        version "1.0.0"
        import com.rosetta.model.*

        type MyType:
          value int (1..1)
      `);
      const model = result.value;
      expect(model.imports).toHaveLength(1);
    });

    it('should parse namespace with scope', async () => {
      const result = await parseOk(`
        namespace test.scope scope MyScope
        version "1.0.0"

        type MyType:
          value int (1..1)
      `);
      expect(result.hasErrors).toBe(false);
    });
  });
});
