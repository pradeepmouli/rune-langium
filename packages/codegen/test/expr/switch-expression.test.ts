// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import {
  createRuneDslServices,
  isRosettaFeatureCall,
  isRosettaDeepFeatureCall,
  isRosettaImplicitVariable,
  isRosettaIntLiteral,
  isRosettaNumberLiteral,
  isRosettaStringLiteral,
  isRosettaSymbolReference,
  isRosettaModel,
  type RosettaExpression
} from '@rune-langium/core';
import { URI } from 'langium';
import ts from 'typescript-classic';
import { renderNavigation } from '../../src/expr/navigation.js';
import { renderSwitchExpression } from '../../src/expr/switch-expression.js';

const SOURCE = `namespace test.switching
enum Kind:
  Cash
  Credit
type Loan:
  details Details (1..1)
type Details:
  amount int (1..1)
type Bond:
  coupon int (1..1)
choice Instrument:
  Loan
  Bond
func PickChoice:
  inputs:
    instrument Instrument (1..1)
  output:
    result int (1..1)
  set result:
    instrument switch
      Loan then item ->> amount,
      Bond then 2,
      default 0
func PickData:
  inputs:
    loan Loan (1..1)
  output:
    result int (1..1)
  set result: loan switch Loan then item ->> amount, default 0
func PickEnum:
  inputs:
    kind Kind (1..1)
  output:
    result int (1..1)
  set result: kind switch Cash then 1, Credit then 2, default 0
`;

function renderExpression(expression: RosettaExpression, options: { selfName?: string } = {}): string {
  if (isRosettaImplicitVariable(expression)) return options.selfName ?? 'input';
  if (isRosettaSymbolReference(expression)) {
    const name = expression.symbol?.ref?.name ?? expression.symbol?.$refText ?? '?';
    return options.selfName && name === 'item' ? options.selfName : `input[${JSON.stringify(name)}]`;
  }
  if (isRosettaFeatureCall(expression) || isRosettaDeepFeatureCall(expression)) {
    return renderNavigation(expression, (child) => renderExpression(child, options)) ?? 'undefined';
  }
  if (isRosettaIntLiteral(expression) || isRosettaNumberLiteral(expression)) return String(expression.value);
  if (isRosettaStringLiteral(expression)) return JSON.stringify(expression.value);
  return 'undefined';
}

async function parseFunctions() {
  const { RuneDsl } = createRuneDslServices();
  const document = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    SOURCE,
    URI.parse('inmemory:///switch-expression.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([document]);
  expect(document.parseResult.parserErrors).toEqual([]);
  const model = document.parseResult.value;
  if (!isRosettaModel(model)) throw new Error('expected a RosettaModel');
  return model.elements.filter((element) => element.$type === 'RosettaFunction');
}

function execute(source: string, functionName: string): (input: Record<string, unknown>) => unknown {
  const fileName = '/generated-switch.ts';
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    skipLibCheck: true,
    types: []
  };
  const host = ts.createCompilerHost(options);
  const readFile = host.readFile.bind(host);
  host.readFile = (file) => (file === fileName ? source : readFile(file));
  const program = ts.createProgram([fileName], options, host);
  expect(ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))).toEqual(
    []
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const exports: Record<string, (input: Record<string, unknown>) => unknown> = {};
  new Function('exports', js)(exports);
  return exports[functionName]!;
}

function emittedFunction(functionNode: { name: string; operations: Array<{ expression: RosettaExpression }> }): string {
  const expression = functionNode.operations[0]!.expression;
  const rendered = renderSwitchExpression(expression, { renderExpression });
  if (!rendered) throw new Error(`expected switch in ${functionNode.name}`);
  if (functionNode.name === 'PickChoice') {
    return `type LoanShape = { details: { amount: number } }; type BondShape = { coupon: number }; type Instrument = { loan: LoanShape } | { bond: BondShape }; export function PickChoice(input: { instrument: Instrument }): number | undefined { return ${rendered}; }`;
  }
  if (functionNode.name === 'PickData') {
    return `type LoanShape = { details: { amount: number } }; export function PickData(input: { loan: LoanShape }): number | undefined { return ${rendered}; }`;
  }
  return `type Kind = 'Cash' | 'Credit'; export function PickEnum(input: { kind: Kind }): number { return ${rendered}; }`;
}

describe('linked switch expression rendering', () => {
  it('selects Choice option paths and binds item for plain-object runtime shapes', async () => {
    const functions = await parseFunctions();
    const node = functions.find((func) => func.name === 'PickChoice')!;
    const pick = execute(emittedFunction(node as never), 'PickChoice');
    expect(pick({ instrument: { loan: { details: { amount: 7 } } } })).toBe(7);
    expect(pick({ instrument: { bond: { coupon: 12 } } })).toBe(2);
    expect(pick({ instrument: {} })).toBe(0);
  });

  it('uses structural Data guards and preserves enum guard equality', async () => {
    const functions = await parseFunctions();
    const data = functions.find((func) => func.name === 'PickData')!;
    const enumFunc = functions.find((func) => func.name === 'PickEnum')!;
    const pickData = execute(emittedFunction(data as never), 'PickData');
    const pickEnum = execute(emittedFunction(enumFunc as never), 'PickEnum');
    expect(pickData({ loan: { details: { amount: 4 } } })).toBe(4);
    expect(pickData({ loan: {} })).toBe(0);
    expect(pickEnum({ kind: 'Cash' })).toBe(1);
    expect(pickEnum({ kind: 'Credit' })).toBe(2);
    expect(pickEnum({ kind: 'Other' })).toBe(0);
  });
});
