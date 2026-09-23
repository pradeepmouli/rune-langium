// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { parseWorkspace } from '@rune-langium/core';
import { describe, expect, it } from 'vitest';
import { createEditorStore } from '../../src/store/editor-store.js';
import { selectNodeRepository } from '../../src/store/node-repository.js';
import { buildTypeOptions } from '../../src/utils/type-options.js';

const WORKSPACE_SOURCES = [
  {
    uri: 'test/one.rosetta',
    content: `
namespace test.one
version "1.0.0"

type Party:
  name string (1..1)

choice PartyRole:
  Party
`
  },
  {
    uri: 'test/two.rosetta',
    content: `
namespace test.two
version "1.0.0"

type Party:
  identifier string (1..1)

func PartyName:
  inputs:
    party Party (1..1)
  output:
    result string (1..1)
  set result:
    party -> name
`
  }
];

describe('buildTypeOptions', () => {
  it('projects repository entries with qualified values, namespaces, built-ins, and deferred entries', async () => {
    const store = createEditorStore();
    store.getState().loadDeferredExports([
      {
        filePath: 'test/deferred.rosetta',
        namespace: 'test.deferred',
        exports: [{ type: 'Data', name: 'DeferredParty' }]
      }
    ]);
    const parsed = await parseWorkspace(WORKSPACE_SOURCES);
    store.getState().loadModels(parsed.map((result) => result.value));

    const repository = selectNodeRepository(store.getState().nodesById);
    const options = buildTypeOptions(repository);

    expect(options).toEqual(
      expect.arrayContaining([
        { value: 'builtin::string', label: 'string', kind: 'builtin' },
        { value: 'test.one.Party#Data', label: 'Party', kind: 'data', namespace: 'test.one' },
        { value: 'test.two.Party#Data', label: 'Party', kind: 'data', namespace: 'test.two' },
        { value: 'test.one.PartyRole#Choice', label: 'PartyRole', kind: 'choice', namespace: 'test.one' },
        { value: 'test.two.PartyName#RosettaFunction', label: 'PartyName', kind: 'func', namespace: 'test.two' },
        { value: 'test.deferred.DeferredParty#Data', label: 'DeferredParty', kind: 'data', namespace: 'test.deferred' }
      ])
    );
    expect(options.filter((option) => option.label === 'Party').map((option) => option.value)).toEqual([
      'test.one.Party#Data',
      'test.two.Party#Data'
    ]);
    expect(buildTypeOptions(repository, false).some((option) => option.kind === 'builtin')).toBe(false);
  });
});
