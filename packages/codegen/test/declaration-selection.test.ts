// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate, resolveExportSelection } from '../src/export.js';

describe('declaration selection', () => {
  it('includes a selected declaration dependency and excludes an unrelated sibling', async () => {
    const { RuneDsl } = createRuneDslServices();
    await RuneDsl.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      `namespace test
type Dep:
  value string (1..1)
type Party:
  dep Dep (1..1)
type Unrelated:
  ignored string (1..1)`,
      URI.parse('inmemory:///selection.rosetta')
    );
    await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
    expect(doc.diagnostics ?? []).toEqual([]);

    const outputs = await generate(doc, {
      target: 'typescript',
      selection: { namespaces: [], declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }] }
    });
    const content = outputs.map((output) => output.content).join('\n');
    expect(content).toMatch(/(?:class|interface|type|enum)\s+Party\b/);
    expect(content).toMatch(/(?:class|interface|type|enum)\s+Dep\b/);
    expect(content).not.toMatch(/(?:class|interface|type|enum)\s+Unrelated\b/);
  });

  it('treats a selected namespace as roots for all of its declarations', async () => {
    const { RuneDsl } = createRuneDslServices();
    await RuneDsl.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      `namespace test
type Included:
  value string (1..1)
type AlsoIncluded:
  value string (1..1)`,
      URI.parse('inmemory:///selection-namespace.rosetta')
    );
    await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
    expect(doc.diagnostics ?? []).toEqual([]);

    const outputs = await generate(doc, {
      target: 'typescript',
      selection: { namespaces: ['test'], declarations: [] }
    });
    const content = outputs.map((output) => output.content).join('\n');
    expect(content).toMatch(/(?:class|interface|type|enum)\s+Included\b/);
    expect(content).toMatch(/(?:class|interface|type|enum)\s+AlsoIncluded\b/);
  });

  it('reports unknown declaration roots without mutating the source document', async () => {
    const { RuneDsl } = createRuneDslServices();
    await RuneDsl.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(
      `namespace test
type Party:
  name string (1..1)`,
      URI.parse('inmemory:///selection-unknown.rosetta')
    );
    await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
    const model = doc.parseResult.value as unknown as { elements: unknown[] };
    const elements = model.elements;

    const result = resolveExportSelection([doc], {
      namespaces: [],
      declarations: [{ namespace: 'test', name: 'Missing', kind: 'Data' }]
    });

    expect(result.unknown).toEqual([{ namespace: 'test', name: 'Missing', kind: 'Data' }]);
    expect(result.documents).toEqual([]);
    expect(model.elements).toBe(elements);
  });
});
