// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * constraint-recognizer — the inverse of `import/constraint-translator.ts`:
 * a Rune `Condition.expression` tree (real Langium AST OR a `Dehydrated<T>`
 * plain object — both shapes, per the recognizer's own tolerance, mirroring
 * `render-expression.ts`'s "reads only $type, data fields, $refText" rule)
 * → `ConstraintIR`, PLUS `ConstraintIR` → JSON Schema keyword rendering
 * (spec.md Phase 2b Implementation Addendum decision 1).
 *
 * Mini round-trip at the IR level: every fixture below is built via the
 * EXISTING inbound `translateConstraint`/`translateConstraintExpression`
 * (constraint-translator.ts) so the recognizer is tested against the exact
 * expression shapes the inbound side actually produces — not invented
 * shapes — and the recognized IR is asserted equivalent to the original.
 */

import { describe, it, expect } from 'vitest';
import { translateConstraintExpression } from '../../src/import/constraint-translator.js';
import type { ConstraintIR } from '../../src/import/source-model.js';
import type { ImportDiagnostic } from '../../src/import/diagnostics.js';
import { recognizeCondition, constraintIRToJsonSchemaKeywords } from '../../src/emit/constraint-recognizer.js';

function noDiagnostics(): ImportDiagnostic[] {
  return [];
}

describe('constraint-recognizer — condition expression → ConstraintIR (mini round-trip)', () => {
  it('range: min only', () => {
    const ir: ConstraintIR = { kind: 'range', path: 'value', min: 0 };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({ kind: 'range', path: 'value', min: 0 });
  });

  it('range: max only', () => {
    const ir: ConstraintIR = { kind: 'range', path: 'value', max: 100 };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({ kind: 'range', path: 'value', max: 100 });
  });

  it('range: min and max, exclusive (a logical AND of two comparisons)', () => {
    const ir: ConstraintIR = { kind: 'range', path: 'value', min: 0, max: 10, exclusive: true };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({
      kind: 'range',
      path: 'value',
      min: 0,
      max: 10,
      exclusive: true
    });
  });

  it('range: min and max, inclusive', () => {
    const ir: ConstraintIR = { kind: 'range', path: 'value', min: 0, max: 10 };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({ kind: 'range', path: 'value', min: 0, max: 10 });
  });

  it('length: min only (count comparison)', () => {
    const ir: ConstraintIR = { kind: 'length', path: 'partyId', min: 1 };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({ kind: 'length', path: 'partyId', min: 1 });
  });

  it('length: min and max', () => {
    const ir: ConstraintIR = { kind: 'length', path: 'partyId', min: 1, max: 5 };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({ kind: 'length', path: 'partyId', min: 1, max: 5 });
  });

  it('comparison: equality', () => {
    const ir: ConstraintIR = { kind: 'comparison', op: '=', path: 'flag', value: true };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({ kind: 'comparison', op: '=', path: 'flag', value: true });
  });

  it('comparison: string equality', () => {
    const ir: ConstraintIR = { kind: 'comparison', op: '<>', path: 'currency', value: 'USD' };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({ kind: 'comparison', op: '<>', path: 'currency', value: 'USD' });
  });

  it('oneOf: required choice over sibling attributes', () => {
    const ir: ConstraintIR = { kind: 'oneOf', paths: ['currency', 'capacityUnit', 'financialUnit'] };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({
      kind: 'oneOf',
      paths: ['currency', 'capacityUnit', 'financialUnit']
    });
  });

  it('choice: optional choice over sibling attributes', () => {
    const ir: ConstraintIR = { kind: 'choice', paths: ['currency', 'capacityUnit'] };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({ kind: 'choice', paths: ['currency', 'capacityUnit'] });
  });

  it('exists', () => {
    const ir: ConstraintIR = { kind: 'exists', path: 'value' };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({ kind: 'exists', path: 'value' });
  });

  it('absent', () => {
    const ir: ConstraintIR = { kind: 'absent', path: 'value' };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toEqual({ kind: 'absent', path: 'value' });
  });

  it('the pattern/custom stub (a bare `True` literal) is unrecognized', () => {
    const ir: ConstraintIR = { kind: 'pattern', path: 'code', regex: '^[A-Z]{3}$' };
    const expr = translateConstraintExpression(ir, noDiagnostics());
    expect(recognizeCondition(expr)).toBeUndefined();
  });

  it('an arbitrary unrecognized expression shape returns undefined, not throw', () => {
    expect(recognizeCondition({ $type: 'SomeUnknownExpression' } as never)).toBeUndefined();
  });
});

describe('constraint-recognizer — ConstraintIR → JSON Schema keywords', () => {
  it('range: min only → minimum', () => {
    expect(constraintIRToJsonSchemaKeywords({ kind: 'range', path: 'value', min: 0 })).toEqual({
      minimum: 0
    });
  });

  it('range: max only → maximum', () => {
    expect(constraintIRToJsonSchemaKeywords({ kind: 'range', path: 'value', max: 100 })).toEqual({
      maximum: 100
    });
  });

  it('range: exclusive min/max → exclusiveMinimum/exclusiveMaximum', () => {
    expect(
      constraintIRToJsonSchemaKeywords({ kind: 'range', path: 'value', min: 0, max: 10, exclusive: true })
    ).toEqual({
      exclusiveMinimum: 0,
      exclusiveMaximum: 10
    });
  });

  it('length → minLength/maxLength', () => {
    expect(constraintIRToJsonSchemaKeywords({ kind: 'length', path: 'partyId', min: 1, max: 5 })).toEqual({
      minLength: 1,
      maxLength: 5
    });
  });

  it('oneOf/choice are type-level (not per-property keywords) → undefined here; recognized separately by the emitter as a required-property-group', () => {
    expect(constraintIRToJsonSchemaKeywords({ kind: 'oneOf', paths: ['a', 'b'] })).toBeUndefined();
    expect(constraintIRToJsonSchemaKeywords({ kind: 'choice', paths: ['a', 'b'] })).toBeUndefined();
  });

  it('comparison/exists/absent/pattern/custom/conditional are not representable as a single-property keyword set → undefined', () => {
    expect(
      constraintIRToJsonSchemaKeywords({ kind: 'comparison', op: '=', path: 'flag', value: true })
    ).toBeUndefined();
    expect(constraintIRToJsonSchemaKeywords({ kind: 'exists', path: 'value' })).toBeUndefined();
    expect(constraintIRToJsonSchemaKeywords({ kind: 'absent', path: 'value' })).toBeUndefined();
    expect(constraintIRToJsonSchemaKeywords({ kind: 'pattern', path: 'code', regex: '.*' })).toBeUndefined();
  });
});
