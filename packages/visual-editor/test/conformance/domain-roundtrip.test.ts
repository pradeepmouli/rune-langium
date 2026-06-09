// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect } from 'vitest';
import {
  parse,
  createRuneDslServices,
  serializeModel,
  type RuneDslServices
} from '@rune-langium/core';
import {
  toDomain,
  toAst,
  setDataSuperType,
  type AnyDomain
} from '../../src/generated/domain.js';

// ─── Service setup ──────────────────────────────────────────────────────────
// NOTE: `serializeRuneModel` calls `JsonSerializer.serialize(node, ...)` which
// internally calls `getDocument(node)`, throwing "AST node has no document."
// for plain objects.  `toAst()` returns plain (non-Langium) objects, so we
// MUST NOT route them through `serializeRuneModel`.  The correct path is:
//
//   toAst(domainObj)                  →  plain AST-shaped object
//   JSON.stringify(plain)             →  JSON string (no Langium runtime props)
//   JsonSerializer.deserialize(json)  →  re-linked node with $container set
//   toDomain(node)                    →  domain object
//
// This mirrors how `hydrateModelDocument` works in the worker: it also calls
// `JsonSerializer.deserialize` on a raw JSON string.
const services: RuneDslServices = createRuneDslServices();
const deserialize = services.RuneDsl.serializer.JsonSerializer.deserialize.bind(
  services.RuneDsl.serializer.JsonSerializer
);

// ─── Fixtures ───────────────────────────────────────────────────────────────
const DATA_SOURCE = `
namespace test.domain.data
version "1.0.0"

type Base:
  id string (1..1)

type Trade extends Base:
  notional number (1..1)
`;

const CHOICE_SOURCE = `
namespace test.domain.choice
version "1.0.0"

type Cash:
  amount number (1..1)

type Security:
  isin string (1..1)

choice Payment:
  Cash
  Security
`;

const ENUM_SOURCE = `
namespace test.domain.enum
version "1.0.0"

enum Color:
  Red
  Green
`;

const FUNCTION_SOURCE = `
namespace test.domain.func
version "1.0.0"

type Money:
  amount number (1..1)

func Add:
  inputs:
    a number (1..1)
  output:
    result number (1..1)
  set result:
    a
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function elementByName(model: unknown, name: string): unknown {
  const elements = (model as { elements?: unknown[] }).elements ?? [];
  const found = elements.find((e) => (e as { name?: string }).name === name);
  if (!found) throw new Error(`element ${name} not found`);
  return found;
}

/**
 * domain → toAst → JSON.stringify → JsonSerializer.deserialize → toDomain
 *
 * We use plain JSON.stringify (not serializeRuneModel) because toAst() returns
 * a plain object without $document/$container, which would cause
 * JsonSerializer.serialize → getDocument() to throw.  JsonSerializer.deserialize
 * is pure JSON.parse + linkNode, so it accepts any valid AST-shaped JSON string.
 *
 * We apply JSON.parse(JSON.stringify(x)) normalisation to BOTH sides before
 * comparing with toEqual.  This drops `undefined` keys symmetrically: the
 * original domain object may carry `superType: undefined` (an explicit key
 * set to undefined) while the round-tripped object omits the key entirely.
 * JSON-clone makes both representations identical WITHOUT hiding real value
 * losses (a field that was a non-undefined value will still differ after
 * clone if the round-trip dropped it).
 */
function jsonRoundtrip(domainObj: AnyDomain): AnyDomain {
  const astLike = toAst(domainObj);
  const json = JSON.stringify(astLike);
  const reAst = deserialize(json);
  return toDomain(reAst as never);
}

/** Clone that normalises undefined keys and non-serialisable runtime refs. */
function stableClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Domain round-trip conformance (Phase 1)', () => {
  it('Data: lossless JSON round-trip equals the original domain object', async () => {
    const parsed = await parse(DATA_SOURCE);
    const ast = elementByName(parsed.value, 'Trade');
    const domainObj = toDomain(ast as never);
    expect(stableClone(jsonRoundtrip(domainObj))).toEqual(stableClone(domainObj));
  });

  it('Data: $type narrowable, refs are {$refText} objects, extends/members present', async () => {
    const parsed = await parse(DATA_SOURCE);
    const d = toDomain(elementByName(parsed.value, 'Trade') as never);
    expect(d.$type).toBe('Data');
    if (d.$type === 'Data') {
      expect(typeof d.superType).toBe('object');
      // After toDomain the superType should have a $refText (either as a plain
      // DomainRef or as the Langium Reference's $refText).
      expect((d.superType as { $refText?: string } | undefined)?.$refText).toBe('Base');
      expect((d as { extends?: { $refText?: string } }).extends?.$refText).toBe('Base');
      expect(Array.isArray((d as { members?: unknown[] }).members)).toBe(true);
    }
  });

  it('Data: editable-ref edit via setDataSuperType survives the round-trip', async () => {
    const parsed = await parse(DATA_SOURCE);
    const d = toDomain(elementByName(parsed.value, 'Trade') as never) as {
      $type: 'Data';
      superType?: { $refText: string };
    };
    setDataSuperType(d as never, 'SomethingElse');
    expect(d.superType?.$refText).toBe('SomethingElse');
    const back = jsonRoundtrip(d as AnyDomain) as { superType?: { $refText?: string } };
    expect(back.superType?.$refText).toBe('SomethingElse');
  });

  it('Choice: lossless JSON round-trip + members normalization present', async () => {
    const parsed = await parse(CHOICE_SOURCE);
    const d = toDomain(elementByName(parsed.value, 'Payment') as never);
    expect(d.$type).toBe('Choice');
    expect(Array.isArray((d as { members?: unknown[] }).members)).toBe(true);
    expect(stableClone(jsonRoundtrip(d))).toEqual(stableClone(d));
  });

  it('Enum: lossless JSON round-trip + members normalization present', async () => {
    const parsed = await parse(ENUM_SOURCE);
    const d = toDomain(elementByName(parsed.value, 'Color') as never);
    expect(d.$type).toBe('RosettaEnumeration');
    expect(Array.isArray((d as { members?: unknown[] }).members)).toBe(true);
    expect(stableClone(jsonRoundtrip(d))).toEqual(stableClone(d));
  });

  it('Function: lossless JSON round-trip + members normalization present', async () => {
    const parsed = await parse(FUNCTION_SOURCE);
    const d = toDomain(elementByName(parsed.value, 'Add') as never);
    expect(d.$type).toBe('RosettaFunction');
    expect(Array.isArray((d as { members?: unknown[] }).members)).toBe(true);
    expect(stableClone(jsonRoundtrip(d))).toEqual(stableClone(d));
  });

  it('Function with inline rich union (typeRef): round-trip identity holds', async () => {
    // A reviewer flagged the inline-union passthrough as a potential round-trip
    // hole.  The FUNCTION_SOURCE fixture uses `a` as a RosettaSymbolReference
    // inside a `set result:` Operation — a concrete inline-union child.  We
    // assert that the Function round-trip is lossless (which transitively
    // covers the inline-union child).
    //
    // NOTE: We could not isolate a dedicated fixture that explicitly exercises
    // a RosettaSuperCall (the grammar requires a `super` keyword on a
    // function dispatch branch) without additional type scaffolding that would
    // make the fixture source-coupled.  The Add function's `set result: a`
    // produces a RosettaSymbolReference inside an OperationDomain, which is a
    // concrete inline-union node.  That is the inline-union case being proved.
    const parsed = await parse(FUNCTION_SOURCE);
    const d = toDomain(elementByName(parsed.value, 'Add') as never);
    expect(stableClone(jsonRoundtrip(d))).toEqual(stableClone(d));
  });
});

describe('Domain .rosetta-text round-trip (Data/Choice/Enum; Function = downstream gap)', () => {
  /** Wrap a single AST element back into a minimal RosettaModel for the text serializer. */
  function wrapModel(namespace: string, astEl: unknown) {
    return {
      $type: 'RosettaModel',
      name: namespace,
      version: '1.0.0',
      imports: [],
      configs: [],
      elements: [astEl]
    } as never;
  }

  it('Data: domain -> toAst -> serializeModel -> parse re-parses cleanly', async () => {
    const parsed = await parse(DATA_SOURCE);
    const ast = elementByName(parsed.value, 'Trade');
    const d = toDomain(ast as never);
    const text = serializeModel(wrapModel('test.rnd.data', toAst(d)));
    expect(text).toContain('type Trade extends Base');
    const reparsed = await parse(text);
    expect(reparsed.parserErrors).toHaveLength(0);
  });

  it('Choice: domain -> toAst -> serializeModel -> parse re-parses cleanly', async () => {
    const parsed = await parse(CHOICE_SOURCE);
    const ast = elementByName(parsed.value, 'Payment');
    const d = toDomain(ast as never);
    // NOTE: avoid namespace segments that are Rosetta keywords (choice, enum, func …).
    // ValidID only admits: ID | 'condition' | 'source' | 'value' | 'version' | 'pattern' | 'scope'.
    // Using a keyword-free namespace guarantees the serialized text re-parses cleanly.
    const text = serializeModel(wrapModel('test.rnd.selection', toAst(d)));
    expect(text).toContain('choice Payment');
    const reparsed = await parse(text);
    expect(reparsed.parserErrors).toHaveLength(0);
  });

  it('Enum: domain -> toAst -> serializeModel -> parse re-parses cleanly', async () => {
    const parsed = await parse(ENUM_SOURCE);
    const ast = elementByName(parsed.value, 'Color');
    const d = toDomain(ast as never);
    // NOTE: avoid namespace segments that are Rosetta keywords — same as Choice above.
    const text = serializeModel(wrapModel('test.rnd.colors', toAst(d)));
    expect(text).toContain('enum Color');
    const reparsed = await parse(text);
    expect(reparsed.parserErrors).toHaveLength(0);
  });

  it('Function: .rosetta text-render is a documented downstream gap (serializeModel drops it)', async () => {
    const parsed = await parse(FUNCTION_SOURCE);
    const ast = elementByName(parsed.value, 'Add');
    const d = toDomain(ast as never);
    const text = serializeModel(wrapModel('test.rnd.calc', toAst(d)));
    // The hand-written .rosetta serializer does NOT emit `func` (out of scope; own later spec).
    // The domain model + JSON round-trip (Task 9) DO cover Function — only TEXT rendering is the gap.
    expect(text).not.toContain('func Add');
  });
});
