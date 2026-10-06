// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { URI } from 'langium';
import { compactLspModelJson, serializeRuneModel } from '@rune-langium/core';
import { createRuneLspServer } from '../src/rune-dsl-server.js';

const source = `namespace example
// UTF-16: café 🦊
func First:
  inputs: values int (0..*)
  output: result int (0..*)
  set result: values filter item > 0
    extract item + 1

type Later:
  value int (1..1)

type Caller:
  target Later (1..1)
`;

async function fixture() {
  const lsp = createRuneLspServer();
  await lsp.shared.workspace.WorkspaceManager.initialized({});
  const uri = URI.parse('file:///workspace/positions.rosetta');
  const document = lsp.shared.workspace.LangiumDocumentFactory.fromString(source, uri);
  lsp.shared.workspace.LangiumDocuments.addDocument(document);
  await lsp.shared.workspace.DocumentBuilder.build([document], { validation: true });
  expect(document.parseResult.lexerErrors).toEqual([]);
  expect(document.parseResult.parserErrors).toEqual([]);
  return { lsp, document, uri };
}

describe('source positions after implicit brackets', () => {
  it('resolves a definition at the original editor offset after multiple bare expressions', async () => {
    const { lsp, document, uri } = await fixture();
    const definitions = await lsp.services.lsp.DefinitionProvider!.getDefinition(document, {
      textDocument: { uri: uri.toString() },
      position: document.textDocument.positionAt(source.lastIndexOf('Later'))
    });
    expect(definitions).toMatchObject([
      {
        targetUri: uri.toString(),
        targetSelectionRange: {
          start: document.textDocument.positionAt(source.indexOf('Later')),
          end: document.textDocument.positionAt(source.indexOf('Later') + 'Later'.length)
        }
      }
    ]);
  });

  it('preserves definition locations through serialized model hydration', async () => {
    const { lsp, document, uri } = await fixture();
    const serialized = compactLspModelJson(
      serializeRuneModel(lsp.services.serializer.JsonSerializer, document.parseResult.value)
    );
    const target = createRuneLspServer();
    await target.shared.workspace.WorkspaceManager.initialized({});
    await target.syncModels({ document: { uri: uri.toString(), modelJson: serialized } });
    await target.syncModels({ retain: [uri.toString()] });
    const userUri = URI.parse('file:///workspace/user.rosetta');
    const user = target.shared.workspace.LangiumDocumentFactory.fromString(
      'namespace example\ntype Use:\n  target Later (1..1)\n',
      userUri
    );
    target.shared.workspace.LangiumDocuments.addDocument(user);
    await target.shared.workspace.DocumentBuilder.build([user], { validation: true });
    const definitions = await target.services.lsp.DefinitionProvider!.getDefinition(user, {
      textDocument: { uri: userUri.toString() },
      position: { line: 2, character: 10 }
    });
    expect(definitions).toMatchObject([
      {
        targetUri: uri.toString(),
        targetSelectionRange: {
          start: document.textDocument.positionAt(source.indexOf('Later')),
          end: document.textDocument.positionAt(source.indexOf('Later') + 'Later'.length)
        }
      }
    ]);
  });

  it('reports a linking diagnostic at its original column after same-line brackets', async () => {
    const { lsp } = await fixture();
    const content = `${source}\nfunc Broken:\n  output: result int (0..*)\n  set result: ([1, 2] extract item) + Missing`;
    const uri = URI.parse('file:///workspace/broken.rosetta');
    const document = lsp.shared.workspace.LangiumDocumentFactory.fromString(content, uri);
    lsp.shared.workspace.LangiumDocuments.addDocument(document);
    await lsp.shared.workspace.DocumentBuilder.build([document], { validation: true });
    expect(document.parseResult.parserErrors).toEqual([]);
    const diagnostic = document.diagnostics!.find((entry) => entry.message.includes("'Missing'"));
    expect(diagnostic).toBeDefined();
    expect(diagnostic!.range).toEqual({
      start: document.textDocument.positionAt(content.indexOf('Missing')),
      end: document.textDocument.positionAt(content.indexOf('Missing') + 'Missing'.length)
    });
  });
  it.each(['([1, 2] extract item', '[1, 2] filter @'])(
    'anchors errors on synthetic brackets at the original expression: %s',
    async (expression) => {
      const { lsp } = await fixture();
      const content = `namespace example\nfunc Broken:\n  output: result int (0..*)\n  set result: ${expression}`;
      const document = lsp.shared.workspace.LangiumDocumentFactory.fromString(
        content,
        URI.parse('file:///workspace/incomplete.rosetta')
      );
      await lsp.shared.workspace.DocumentBuilder.build([document], { validation: true });
      const diagnostic = document.diagnostics!.find((entry) => entry.data?.code === 'parsing-error');
      expect(diagnostic).toBeDefined();
      const end = document.textDocument.positionAt(content.length);
      expect(diagnostic!.range).toEqual({ start: end, end });
    }
  );
  it('completes a later declaration using the original edit range', async () => {
    const { lsp } = await fixture();
    const content = `namespace completion

type Record:
  value int (1..1)

func Test:
  inputs: values int (0..*)
  output: result int (0..*)
  set result: values extract item

type After:
  value R`;
    const uri = URI.parse('file:///workspace/completion.rosetta');
    const document = lsp.shared.workspace.LangiumDocumentFactory.fromString(content, uri);
    lsp.shared.workspace.LangiumDocuments.addDocument(document);
    await lsp.shared.workspace.DocumentBuilder.build([document], { validation: true });
    const completions = await lsp.services.lsp.CompletionProvider!.getCompletion(document, {
      textDocument: { uri: uri.toString() },
      position: document.textDocument.positionAt(content.length)
    });
    expect(completions!.items.map((item) => item.label)).toEqual(['Record']);
    expect(completions!.items[0]!.textEdit).toEqual({
      newText: 'Record',
      range: {
        start: document.textDocument.positionAt(content.length - 1),
        end: document.textDocument.positionAt(content.length)
      }
    });
  });
});
