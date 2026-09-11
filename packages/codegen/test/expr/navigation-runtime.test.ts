// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import {
  createRuneDslServices,
  isRosettaFeatureCall,
  isRosettaDeepFeatureCall,
  isRosettaImplicitVariable,
  isRosettaModel,
  isRosettaSymbolReference,
  type RosettaExpression
} from '@rune-langium/core';
import { URI } from 'langium';
import ts from 'typescript-classic';
import { expressionIsMany, renderNavigation } from '../../src/expr/navigation.js';

const SOURCE = `namespace test.navigation
type Child:
  value int (1..1)
type Parent:
  children Child (0..*)
type EconomicTerms:
  marker string (1..1)
type Product:
  economicTerms EconomicTerms (1..1)
type Underlier:
  product Product (1..1)
func Collect:
  inputs:
    parent Parent (1..1)
  output:
    result int (0..*)
  set result: parent -> children -> value
func FilterChildren:
  inputs:
    parent Parent (1..1)
  output:
    result Child (0..*)
  set result: parent -> children filter [item -> value = 1]
func MapValues:
  inputs:
    parent Parent (1..1)
  output:
    result int (0..*)
  set result: parent -> children extract [item -> value]
func FindTerms:
  inputs:
    underlier Underlier (1..1)
  output:
    result EconomicTerms (0..1)
  set result: underlier ->> economicTerms
`;

function renderExpression(expression: RosettaExpression): string {
  if (isRosettaImplicitVariable(expression)) return 'input';
  if (isRosettaSymbolReference(expression)) {
    const name = expression.symbol?.ref?.name ?? expression.symbol?.$refText ?? '?';
    return `input[${JSON.stringify(name)}]`;
  }
  if (isRosettaFeatureCall(expression) || isRosettaDeepFeatureCall(expression)) {
    return renderNavigation(expression, renderExpression) ?? 'undefined';
  }
  return 'undefined';
}

async function parseFunctions() {
  const { RuneDsl } = createRuneDslServices();
  const document = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
    SOURCE,
    URI.parse('inmemory:///navigation-runtime.rosetta')
  );
  await RuneDsl.shared.workspace.DocumentBuilder.build([document]);
  expect(document.parseResult.parserErrors).toEqual([]);
  const model = document.parseResult.value;
  if (!isRosettaModel(model)) throw new Error('expected a RosettaModel');
  return model.elements.filter((element) => element.$type === 'RosettaFunction');
}

function compile(source: string, functionName: string): (input: Record<string, unknown>) => unknown {
  const fileName = '/generated-navigation.ts';
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

function functionSource(
  functionNode: { name: string; operations: Array<{ expression: RosettaExpression }> },
  resultType: string
): string {
  const expression = renderExpression(functionNode.operations[0]!.expression);
  if (functionNode.name === 'Collect') {
    return `type ChildShape = { value: number }; type ParentShape = { children: ChildShape[] }; export function Collect(input: { parent: ParentShape }): ${resultType} { return ${expression}; }`;
  }
  return `type EconomicTermsShape = { marker: string }; type ProductShape = { economicTerms: EconomicTermsShape }; type UnderlierShape = { product: ProductShape }; export function FindTerms(input: { underlier: UnderlierShape }): ${resultType} { return ${expression}; }`;
}

describe('linked navigation runtime rendering', () => {
  it('reports collection cardinality for navigation and higher-order operations', async () => {
    const functions = await parseFunctions();
    expect(expressionIsMany(functions.find((func) => func.name === 'Collect')!.operations[0]!.expression)).toBe(true);
    expect(expressionIsMany(functions.find((func) => func.name === 'FilterChildren')!.operations[0]!.expression)).toBe(
      true
    );
    expect(expressionIsMany(functions.find((func) => func.name === 'MapValues')!.operations[0]!.expression)).toBe(true);
  });

  it('maps and flattens a navigation through an array-valued feature', async () => {
    const functions = await parseFunctions();
    const node = functions.find((func) => func.name === 'Collect')!;
    const collect = compile(functionSource(node, 'number[]'), 'Collect');
    expect(collect({ parent: { children: [{ value: 1 }, { value: 2 }] } })).toEqual([1, 2]);
    expect(collect({ parent: { children: [] } })).toEqual([]);
  });

  it('resolves a deep target through a valid multi-hop Data path', async () => {
    const functions = await parseFunctions();
    const node = functions.find((func) => func.name === 'FindTerms')!;
    const findTerms = compile(functionSource(node, 'EconomicTermsShape | undefined'), 'FindTerms');
    expect(findTerms({ underlier: { product: { economicTerms: { marker: 'ok' } } } })).toEqual({ marker: 'ok' });
    expect(findTerms({ underlier: { product: {} } })).toBeUndefined();
  });
});
