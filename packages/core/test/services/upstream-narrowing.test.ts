// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { expect, it } from 'vitest';
import { URI, AstUtils } from 'langium';
import { createRuneDslServices } from '../../src/services/rune-dsl-module.js';
import { isAsOperation, isRosettaDeepFeatureCall } from '../../src/generated/ast.js';

it.each([false, true])(
  'links imports and choice narrowing independently of document order (reverse=%s)',
  async (reverse) => {
    const { RuneDsl } = createRuneDslServices();
    const sources = [
      `namespace external
type Security:
 bad string (1..1)
typeAlias Asset: string`,
      `namespace example
type Security:
 amount number (1..1)
type Cash:
 currency string (1..1)
choice Asset:
 Security
 Cash
type Transfer:
 asset Asset (1..1)
choice Transfers:
 Transfer
 Security`,
      `namespace example.functions
import example.*
import example.* as ex
func Select:
 inputs: values Transfers (0..*)
 output: result Transfers (0..*)
 set result: values filter [item ->> asset as ex.Security exists]`
    ];
    if (reverse) sources.reverse();
    const docs = sources.map((source, i) =>
      RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse(`memory:///narrow-${i}.rosetta`))
    );
    await RuneDsl.shared.workspace.DocumentBuilder.build(docs);
    for (const doc of docs) {
      expect(doc.parseResult.parserErrors).toEqual([]);
      for (const node of AstUtils.streamAllContents(doc.parseResult.value)) {
        if (isAsOperation(node)) expect(node.type.ref?.$container?.name).toBe('example');
        if (isRosettaDeepFeatureCall(node)) expect(node.feature?.ref?.$type).toBe('Attribute');
      }
    }
  }
);
