// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { createRuneDslServices } from '@rune-langium/core';
import { URI } from 'langium';
import { generate } from '../src/export.js';

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
});
