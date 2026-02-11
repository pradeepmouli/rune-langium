import { describe, it, expect } from 'vitest';
import { parse, parseWorkspace } from '../../src/api/parse.js';
import type { ParseResult } from '../../src/api/parse.js';
import { isData, isRosettaEnumeration, isRosettaFunction } from '../../src/generated/ast.js';

describe('Parse API Tests', () => {
  // ──────────────────────────────────────────────
  // T065: parse() returns typed ParseResult
  // ──────────────────────────────────────────────
  describe('parse()', () => {
    it('should return a ParseResult with typed value', async () => {
      const result: ParseResult = await parse(`namespace test.api
type Foo:
  bar string (1..1)
`);
      expect(result).toBeDefined();
      expect(result.value).toBeDefined();
      expect(result.value.$type).toBe('RosettaModel');
      expect(result.hasErrors).toBe(false);
      expect(result.lexerErrors).toHaveLength(0);
      expect(result.parserErrors).toHaveLength(0);
    });

    it('should parse Data types with correct AST shape', async () => {
      const result = await parse(`namespace test.api
type Person:
  name string (1..1)
  age int (0..1)
`);
      expect(result.hasErrors).toBe(false);
      const data = result.value.elements.find(isData);
      expect(data).toBeDefined();
      expect(data!.name).toBe('Person');
      expect(data!.attributes).toHaveLength(2);
      expect(data!.attributes[0].name).toBe('name');
      expect(data!.attributes[1].name).toBe('age');
    });

    it('should parse enums with correct AST shape', async () => {
      const result = await parse(`namespace test.api
enum Direction:
  North
  South
`);
      expect(result.hasErrors).toBe(false);
      const enumDef = result.value.elements.find(isRosettaEnumeration);
      expect(enumDef).toBeDefined();
      expect(enumDef!.name).toBe('Direction');
      expect(enumDef!.enumValues).toHaveLength(2);
    });

    it('should parse functions with correct AST shape', async () => {
      const result = await parse(`namespace test.api
func Add:
  inputs:
    a int (1..1)
    b int (1..1)
  output:
    result int (1..1)
  set result: a + b
`);
      expect(result.hasErrors).toBe(false);
      const func = result.value.elements.find(isRosettaFunction);
      expect(func).toBeDefined();
      expect(func!.name).toBe('Add');
      expect(func!.inputs).toHaveLength(2);
      expect(func!.output).toBeDefined();
      expect(func!.operations).toHaveLength(1);
    });

    it('should report parse errors with position info', async () => {
      const result = await parse(`namespace test.api
type !!!invalid!!!:
`);
      expect(result.hasErrors).toBe(true);
      expect(result.parserErrors.length + result.lexerErrors.length).toBeGreaterThan(0);
    });

    it('should accept a custom URI', async () => {
      const result = await parse(`namespace test.api`, 'inmemory:///custom.rosetta');
      expect(result.hasErrors).toBe(false);
      expect(result.value.name).toBe('test.api');
    });
  });

  // ──────────────────────────────────────────────
  // T063: parseWorkspace()
  // ──────────────────────────────────────────────
  describe('parseWorkspace()', () => {
    it('should parse multiple documents', async () => {
      const results = await parseWorkspace([
        {
          uri: 'inmemory:///types.rosetta',
          content: `namespace test.types
type Foo:
  bar string (1..1)
`
        },
        {
          uri: 'inmemory:///funcs.rosetta',
          content: `namespace test.funcs
func GetBar:
  inputs:
    f Foo (1..1)
  output:
    result string (1..1)
  set result: f -> bar
`
        }
      ]);
      expect(results).toHaveLength(2);
      expect(results[0]?.hasErrors).toBe(false);
      expect(results[1]?.hasErrors).toBe(false);
      expect(results[0]?.value.name).toBe('test.types');
      expect(results[1]?.value.name).toBe('test.funcs');
    });

    it('should return individual errors per document', async () => {
      const results = await parseWorkspace([
        {
          uri: 'inmemory:///good.rosetta',
          content: `namespace test.good
type Valid:
  x string (1..1)
`
        },
        {
          uri: 'inmemory:///bad.rosetta',
          content: `namespace test.bad
!!!
`
        }
      ]);
      expect(results[0]?.hasErrors).toBe(false);
      expect(results[1]?.hasErrors).toBe(true);
    });
  });
});
