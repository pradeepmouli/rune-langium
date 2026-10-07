// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { AstUtils, CstUtils, URI } from 'langium';
import type { RosettaModel } from '../../src/generated/ast.js';
import { createRuneDslServices } from '../../src/services/rune-dsl-module.js';
import { insertImplicitBrackets } from '../../src/services/rune-dsl-parser.js';
import { RUNE_SERIALIZE_OPTIONS, serializeRuneModel } from '../../src/serializer/rune-serialize.js';

const { RuneDsl, shared } = createRuneDslServices();
const prefix = `namespace test.positions
// Unicode offsets are UTF-16: café 🦊
func First:
  inputs: values int (0..*)
  output: result int (0..*)
  set result: values filter item > 0
    extract item + 1

func Later:
  output: result int (1..1)
  set result: 42
`;

function document(source: string) {
  return shared.workspace.LangiumDocumentFactory.fromString<RosettaModel>(
    source,
    URI.parse('inmemory:///positions.rosetta')
  );
}

function assertSourceCoordinates(source: string) {
  const doc = document(source);
  expect(doc.parseResult.lexerErrors).toEqual([]);
  expect(doc.parseResult.parserErrors).toEqual([]);
  const root = doc.parseResult.value.$cstNode!;
  expect(root.root.fullText).toBe(source);
  for (const cst of CstUtils.streamCst(root)) {
    expect(cst.range.start).toEqual(doc.textDocument.positionAt(cst.offset));
    expect(cst.range.end).toEqual(doc.textDocument.positionAt(cst.end));
    expect(cst.text).toBe(source.slice(cst.offset, cst.end));
  }
  return doc;
}

describe('implicit bracket source positions', () => {
  it.each(['\n', '\r\n'])('keeps CST and serialized declaration ranges in original %j source', (newline) => {
    const source = prefix.replaceAll('\n', newline);
    const doc = assertSourceCoordinates(source);
    const later = doc.parseResult.value.elements[1]!;
    expect(later.$cstNode!.offset).toBe(source.indexOf('func Later'));
    expect(later.$cstNode!.text).toBe(source.slice(source.indexOf('func Later')).trimEnd());
    const serialized = JSON.parse(serializeRuneModel(RuneDsl.serializer.JsonSerializer, doc.parseResult.value));
    expect(serialized.elements[1].$textRegion.offset).toBe(source.indexOf('func Later'));
    expect(serialized.elements[1].$textRegion.range).toEqual(later.$cstNode!.range);
    expect(serialized.elements[1].$textRegion.assignments.name[0].offset).toBe(source.indexOf('Later'));
  });

  it.each([
    'values extract (values filter item > 0)',
    'values extract (values extract item + 1)',
    'values extract values extract item',
    'values extract /* café 🦊\n    hidden comment */ item',
    'values extract "café 🦊" // trailing comment',
    'values reduce item + 1',
    'values extract "café 🦊"',
    'values filter [item > 0]'
  ])('preserves nested expression semantics and positions: %s', (expression) => {
    const source = `namespace test.positions\nfunc Test:\n  output: result int (0..*)\n  set result: ${expression}`;
    const doc = assertSourceCoordinates(source);
    const normalized = document(insertImplicitBrackets(source));
    const serializer = RuneDsl.serializer.JsonSerializer;
    const options = { ...RUNE_SERIALIZE_OPTIONS, textRegions: false };
    expect(serializer.serialize(doc.parseResult.value, options)).toBe(
      serializer.serialize(normalized.parseResult.value, options)
    );
    for (const node of AstUtils.streamAllContents(doc.parseResult.value)) {
      expect(node.$cstNode!.end).toBeLessThanOrEqual(source.length);
    }
  });

  it('maps parser error and previous-token locations after same-line insertions', () => {
    const source = `${prefix.trimEnd()}\nfunc Broken:\n  output: result int (1..1)\n  set result: (1 extract item) + )`;
    const doc = document(source);
    const error = doc.parseResult.parserErrors.find(
      (entry) => entry.token.startOffset >= source.indexOf('func Broken')
    )!;
    expect(error).toBeDefined();
    expect(error.token.startOffset).toBe(source.lastIndexOf(')'));
    expect(error.token.startLine).toBe(doc.textDocument.positionAt(source.lastIndexOf(')')).line + 1);
    expect(error.token.startColumn).toBe(doc.textDocument.positionAt(source.lastIndexOf(')')).character + 1);
    for (const token of [error.previousToken, ...error.resyncedTokens]) {
      if (token.startOffset >= 0 && token.endOffset! >= token.startOffset) {
        expect(source.slice(token.startOffset, token.endOffset! + 1)).toBe(token.image);
      }
    }
  });

  it('maps lexer error offsets, columns and messages after same-line insertions', () => {
    const source = `${prefix.trimEnd()}\nfunc Broken:\n  output: result int (1..1)\n  set result: (1 extract item) + @`;
    const doc = document(source);
    const error = doc.parseResult.lexerErrors[0]!;
    const offset = source.indexOf('@');
    expect(error.offset).toBe(offset);
    expect(error.line).toBe(doc.textDocument.positionAt(offset).line + 1);
    expect(error.column).toBe(doc.textDocument.positionAt(offset).character + 1);
    expect(error.message).toContain(`offset: ${offset}`);
  });
  it('does not retain insertion offsets when parsing an untransformed document next', () => {
    assertSourceCoordinates(prefix);
    assertSourceCoordinates('namespace clean\ntype After:\n  value int (1..1)\n');
  });
  it('keeps incomplete-string source ranges within the original input', () => {
    const source =
      'namespace test.positions\nfunc Broken:\n  output: result string (1..1)\n  set result: [1] extract "unfinished' +
      '\\';
    const doc = document(source);
    expect(doc.parseResult.lexerErrors.length + doc.parseResult.parserErrors.length).toBeGreaterThan(0);
    for (const cst of CstUtils.streamCst(doc.parseResult.value.$cstNode!)) {
      expect(cst.end).toBeLessThanOrEqual(source.length);
      expect(cst.range.end).toEqual(doc.textDocument.positionAt(cst.end));
      expect(cst.text).toBe(source.slice(cst.offset, cst.end));
    }
  });

  it('does not transform operators inside single-quoted string literals', () => {
    const source =
      "namespace test.positions\nfunc Quoted:\n  output: result string (1..1)\n  set result: 'extract item ]'";
    expect(insertImplicitBrackets(source)).toBe(source);
    assertSourceCoordinates(source);
  });
});
