import { describe, it, expect } from 'vitest';
import { parse } from '../../src/api/parse.js';
import type { RosettaModel } from '../../src/generated/ast.js';

/**
 * Assert no parse errors and return the model value.
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

// ──────────────────────────────────────────────
// T048: Function parsing tests
// ──────────────────────────────────────────────
describe('Function Parsing Tests', () => {
  it('should parse a simple function', async () => {
    const result = await parse(`namespace test.model
func Add:
  inputs:
    a int (1..1)
    b int (1..1)
  output:
    result int (1..1)
  set result: a + b
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(1);
  });

  it('should parse a function with conditions', async () => {
    const result = await parse(`namespace test.model
func Positive:
  inputs:
    value int (1..1)
  output:
    result boolean (1..1)
  condition PositiveCheck:
    value > 0
  set result: value > 0
`);
    expectNoErrors(result);
  });

  it('should parse a function with multiple operations', async () => {
    const result = await parse(`namespace test.model
func Compute:
  inputs:
    a int (1..1)
    b int (1..1)
  output:
    result int (1..1)
  set result: a + b
  add result: a * b
`);
    expectNoErrors(result);
  });

  it('should parse a function without inputs', async () => {
    const result = await parse(`namespace test.model
func GetDefault:
  output:
    result int (1..1)
  set result: 42
`);
    expectNoErrors(result);
  });

  it('should parse a function with description', async () => {
    const result = await parse(`namespace test.model
func MyFunc:
  <"A test function">
  inputs:
    value int (1..1)
  output:
    result int (1..1)
  set result: value
`);
    expectNoErrors(result);
  });

  it('should parse a reporting rule', async () => {
    const result = await parse(`namespace test.model
reporting rule MyRule from string:
  item -> name
`);
    expectNoErrors(result);
  });

  it('should parse an eligibility rule', async () => {
    const result = await parse(`namespace test.model
eligibility rule IsEligible from string:
  item = "yes"
`);
    expectNoErrors(result);
  });
});

// ──────────────────────────────────────────────
// T050: Cross-reference resolution basic test
// ──────────────────────────────────────────────
describe('Cross-Reference Parsing Tests', () => {
  it('should parse a type reference in extends', async () => {
    const result = await parse(`namespace test.model
type Base:
  name string (1..1)

type Child extends Base:
  age int (0..1)
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(2);
  });

  it('should parse attribute type references', async () => {
    const result = await parse(`namespace test.model
type Address:
  street string (1..1)
  city string (1..1)

type Person:
  name string (1..1)
  address Address (0..1)
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(2);
  });

  it('should parse enum references in attributes', async () => {
    const result = await parse(`namespace test.model
enum Status:
  Active
  Inactive

type Account:
  status Status (1..1)
`);
    const model = expectNoErrors(result);
    expect(model.elements).toHaveLength(2);
  });
});
