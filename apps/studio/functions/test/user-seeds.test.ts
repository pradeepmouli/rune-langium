// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import { collectUserSeedNamespaces } from '../api/parse.js';

describe('collectUserSeedNamespaces', () => {
  it('collects importedNamespace from parsed user models', () => {
    const userDocs = [
      { parseResult: { value: { $type: 'RosettaModel', name: 'app', imports: [
        { importedNamespace: 'cdm.trade' }, { importedNamespace: 'cdm.base.*' }
      ] } } }
    ] as never;
    expect([...collectUserSeedNamespaces(userDocs)].sort()).toEqual(['cdm.base.*', 'cdm.trade']);
  });
  it('returns empty for docs with no imports', () => {
    const userDocs = [{ parseResult: { value: { $type: 'RosettaModel', name: 'app' } } }] as never;
    expect(collectUserSeedNamespaces(userDocs).size).toBe(0);
  });
});
