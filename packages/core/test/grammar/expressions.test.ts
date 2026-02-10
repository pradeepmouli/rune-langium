import { describe, it, expect } from 'vitest';
import { parse } from '../../src/api/parse.js';
import type { RosettaModel } from '../../src/generated/ast.js';

/**
 * Helper: parse an expression inside a function body and return the result.
 * Wraps the expression in a minimal valid function context.
 */
async function parseExpression(expr: string) {
  const input = `namespace test.expr
func TestFunc:
  output: result int (1..1)
  set result: ${expr}
`;
  const result = await parse(input);
  return result;
}

/**
 * Helper: assert no parse errors and return the model value.
 */
function expectNoErrors(result: {
  hasErrors: boolean;
  value: RosettaModel;
  parserErrors: unknown[];
  lexerErrors: unknown[];
}) {
  if (result.hasErrors) {
    const messages = [
      ...result.parserErrors.map((e) => (e as { message?: string }).message),
      ...result.lexerErrors.map((e) => (e as { message?: string }).message)
    ];
    expect.fail(`Parse errors: ${messages.join('; ')}`);
  }
  return result.value;
}

describe('Expression Parsing Tests', () => {
  // ──────────────────────────────────────────────
  // T014: Arithmetic expressions
  // ──────────────────────────────────────────────
  describe('arithmetic expressions', () => {
    it('should parse addition', async () => {
      const result = await parseExpression('a + b');
      expectNoErrors(result);
    });

    it('should parse multiplication', async () => {
      const result = await parseExpression('a * b');
      expectNoErrors(result);
    });

    it('should parse mixed precedence: a + b * c', async () => {
      const result = await parseExpression('a + b * c');
      expectNoErrors(result);
    });

    it('should parse subtraction and division', async () => {
      const result = await parseExpression('a - b / c');
      expectNoErrors(result);
    });

    it('should parse parenthesized expressions', async () => {
      const result = await parseExpression('(a + b) * c');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T015: Logical expressions
  // ──────────────────────────────────────────────
  describe('logical expressions', () => {
    it('should parse and', async () => {
      const result = await parseExpression('a and b');
      expectNoErrors(result);
    });

    it('should parse or', async () => {
      const result = await parseExpression('a or b');
      expectNoErrors(result);
    });

    it('should parse mixed: a and b or c', async () => {
      const result = await parseExpression('a and b or c');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T016: Comparison with cardinality modifiers
  // ──────────────────────────────────────────────
  describe('comparison expressions', () => {
    it('should parse equality', async () => {
      const result = await parseExpression('a = b');
      expectNoErrors(result);
    });

    it('should parse inequality', async () => {
      const result = await parseExpression('a <> b');
      expectNoErrors(result);
    });

    it('should parse greater than', async () => {
      const result = await parseExpression('a > b');
      expectNoErrors(result);
    });

    it('should parse less than or equal', async () => {
      const result = await parseExpression('a <= b');
      expectNoErrors(result);
    });

    it('should parse any modifier: a any = b', async () => {
      const result = await parseExpression('a any = b');
      expectNoErrors(result);
    });

    it('should parse all modifier: a all > b', async () => {
      const result = await parseExpression('a all > b');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T017: Feature calls
  // ──────────────────────────────────────────────
  describe('feature call expressions', () => {
    it('should parse single feature call: a -> b', async () => {
      const result = await parseExpression('a -> b');
      expectNoErrors(result);
    });

    it('should parse chained feature calls: a -> b -> c', async () => {
      const result = await parseExpression('a -> b -> c');
      expectNoErrors(result);
    });

    it('should parse deep feature call: a ->> d', async () => {
      const result = await parseExpression('a ->> d');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T018: Unary postfix operators
  // ──────────────────────────────────────────────
  describe('unary postfix operations', () => {
    it('should parse exists', async () => {
      const result = await parseExpression('a exists');
      expectNoErrors(result);
    });

    it('should parse single exists', async () => {
      const result = await parseExpression('a single exists');
      expectNoErrors(result);
    });

    it('should parse multiple exists', async () => {
      const result = await parseExpression('a multiple exists');
      expectNoErrors(result);
    });

    it('should parse is absent', async () => {
      const result = await parseExpression('a is absent');
      expectNoErrors(result);
    });

    it('should parse count', async () => {
      const result = await parseExpression('a count');
      expectNoErrors(result);
    });

    it('should parse flatten', async () => {
      const result = await parseExpression('a flatten');
      expectNoErrors(result);
    });

    it('should parse distinct', async () => {
      const result = await parseExpression('a distinct');
      expectNoErrors(result);
    });

    it('should parse reverse', async () => {
      const result = await parseExpression('a reverse');
      expectNoErrors(result);
    });

    it('should parse first', async () => {
      const result = await parseExpression('a first');
      expectNoErrors(result);
    });

    it('should parse last', async () => {
      const result = await parseExpression('a last');
      expectNoErrors(result);
    });

    it('should parse sum', async () => {
      const result = await parseExpression('a sum');
      expectNoErrors(result);
    });

    it('should parse only-element', async () => {
      const result = await parseExpression('a only-element');
      expectNoErrors(result);
    });

    it('should parse only exists', async () => {
      const result = await parseExpression('a only exists');
      expectNoErrors(result);
    });

    it('should parse one-of', async () => {
      const result = await parseExpression('a one-of');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T019: Functional ops (filter, extract, reduce, sort)
  // ──────────────────────────────────────────────
  describe('functional operations', () => {
    it('should parse filter with inline function', async () => {
      const result = await parseExpression('items filter [item > 0]');
      expectNoErrors(result);
    });

    it('should parse extract with inline function', async () => {
      const result = await parseExpression('items extract [item -> name]');
      expectNoErrors(result);
    });

    it('should parse reduce with inline function', async () => {
      const result = await parseExpression('items reduce a, b [a + b]');
      expectNoErrors(result);
    });

    it('should parse sort with inline function', async () => {
      const result = await parseExpression('items sort [item -> name]');
      expectNoErrors(result);
    });

    it('should parse min', async () => {
      const result = await parseExpression('items min');
      expectNoErrors(result);
    });

    it('should parse max', async () => {
      const result = await parseExpression('items max');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T020: Control flow (if/then/else, switch)
  // ──────────────────────────────────────────────
  describe('control flow expressions', () => {
    it('should parse if/then/else', async () => {
      const result = await parseExpression('if a > 0 then a else b');
      expectNoErrors(result);
    });

    it('should parse if/then without else', async () => {
      const result = await parseExpression('if a > 0 then a');
      expectNoErrors(result);
    });

    it('should parse switch', async () => {
      const result = await parseExpression('a switch x then 1, y then 2');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T021: Literals
  // ──────────────────────────────────────────────
  describe('literal expressions', () => {
    it('should parse boolean True', async () => {
      const result = await parseExpression('True');
      expectNoErrors(result);
    });

    it('should parse boolean False', async () => {
      const result = await parseExpression('False');
      expectNoErrors(result);
    });

    it('should parse string literal', async () => {
      const result = await parseExpression('"hello world"');
      expectNoErrors(result);
    });

    it('should parse integer literal', async () => {
      const result = await parseExpression('42');
      expectNoErrors(result);
    });

    it('should parse negative integer', async () => {
      const result = await parseExpression('-1');
      expectNoErrors(result);
    });

    it('should parse decimal number', async () => {
      const result = await parseExpression('3.14');
      expectNoErrors(result);
    });

    it('should parse empty list', async () => {
      const result = await parseExpression('empty');
      expectNoErrors(result);
    });

    it('should parse list literal', async () => {
      const result = await parseExpression('[1, 2, 3]');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T022: Constructor expressions
  // ──────────────────────────────────────────────
  describe('constructor expressions', () => {
    it('should parse simple constructor', async () => {
      const result = await parseExpression('Foo { bar: baz }');
      expectNoErrors(result);
    });

    it('should parse constructor with multiple fields', async () => {
      const result = await parseExpression('Foo { bar: 1, baz: "hello" }');
      expectNoErrors(result);
    });

    it('should parse constructor with spread', async () => {
      const result = await parseExpression('Foo { bar: 1, ... }');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T023: Implicit variable / without left parameter
  // ──────────────────────────────────────────────
  describe('implicit variable', () => {
    it('should parse item reference', async () => {
      const result = await parseExpression('item');
      expectNoErrors(result);
    });

    it('should parse item with feature call', async () => {
      const result = await parseExpression('item -> name');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T024: Then chaining
  // ──────────────────────────────────────────────
  describe('then chaining', () => {
    it('should parse then operation', async () => {
      const result = await parseExpression('items filter [item > 0] then item count');
      expectNoErrors(result);
    });

    it('should parse chained then', async () => {
      const result = await parseExpression('items extract [item -> value] then item sum');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T025: Type coercion operators
  // ──────────────────────────────────────────────
  describe('type coercion operators', () => {
    it('should parse to-string', async () => {
      const result = await parseExpression('a to-string');
      expectNoErrors(result);
    });

    it('should parse to-number', async () => {
      const result = await parseExpression('a to-number');
      expectNoErrors(result);
    });

    it('should parse to-int', async () => {
      const result = await parseExpression('a to-int');
      expectNoErrors(result);
    });

    it('should parse to-time', async () => {
      const result = await parseExpression('a to-time');
      expectNoErrors(result);
    });

    it('should parse to-date', async () => {
      const result = await parseExpression('a to-date');
      expectNoErrors(result);
    });

    it('should parse to-date-time', async () => {
      const result = await parseExpression('a to-date-time');
      expectNoErrors(result);
    });

    it('should parse to-zoned-date-time', async () => {
      const result = await parseExpression('a to-zoned-date-time');
      expectNoErrors(result);
    });
  });

  // ──────────────────────────────────────────────
  // T026: Error recovery
  // ──────────────────────────────────────────────
  describe('error recovery', () => {
    it('should produce errors for malformed expression', async () => {
      const input = `namespace test.recovery
func TestFunc:
  output: result int (1..1)
  set result: + + +
`;
      const result = await parse(input);
      expect(result.hasErrors).toBe(true);
      // Error recovery should still produce a partial AST
      expect(result.value).toBeDefined();
    });
  });

  // ──────────────────────────────────────────────
  // Additional: Binary operators
  // ──────────────────────────────────────────────
  describe('binary operations', () => {
    it('should parse contains', async () => {
      const result = await parseExpression('a contains b');
      expectNoErrors(result);
    });

    it('should parse disjoint', async () => {
      const result = await parseExpression('a disjoint b');
      expectNoErrors(result);
    });

    it('should parse default', async () => {
      const result = await parseExpression('a default b');
      expectNoErrors(result);
    });

    it('should parse join', async () => {
      const result = await parseExpression('a join b');
      expectNoErrors(result);
    });
  });
});
