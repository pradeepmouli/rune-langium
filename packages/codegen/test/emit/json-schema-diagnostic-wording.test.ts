// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * unified-type-reference-resolution Task 5 — regression guard for
 * `resolveItemSchema`'s diagnostic wording across its migration onto the
 * shared `resolveTypeCallTarget` resolver. Pre-migration, `resolveItemSchema`
 * produced FOUR distinct diagnostic outcomes for four distinct situations;
 * this file pins each one byte-identical to the pre-migration text/code,
 * except where explicitly noted as a deliberate, disclosed change:
 *
 *   1. refText-only fallback, unresolved (real Rune source: an attribute
 *      typed by a name that doesn't resolve to anything) — code
 *      'unresolved-ref', message `Attribute 'X': type 'Y' is not resolved;
 *      emitting {}`. Now routed through `reportUnresolvedReference`, whose
 *      fixed wording already matches this exactly. Covered via real parse.
 *
 *   2. No typeRef AND no refText at all (a fully-missing type reference —
 *      not reachable via any valid Rune source; only reachable via a
 *      malformed/deserialized AST, mirroring the "malformed cardinality"
 *      degraded-input tolerance documented in base-namespace-emitter.ts) —
 *      code 'unresolved-ref', message `Attribute 'X' has an unresolved type
 *      reference` — NO `; emitting {}` suffix. Covered via a synthetic
 *      Attribute (Probe pattern, matching base-namespace-emitter.test.ts's
 *      existing ProbeJsonSchemaEmitter convention) since real parsing cannot
 *      produce a `typeCall` with neither a resolved ref nor `$refText`.
 *
 *   3. Primitive resolved but has no JSON Schema mapping — distinct code
 *      'unmapped-builtin' (NOT 'unresolved-ref'), message `Builtin type 'X'
 *      has no JSON Schema mapping; emitting {}`. Every real Rosetta builtin
 *      name IS mapped in jsonSchemaProfile (verified: json-schema-profile.ts
 *      basicTypeMap ∪ recordTypeMap ∪ typeAliasMap covers all 12
 *      ROSETTA_BASIC_TYPE_NAMES) — this path was ALREADY unreachable via real
 *      Rune source before this migration, and remains so; covered via a
 *      synthetic RosettaBasicType-shaped node to pin the code path's shape.
 *
 *   4. "Unknown type reference kind for attribute 'X'" (the old catch-all for
 *      a live-linked `typeCall.type.ref` that matched none of
 *      Basic/Enum/Data/Choice) — DELIBERATE, DISCLOSED CHANGE: no test in
 *      this suite (pre-migration) exercised this message (confirmed via
 *      `rg 'Unknown type reference kind'` across packages/codegen/test
 *      returning zero matches before this migration). Post-migration this
 *      case is not merely "collapsed" but structurally eliminated:
 *      `resolveTypeCallTarget` exhaustively dispatches every `RosettaType`
 *      union member (Basic, Record, Enum, Data, Choice, TypeAlias-chase) —
 *      there is no longer any live-linked `typeRef` shape that reaches
 *      `onUnresolved`. The type-alias case that WOULD have hit this old
 *      catch-all (an attribute typed by a live-linked `RosettaTypeAlias`
 *      reference) now correctly resolves through the alias chain instead —
 *      see json-schema-type-alias-field.test.ts.
 */

import { describe, it, expect } from 'vitest';
import type { Attribute } from '@rune-langium/core';
import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { JsonSchemaNamespaceEmitter, emitNamespace } from '../../src/emit/json-schema-emitter.js';
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

describe('json-schema-emitter — resolveItemSchema diagnostic wording (case 1: refText-only unresolved)', () => {
  it('emits {} with the exact pre-migration unresolved-ref wording for a genuinely unknown type name', async () => {
    const source = `
namespace test.jsonSchemaUnresolvedRefText
version "0.0.0"

type Foo:
    bar TotallyUnknownType (0..1)
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.jsonSchemaUnresolvedRefText');
    const output = emitNamespace(model, {});
    const schema = JSON.parse(output.content) as { $defs: Record<string, { properties: Record<string, unknown> }> };
    expect(schema.$defs['Foo']!.properties['bar']).toEqual({});
    expect(output.diagnostics).toContainEqual({
      severity: 'warning',
      code: 'unresolved-ref',
      message: "Attribute 'bar': type 'TotallyUnknownType' is not resolved; emitting {}"
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

class ProbeJsonSchemaEmitter extends JsonSchemaNamespaceEmitter {
  callResolveItemSchema(attr: Attribute): object {
    return (this as unknown as { resolveItemSchema(attr: Attribute): object }).resolveItemSchema(attr);
  }
  exposeDiagnostics(): GeneratorDiagnostic[] {
    return this.diagnostics;
  }
}

describe('json-schema-emitter — resolveItemSchema diagnostic wording (case 2: no typeRef, no refText)', () => {
  it('emits {} with the exact pre-migration wording, WITHOUT the "; emitting {}" suffix', () => {
    const registry: NamespaceRegistry = { namespaces: new Map() };
    const emitter = new ProbeJsonSchemaEmitter(emptyWalkResult(), {}, registry);
    // No valid Rune source produces a `typeCall` with neither a resolved
    // `.ref` nor `$refText` — this can only arise from a malformed/
    // deserialized AST (see base-namespace-emitter.ts's "malformed
    // cardinality" doc comment for the same class of degraded-input
    // tolerance). Constructed directly to pin the pre-migration wording.
    const attr = { name: 'bar', typeCall: undefined } as unknown as Attribute;
    const result = emitter.callResolveItemSchema(attr);
    expect(result).toEqual({});
    expect(emitter.exposeDiagnostics()).toContainEqual({
      severity: 'warning',
      code: 'unresolved-ref',
      message: "Attribute 'bar' has an unresolved type reference"
    });
  });
});

describe('json-schema-emitter — resolveItemSchema diagnostic wording (case 3: unmapped builtin primitive)', () => {
  it('emits {} with the distinct unmapped-builtin code and message, not routed through reportUnresolvedReference', () => {
    const registry: NamespaceRegistry = { namespaces: new Map() };
    const emitter = new ProbeJsonSchemaEmitter(emptyWalkResult(), {}, registry);
    // Every real Rosetta builtin name IS mapped in jsonSchemaProfile — this
    // path is unreachable via real Rune source both before and after this
    // migration. A synthetic RosettaBasicType-shaped node pins the code
    // path's shape (mapped-is-falsy branch of `onPrimitive`).
    const fakeBasicType = { $type: 'RosettaBasicType', name: 'notARealBuiltin' };
    const attr = {
      name: 'bar',
      typeCall: { type: { ref: fakeBasicType, $refText: 'notARealBuiltin' } }
    } as unknown as Attribute;
    const result = emitter.callResolveItemSchema(attr);
    expect(result).toEqual({});
    expect(emitter.exposeDiagnostics()).toContainEqual({
      severity: 'warning',
      code: 'unmapped-builtin',
      message: "Builtin type 'notARealBuiltin' has no JSON Schema mapping; emitting {}"
    });
  });
});
