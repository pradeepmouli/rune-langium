// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { parse } from '@rune-langium/core';
import { renderNode, type RenderChild } from '../../src/emit/rosetta/rosetta-render-core.js';
import {
  translateConstraint,
  translateConstraintExpression,
  conditionBaseName,
  nextConditionName,
  isSimplePath
} from '../../src/import/constraint-translator.js';
import type { ConstraintIR } from '../../src/import/source-model.js';
import type { ImportDiagnostic } from '../../src/import/diagnostics.js';

const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

/** Wraps a single condition in a minimal `Data` so it parses as a complete `.rune` document. */
function wrapInType(conditionText: string): string {
  return `namespace test.inbound\nversion "0.0.0"\n\ntype T:\n  value int (1..1)\n  currency string (0..1)\n  capacityUnit string (0..1)\n  financialUnit string (0..1)\n  partyId string (0..*)\n  flag boolean (0..1)\n\n${conditionText}\n`;
}

/** Renders one ConstraintIR to a Condition AST node, renders that to text, and asserts a zero-error reparse. */
async function assertRoundTrips(ir: ConstraintIR): Promise<{ text: string; conditionName: string }> {
  const diagnostics: ImportDiagnostic[] = [];
  const node = translateConstraint(ir, new Set(), diagnostics);
  const text = renderNode(node as never, regen);
  expect(text).not.toBeNull();
  const source = wrapInType(text!);
  const result = await parse(source);
  if (result.hasErrors) {
    throw new Error(
      `expected zero parse errors for:\n${source}\ngot: ${JSON.stringify([...result.lexerErrors, ...result.parserErrors])}`
    );
  }
  expect(result.hasErrors).toBe(false);
  // `Condition.name` is optional per the grammar (`ConditionNode['name']` is
  // `string | undefined`); `translateConstraint` always assigns one.
  expect(node.name).toBeDefined();
  return { text: text!, conditionName: node.name! };
}

describe('constraint-translator — every ConstraintIR kind renders + reparses (parse-first invariant)', () => {
  it('comparison', async () => {
    const { text } = await assertRoundTrips({ kind: 'comparison', op: '=', path: 'flag', value: true });
    expect(text).toContain('flag = True');
  });

  it('range: min only', async () => {
    const { text } = await assertRoundTrips({ kind: 'range', path: 'value', min: 0 });
    expect(text).toBe('condition ValueRange:\n  value >= 0');
  });

  it('range: max only', async () => {
    const { text } = await assertRoundTrips({ kind: 'range', path: 'value', max: 100 });
    expect(text).toBe('condition ValueRange:\n  value <= 100');
  });

  it('range: min and max (exclusive)', async () => {
    const { text } = await assertRoundTrips({ kind: 'range', path: 'value', min: 0, max: 10, exclusive: true });
    expect(text).toBe('condition ValueRange:\n  value > 0 and value < 10');
  });

  it('length: min only (count comparison)', async () => {
    const { text } = await assertRoundTrips({ kind: 'length', path: 'partyId', min: 1 });
    expect(text).toBe('condition PartyIdLength:\n  partyId count >= 1');
  });

  it('length: min and max', async () => {
    const { text } = await assertRoundTrips({ kind: 'length', path: 'partyId', min: 1, max: 5 });
    expect(text).toBe('condition PartyIdLength:\n  partyId count >= 1 and partyId count <= 5');
  });

  it('pattern: always stub + diagnostic (AMENDED scenario 5)', async () => {
    const diagnostics: ImportDiagnostic[] = [];
    const ir: ConstraintIR = { kind: 'pattern', path: 'currency', regex: '^[A-Z]{3}$' };
    const node = translateConstraint(ir, new Set(), diagnostics);
    expect(node.definition).toBe('TODO: manual translation required — source pattern: ^[A-Z]{3}$');
    const text = renderNode(node as never, regen);
    expect(text).toBe(
      'condition CurrencyPattern:\n  <"TODO: manual translation required — source pattern: ^[A-Z]{3}$">\n  True'
    );
    const source = wrapInType(text!);
    const result = await parse(source);
    expect(result.hasErrors).toBe(false);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('untranslatable-construct');
    expect(diagnostics[0]!.severity).toBe('warning');
  });

  it('oneOf: exactly-one-present over simple sibling attributes → required choice', async () => {
    const { text } = await assertRoundTrips({
      kind: 'oneOf',
      paths: ['currency', 'capacityUnit', 'financialUnit']
    });
    expect(text).toBe('condition OneOf:\n  required choice currency, capacityUnit, financialUnit');
  });

  it('choice: at-most-one-present over simple sibling attributes → optional choice', async () => {
    const { text } = await assertRoundTrips({ kind: 'choice', paths: ['currency', 'capacityUnit'] });
    expect(text).toBe('condition Choice:\n  optional choice currency, capacityUnit');
  });

  it('oneOf: a non-simple (multi-segment) path falls back to the stub + diagnostic', async () => {
    const diagnostics: ImportDiagnostic[] = [];
    const ir: ConstraintIR = { kind: 'oneOf', paths: ['a.b', 'c'] };
    const node = translateConstraint(ir, new Set(), diagnostics);
    const text = renderNode(node as never, regen);
    expect(text).toBe('condition OneOf:\n  True');
    const result = await parse(wrapInType(text!));
    expect(result.hasErrors).toBe(false);
    expect(diagnostics.some((d) => d.code === 'untranslatable-construct')).toBe(true);
  });

  it('exists', async () => {
    const { text } = await assertRoundTrips({ kind: 'exists', path: 'value' });
    expect(text).toBe('condition ValueExists:\n  value exists');
  });

  it('absent', async () => {
    const { text } = await assertRoundTrips({ kind: 'absent', path: 'value' });
    expect(text).toBe('condition ValueAbsent:\n  value is absent');
  });

  it('conditional: if/then recursion', async () => {
    const ir: ConstraintIR = {
      kind: 'conditional',
      if: { kind: 'exists', path: 'flag' },
      then: { kind: 'exists', path: 'value' }
    };
    const { text } = await assertRoundTrips(ir);
    expect(text).toBe('condition ValueExistsConditional:\n  if flag exists then value exists');
  });

  it('custom: always stub + diagnostic', async () => {
    const diagnostics: ImportDiagnostic[] = [];
    const ir: ConstraintIR = { kind: 'custom', expressionText: 'weird source-specific logic', translatable: false };
    const node = translateConstraint(ir, new Set(), diagnostics);
    expect(node.definition).toBe('TODO: manual translation required — source: weird source-specific logic');
    const text = renderNode(node as never, regen);
    const result = await parse(wrapInType(text!));
    expect(result.hasErrors).toBe(false);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe('untranslatable-construct');
  });
});

describe('constraint-translator — deterministic, de-duplicated condition names', () => {
  it('nextConditionName appends numeric suffixes on collision', () => {
    const used = new Set<string>();
    expect(nextConditionName('ValueRange', used)).toBe('ValueRange');
    expect(nextConditionName('ValueRange', used)).toBe('ValueRange2');
    expect(nextConditionName('ValueRange', used)).toBe('ValueRange3');
  });

  it('conditionBaseName follows <AttributeName><ConstraintKind>', () => {
    expect(conditionBaseName({ kind: 'range', path: 'value', min: 0 })).toBe('ValueRange');
    expect(conditionBaseName({ kind: 'length', path: 'partyId', min: 1 })).toBe('PartyIdLength');
    expect(conditionBaseName({ kind: 'pattern', path: 'code', regex: '.*' })).toBe('CodePattern');
    expect(conditionBaseName({ kind: 'oneOf', paths: ['a', 'b'] })).toBe('OneOf');
    expect(conditionBaseName({ kind: 'choice', paths: ['a', 'b'] })).toBe('Choice');
    expect(conditionBaseName({ kind: 'custom', expressionText: 'x', translatable: false })).toBe('Custom');
  });

  it('translateConstraint dedupes across repeated calls sharing one `used` set', () => {
    const used = new Set<string>();
    const diagnostics: ImportDiagnostic[] = [];
    const a = translateConstraint({ kind: 'range', path: 'value', min: 0 }, used, diagnostics);
    const b = translateConstraint({ kind: 'range', path: 'value', max: 10 }, used, diagnostics);
    expect(a.name).toBe('ValueRange');
    expect(b.name).toBe('ValueRange2');
  });
});

describe('isSimplePath', () => {
  it('accepts bare identifiers, rejects dotted / bracketed paths', () => {
    expect(isSimplePath('currency')).toBe(true);
    expect(isSimplePath('capacityUnit')).toBe(true);
    expect(isSimplePath('a.b')).toBe(false);
    expect(isSimplePath('a[0]')).toBe(false);
    expect(isSimplePath('')).toBe(false);
  });
});

describe('translateConstraintExpression — reserved-keyword path escaping', () => {
  it('escapes a path that collides with a Rune keyword', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const expr = translateConstraintExpression({ kind: 'exists', path: 'type' }, diagnostics);
    const text = renderNode(
      {
        $type: 'Condition',
        name: 'C',
        postCondition: false,
        expression: expr,
        annotations: [],
        references: []
      } as never,
      regen
    );
    expect(text).toBe('condition C:\n  ^type exists');
  });
});
