// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * buildAttributeTypesMap — walks the FULL `extends` chain (not just the
 * direct parent). Found via the transpiler-emitter-parity corpus gate:
 * `QuantitySchedule extends MeasureSchedule extends MeasureBase`, with
 * `unit` declared on the grandparent `MeasureBase`, was reported as an
 * "unknown attribute" by `condition UnitOfAmountExists: unit exists` —
 * a real pre-existing gap (attributes 2+ levels up an extends chain were
 * silently invisible to exists/absent condition validation), not something
 * introduced by the W1/W2 work.
 */

import { describe, it, expect, vi } from 'vitest';
import { parseWorkspace, isData, type Data, type RosettaCardinality } from '@rune-langium/core';
import {
  buildAttributeTypesMap,
  decodeCardinality,
  BaseNamespaceEmitter
} from '../../src/emit/base-namespace-emitter.js';
import type { NamespaceWalkResult } from '../../src/emit/namespace-walker.js';
import type { NamespaceRegistry } from '../../src/emit/namespace-registry.js';
import type { GeneratorOutput, GeneratorDiagnostic } from '../../src/types.js';
import { ZodNamespaceEmitter } from '../../src/emit/zod-emitter.js';
import { TsNamespaceEmitter } from '../../src/emit/ts-emitter.js';
import { JsonSchemaNamespaceEmitter } from '../../src/emit/json-schema-emitter.js';

async function parseSingleNamespaceDataByName(source: string): Promise<Map<string, Data>> {
  const [result] = await parseWorkspace([{ uri: 'inmemory:///model.rosetta', content: source }]);
  expect(result!.hasErrors, 'expected fixture to parse without errors').toBe(false);
  const model = result!.value as unknown as { elements: unknown[] };
  const map = new Map<string, Data>();
  for (const el of model.elements) {
    if (isData(el)) map.set(el.name, el);
  }
  return map;
}

const THREE_LEVEL_FIXTURE = `
namespace test.inherit
version "0.0.0"

type GrandParent:
    unit string (0..1)

type Parent extends GrandParent:
    middle string (0..1)

type Child extends Parent:
    own string (0..1)

    condition UnitExists:
        unit exists
`;

describe('buildAttributeTypesMap', () => {
  it('includes own attributes', async () => {
    const dataByName = await parseSingleNamespaceDataByName(THREE_LEVEL_FIXTURE);
    const child = dataByName.get('Child')!;
    const map = buildAttributeTypesMap(child);
    expect(map.has('own')).toBe(true);
  });

  it('includes direct-parent attributes (pre-existing behavior)', async () => {
    const dataByName = await parseSingleNamespaceDataByName(THREE_LEVEL_FIXTURE);
    const child = dataByName.get('Child')!;
    const map = buildAttributeTypesMap(child);
    expect(map.has('middle')).toBe(true);
  });

  it('includes grandparent (2-level-up) attributes', async () => {
    const dataByName = await parseSingleNamespaceDataByName(THREE_LEVEL_FIXTURE);
    const child = dataByName.get('Child')!;
    const map = buildAttributeTypesMap(child);
    expect(map.has('unit')).toBe(true);
  });

  it('a child-declared attribute shadows a same-named ancestor attribute (nearest wins)', async () => {
    const source = `
namespace test.shadow
version "0.0.0"

type Base:
    value string (0..1)

type Derived extends Base:
    value number (0..1)
`;
    const dataByName = await parseSingleNamespaceDataByName(source);
    const derived = dataByName.get('Derived')!;
    const map = buildAttributeTypesMap(derived);
    // typeCall.type.$refText is the raw type reference text — 'number' from
    // Derived's own declaration, not 'string' from Base.
    expect(map.get('value')).toBe('number');
  });
});

/**
 * Data-extends-Choice — the real corpus case (BasketConstituent extends
 * Observable; observable-asset-type.rosetta:211/220): a Data whose supertype
 * is a `choice`, not a `Data`, inherits the Choice's option names as
 * pseudo-attributes (per the design spec's Semantics section) — a condition
 * on the child referencing an option name (`Basket is absent`) must resolve,
 * not report "unknown attribute".
 */
const CHOICE_SUPERTYPE_FIXTURE = `
namespace test.choiceExtends
version "0.0.0"

type Cash:
    amount number (0..1)

type Commodity:
    quantity number (0..1)

choice Asset:
    Cash
    Commodity

type BasketConstituent extends Asset:
    weight number (0..1)

    condition CashIsAbsent:
        Cash is absent
`;

async function parseSingleNamespaceDataAndChoiceByName(
  source: string
): Promise<{ dataByName: Map<string, Data>; choiceByName: Map<string, unknown> }> {
  const [result] = await parseWorkspace([{ uri: 'inmemory:///model.rosetta', content: source }]);
  expect(result!.hasErrors, 'expected fixture to parse without errors').toBe(false);
  const model = result!.value as unknown as { elements: unknown[] };
  const dataByName = new Map<string, Data>();
  const choiceByName = new Map<string, unknown>();
  for (const el of model.elements) {
    if (isData(el)) dataByName.set((el as Data).name, el as Data);
    else if ((el as { $type?: string }).$type === 'Choice') choiceByName.set((el as { name: string }).name, el);
  }
  return { dataByName, choiceByName };
}

describe('buildAttributeTypesMap — Data extends Choice', () => {
  it('includes own attributes declared on the child', async () => {
    const { dataByName } = await parseSingleNamespaceDataAndChoiceByName(CHOICE_SUPERTYPE_FIXTURE);
    const child = dataByName.get('BasketConstituent')!;
    const map = buildAttributeTypesMap(child);
    expect(map.has('weight')).toBe(true);
  });

  it("contributes the Choice supertype's option names as pseudo-attributes", async () => {
    const { dataByName } = await parseSingleNamespaceDataAndChoiceByName(CHOICE_SUPERTYPE_FIXTURE);
    const child = dataByName.get('BasketConstituent')!;
    const map = buildAttributeTypesMap(child);
    expect(map.has('Cash')).toBe(true);
    expect(map.has('Commodity')).toBe(true);
  });

  it('multi-level: Data extends Data extends Choice resolves the Choice ancestor option names', async () => {
    const source = `
namespace test.choiceExtendsMultiLevel
version "0.0.0"

type Cash:
    amount number (0..1)

type Commodity:
    quantity number (0..1)

choice Asset:
    Cash
    Commodity

type Intermediate extends Asset:
    note string (0..1)

type Leaf extends Intermediate:
    weight number (0..1)

    condition CashIsAbsent:
        Cash is absent
`;
    const { dataByName } = await parseSingleNamespaceDataAndChoiceByName(source);
    const leaf = dataByName.get('Leaf')!;
    const map = buildAttributeTypesMap(leaf);
    expect(map.has('weight')).toBe(true);
    expect(map.has('note')).toBe(true);
    expect(map.has('Cash')).toBe(true);
    expect(map.has('Commodity')).toBe(true);
  });

  it('a cyclic extends chain through a Choice does not loop forever (cycle guard)', async () => {
    // Pathological/malformed input — the cycle guard (visited-set) must still
    // terminate. A Choice cannot itself extend anything, so a true cycle
    // through a Choice supertype isn't constructible in valid Rune syntax;
    // this exercises the guard defensively for the Data-side chain instead:
    // the existing visited-set already covers this (no new risk introduced
    // by adding a Choice branch), but keep an explicit regression case.
    const source = `
namespace test.choiceExtendsGuard
version "0.0.0"

type Cash:
    amount number (0..1)

choice Asset:
    Cash

type Leaf extends Asset:
    weight number (0..1)
`;
    const { dataByName } = await parseSingleNamespaceDataAndChoiceByName(source);
    const leaf = dataByName.get('Leaf')!;
    expect(() => buildAttributeTypesMap(leaf)).not.toThrow();
  });
});

describe('decodeCardinality', () => {
  it('decodes a normal bounded cardinality', () => {
    const card = { inf: 0, sup: 1, unbounded: false } as RosettaCardinality;
    expect(decodeCardinality(card)).toEqual({ lower: 0, upper: 1 });
  });

  it('decodes an unbounded cardinality', () => {
    const card = { inf: 1, unbounded: true } as RosettaCardinality;
    expect(decodeCardinality(card)).toEqual({ lower: 1, upper: null });
  });

  // Regression: a deserialized curated document (hydrateModelDocument's JSON
  // round-trip) can carry an attribute whose cardinality didn't survive the
  // round-trip. Before this fix, `card.inf` on `undefined` crashed the ENTIRE
  // multi-namespace generation with an unhandled TypeError (2026-07
  // codegen-500 investigation) instead of degrading the one affected field.
  it('defaults to (0..*) instead of throwing when cardinality is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => decodeCardinality(undefined)).not.toThrow();
    expect(decodeCardinality(undefined)).toEqual({ lower: 0, upper: null });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

/**
 * BaseNamespaceEmitter.reportUnresolvedReference + diagnostics unification
 * (unified-type-reference-resolution Task 2). `reportUnresolvedReference`'s
 * message text must match verbatim what Tasks 3-7 (zod/ts/json-schema/xsd/sql
 * emitters' resolveTypeExpr-style methods) already emit today, so those tasks
 * can swap their inline `this.ctx.diagnostics.push({...})` calls for this
 * shared helper without changing observable output.
 */

class TestEmitter extends BaseNamespaceEmitter {
  finalize(): GeneratorOutput {
    return { relativePath: 'test.out', content: '', sourceMap: [], diagnostics: this.diagnostics, funcs: [] };
  }
  callReportUnresolved(attrName: string, refText: string | undefined, fallbackDescription: string): void {
    this.reportUnresolvedReference(attrName, refText, fallbackDescription);
  }
  exposeDiagnostics(): GeneratorDiagnostic[] {
    return this.diagnostics;
  }
}

function makeModel(): NamespaceWalkResult {
  return {
    namespace: 'test',
    dataByName: new Map(),
    enumByName: new Map(),
    choiceByName: new Map(),
    typeAliasByName: new Map(),
    libraryFuncsByName: new Map(),
    rulesByName: new Map(),
    reportsByName: new Map(),
    annotationsByName: new Map(),
    emitOrder: [],
    cyclicTypes: new Set(),
    docs: []
  } as unknown as NamespaceWalkResult;
}

describe('BaseNamespaceEmitter.reportUnresolvedReference', () => {
  it('pushes a warning diagnostic with the expected shape when refText is present', () => {
    const emitter = new TestEmitter(makeModel(), {}, { namespaces: new Map() } as NamespaceRegistry);
    emitter.callReportUnresolved('myAttr', 'MissingType', 'z.unknown()');
    expect(emitter.exposeDiagnostics()).toEqual([
      {
        severity: 'warning',
        code: 'unresolved-ref',
        message: "Attribute 'myAttr': type 'MissingType' is not resolved; emitting z.unknown()"
      }
    ]);
  });

  it('pushes a warning diagnostic with the expected shape when refText is undefined (anonymous unresolved ref)', () => {
    const emitter = new TestEmitter(makeModel(), {}, { namespaces: new Map() } as NamespaceRegistry);
    emitter.callReportUnresolved('myAttr', undefined, 'z.unknown()');
    expect(emitter.exposeDiagnostics()).toEqual([
      {
        severity: 'warning',
        code: 'unresolved-ref',
        message: "Attribute 'myAttr' has an unresolved type reference; emitting z.unknown()"
      }
    ]);
  });

  it('the fallbackDescription argument is interpolated verbatim (per-emitter fallback text varies)', () => {
    const emitter = new TestEmitter(makeModel(), {}, { namespaces: new Map() } as NamespaceRegistry);
    emitter.callReportUnresolved('field', 'Foo', 'xs:string');
    expect(emitter.exposeDiagnostics()[0]?.message).toBe(
      "Attribute 'field': type 'Foo' is not resolved; emitting xs:string"
    );
  });

  it('accumulates multiple diagnostics across calls (does not overwrite)', () => {
    const emitter = new TestEmitter(makeModel(), {}, { namespaces: new Map() } as NamespaceRegistry);
    emitter.callReportUnresolved('a', 'A', 'unknown');
    emitter.callReportUnresolved('b', undefined, '{}');
    expect(emitter.exposeDiagnostics()).toHaveLength(2);
  });
});

/**
 * Diagnostics-storage unification: `EmissionContext.diagnostics` (each of
 * the three EmissionContext-based emitters' internal `ctx`) must now be a
 * REFERENCE to the same array as `BaseNamespaceEmitter.diagnostics`, not a
 * separately-allocated `[]`. Proven here via reference identity (`toBe`),
 * not merely "both are non-empty" — two independently-allocated arrays
 * could both be non-empty and still be distinct objects, which would NOT
 * satisfy the requirement that pushing through one path is visible through
 * the other.
 */
describe('EmissionContext.diagnostics identity with BaseNamespaceEmitter.diagnostics', () => {
  function emptyWalkResult(): NamespaceWalkResult {
    return {
      docs: [],
      namespace: 'test.identity',
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

  const registry: NamespaceRegistry = { namespaces: new Map() };

  class ProbeZodEmitter extends ZodNamespaceEmitter {
    pushProbeDiagnostic(): void {
      this.diagnostics.push({ severity: 'warning', code: 'probe', message: 'probe' });
    }
    exposeDiagnostics(): GeneratorDiagnostic[] {
      return this.diagnostics;
    }
  }

  class ProbeTsEmitter extends TsNamespaceEmitter {
    pushProbeDiagnostic(): void {
      this.diagnostics.push({ severity: 'warning', code: 'probe', message: 'probe' });
    }
    exposeDiagnostics(): GeneratorDiagnostic[] {
      return this.diagnostics;
    }
  }

  class ProbeJsonSchemaEmitter extends JsonSchemaNamespaceEmitter {
    pushProbeDiagnostic(): void {
      this.diagnostics.push({ severity: 'warning', code: 'probe', message: 'probe' });
    }
    exposeDiagnostics(): GeneratorDiagnostic[] {
      return this.diagnostics;
    }
  }

  it('ZodNamespaceEmitter: this.diagnostics IS the array returned as finalize().diagnostics', () => {
    const emitter = new ProbeZodEmitter(emptyWalkResult(), {}, registry);
    emitter.pushProbeDiagnostic();
    const output = emitter.finalize();
    expect(output.diagnostics).toBe(emitter.exposeDiagnostics());
    expect(output.diagnostics).toContainEqual({ severity: 'warning', code: 'probe', message: 'probe' });
  });

  it('TsNamespaceEmitter: this.diagnostics IS the array returned as finalize().diagnostics', () => {
    const emitter = new ProbeTsEmitter(emptyWalkResult(), {}, registry);
    emitter.pushProbeDiagnostic();
    const output = emitter.finalize();
    expect(output.diagnostics).toBe(emitter.exposeDiagnostics());
    expect(output.diagnostics).toContainEqual({ severity: 'warning', code: 'probe', message: 'probe' });
  });

  it('JsonSchemaNamespaceEmitter: this.diagnostics IS the array returned as finalize().diagnostics', () => {
    const emitter = new ProbeJsonSchemaEmitter(emptyWalkResult(), {}, registry);
    emitter.pushProbeDiagnostic();
    const output = emitter.finalize();
    expect(output.diagnostics).toBe(emitter.exposeDiagnostics());
    expect(output.diagnostics).toContainEqual({ severity: 'warning', code: 'probe', message: 'probe' });
  });
});
