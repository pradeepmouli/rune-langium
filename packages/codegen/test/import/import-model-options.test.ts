// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { importModel } from '../../src/import/index.js';

describe('importModel — new per-format options pass through', () => {
  it('includeUnreferencedDefs: false narrows json-schema output', async () => {
    // CycleA/CycleB reference only each other, so neither is reachable from
    // the sole root (Root) — a standalone zero-ref def would instead be kept
    // as its own root under the corrected filterUnreferencedDefs design.
    const source = JSON.stringify({
      $defs: {
        Root: { type: 'object', properties: { child: { $ref: '#/$defs/Referenced' } } },
        Referenced: { type: 'object', properties: { x: { type: 'string' } } },
        CycleA: { type: 'object', properties: { b: { $ref: '#/$defs/CycleB' } } },
        CycleB: { type: 'object', properties: { a: { $ref: '#/$defs/CycleA' } } }
      }
    });
    const result = await importModel(source, {
      from: 'json-schema',
      namespace: 'demo',
      includeUnreferencedDefs: false
    });
    expect(result.model.types.map((t) => t.name)).not.toContain('CycleA');
    expect(result.model.types.map((t) => t.name)).not.toContain('CycleB');
  });

  it('importTopLevelElements: true reaches the xsd reader', async () => {
    const source = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:demo">
  <xs:element name="RootThing" type="xs:string"/>
</xs:schema>`;
    const result = await importModel(source, {
      from: 'xsd',
      namespace: 'demo',
      importTopLevelElements: true
    });
    expect(result.model.types.map((t) => t.name)).toContain('RootThing');
  });
});
