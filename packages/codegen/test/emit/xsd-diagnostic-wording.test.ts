// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * unified-type-reference-resolution Task 6 — regression guard for
 * `resolveAttributeType`'s diagnostic wording across its migration onto the
 * shared `resolveTypeCallTarget` resolver. Pre-migration, `resolveAttributeType`
 * produced exactly THREE distinct diagnostic outcomes for three distinct
 * situations (this file, unlike json-schema-emitter's pre-migration shape,
 * had no fourth "unknown type reference kind" catch-all — its structure was
 * simpler: an `if (typeRef) {...}` block with no `else`, so any OTHER
 * typeRef kind, including `RosettaTypeAlias`, silently fell through to the
 * `if (refText) {...}` block below). This file pins each of the three
 * byte-identical to the pre-migration text/code:
 *
 *   1. Basic type resolved, no XSD mapping — distinct code 'unmapped-builtin'
 *      (NOT 'unresolved-ref'), message `Builtin type 'X' has no XSD mapping;
 *      emitting xs:string`. Every real Rosetta builtin name IS mapped in
 *      XSD_BUILTIN_TYPE_MAP — this path is unreachable via real Rune source
 *      both before and after this migration; covered via a synthetic
 *      RosettaBasicType-shaped node to pin the code path's shape.
 *
 *   2. refText present, resolves to nothing (real Rune source: an attribute
 *      typed by a name that doesn't resolve to anything) — code
 *      'unresolved-ref', message `Attribute 'X': type 'Y' is not resolved;
 *      emitting xs:string`. Now routed through `reportUnresolvedReference`,
 *      whose fixed wording already matches this exactly. Covered via real
 *      parse.
 *
 *   3. No typeRef AND no refText at all (a fully-missing type reference —
 *      not reachable via any valid Rune source; only reachable via a
 *      malformed/deserialized AST) — code 'unresolved-ref', message
 *      `Attribute 'X' has an unresolved type reference` — NO
 *      `; emitting xs:string` suffix (deliberately NOT routed through
 *      `reportUnresolvedReference`'s no-refText branch, which would add that
 *      suffix). Covered via a synthetic Attribute (Probe pattern, matching
 *      json-schema-diagnostic-wording.test.ts's ProbeJsonSchemaEmitter
 *      convention) since real parsing cannot produce a `typeCall` with
 *      neither a resolved ref nor `$refText`.
 */

import { describe, it, expect } from 'vitest';
import type { Attribute } from '@rune-langium/core';
import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { XsdNamespaceEmitter, emitNamespace } from '../../src/emit/xsd-emitter.js';
import { walkNamespace } from '../../src/emit/namespace-walker.js';
import type { NamespaceWalkResult } from '../../src/emit/namespace-walker.js';
import type { NamespaceRegistry } from '../../src/emit/namespace-registry.js';
import type { GeneratorDiagnostic } from '../../src/types.js';

async function parseSource(source: string, uri = 'inmemory:///model.rosetta') {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse(uri));
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  const model = doc.parseResult?.value;
  if (!model || !isRosettaModel(model)) {
    throw new Error('expected a RosettaModel');
  }
  return doc;
}

describe('xsd-emitter — resolveAttributeType diagnostic wording (case 2: refText-only unresolved)', () => {
  it('emits xs:string with the exact pre-migration unresolved-ref wording for a genuinely unknown type name', async () => {
    const source = `
namespace test.xsdUnresolvedRefText
version "0.0.0"

type Foo:
    bar TotallyUnknownType (1..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.xsdUnresolvedRefText');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('<xs:element name="bar" type="xs:string"/>');
    expect(output.diagnostics).toContainEqual({
      severity: 'warning',
      code: 'unresolved-ref',
      message: "Attribute 'bar': type 'TotallyUnknownType' is not resolved; emitting xs:string"
    });
  });
});

function emptyWalkResult(): NamespaceWalkResult {
  return {
    docs: [],
    namespace: 'test.diagWording',
    dataByName: new Map(),
    enumByName: new Map(),
    typeAliasByName: new Map(),
    rulesByName: new Map(),
    reportsByName: new Map(),
    annotationsByName: new Map(),
    libraryFuncsByName: new Map(),
    choiceByName: new Map(),
    emitOrder: [],
    cyclicTypes: new Set()
  } as unknown as NamespaceWalkResult;
}

class ProbeXsdEmitter extends XsdNamespaceEmitter {
  callResolveAttributeType(attr: Attribute): string {
    return (this as unknown as { resolveAttributeType(attr: Attribute): string }).resolveAttributeType(attr);
  }
  exposeDiagnostics(): GeneratorDiagnostic[] {
    return this.diagnostics;
  }
}

describe('xsd-emitter — resolveAttributeType diagnostic wording (case 3: no typeRef, no refText)', () => {
  it('emits xs:string with the exact pre-migration wording, WITHOUT the "; emitting xs:string" suffix', () => {
    const registry: NamespaceRegistry = { namespaces: new Map() };
    const emitter = new ProbeXsdEmitter(emptyWalkResult(), {}, registry);
    // No valid Rune source produces a `typeCall` with neither a resolved
    // `.ref` nor `$refText` — this can only arise from a malformed/
    // deserialized AST (see base-namespace-emitter.ts's "malformed
    // cardinality" doc comment for the same class of degraded-input
    // tolerance). Constructed directly to pin the pre-migration wording.
    const attr = { name: 'bar', typeCall: undefined } as unknown as Attribute;
    const result = emitter.callResolveAttributeType(attr);
    expect(result).toBe('xs:string');
    expect(emitter.exposeDiagnostics()).toContainEqual({
      severity: 'warning',
      code: 'unresolved-ref',
      message: "Attribute 'bar' has an unresolved type reference"
    });
  });
});

describe('xsd-emitter — resolveAttributeType diagnostic wording (case 1: unmapped builtin primitive)', () => {
  it('emits xs:string with the distinct unmapped-builtin code and message, not routed through reportUnresolvedReference', () => {
    const registry: NamespaceRegistry = { namespaces: new Map() };
    const emitter = new ProbeXsdEmitter(emptyWalkResult(), {}, registry);
    // Every real Rosetta builtin name IS mapped in XSD_BUILTIN_TYPE_MAP —
    // this path is unreachable via real Rune source both before and after
    // this migration. A synthetic RosettaBasicType-shaped node pins the
    // code path's shape (mapped-is-falsy branch of `onPrimitive`).
    const fakeBasicType = { $type: 'RosettaBasicType', name: 'notARealBuiltin' };
    const attr = {
      name: 'bar',
      typeCall: { type: { ref: fakeBasicType, $refText: 'notARealBuiltin' } }
    } as unknown as Attribute;
    const result = emitter.callResolveAttributeType(attr);
    expect(result).toBe('xs:string');
    expect(emitter.exposeDiagnostics()).toContainEqual({
      severity: 'warning',
      code: 'unmapped-builtin',
      message: "Builtin type 'notARealBuiltin' has no XSD mapping; emitting xs:string"
    });
  });
});
