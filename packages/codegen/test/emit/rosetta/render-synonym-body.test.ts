// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect } from 'vitest';
import { renderSynonymBody, UnsupportedSynonymBodyError } from '../../../src/emit/rosetta/render-synonym-body.js';
import { renderNode, type RenderChild } from '../../../src/emit/rosetta/rosetta-render-core.js';

const regen: RenderChild = (c) => renderNode(c, regen) ?? '';

// --- value-surface fields (RosettaSynonymValueBase) ------------------------

describe('renderSynonymBody — value form', () => {
  it('renders a plain single value', () => {
    const body = { $type: 'RosettaSynonymBody', values: [{ name: 'tradeDate' }], hints: [], metaValues: [], removeHtml: false };
    expect(renderSynonymBody(body)).toBe('value "tradeDate"');
  });

  it('renders multiple values comma-joined', () => {
    const body = { $type: 'RosettaSynonymBody', values: [{ name: 'a' }, { name: 'b' }], hints: [], metaValues: [], removeHtml: false };
    expect(renderSynonymBody(body)).toBe('value "a", "b"');
  });

  it('renders the rich value surface: tag INT, path, maps', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      values: [{ name: 'n', refType: 'tag', value: 2, path: 'p', maps: 3 }],
      hints: [], metaValues: [], removeHtml: false
    };
    expect(renderSynonymBody(body)).toBe('value "n" tag 2 path "p" maps 3');
  });

  it('renders componentID as refType', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      values: [{ name: 'n', refType: 'componentID', value: 4 }],
      hints: [], metaValues: [], removeHtml: false
    };
    expect(renderSynonymBody(body)).toBe('value "n" componentID 4');
  });

  it('escapes quotes/backslashes in the value name', () => {
    const body = { $type: 'RosettaSynonymBody', values: [{ name: 'a "q" b\\c' }], hints: [], metaValues: [], removeHtml: false };
    expect(renderSynonymBody(body)).toBe('value "a \\"q\\" b\\\\c"');
  });

  it('renders value + trailing meta list', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      values: [{ name: 'tradeDate' }],
      metaValues: ['id1', 'id2'], hints: [], removeHtml: false
    };
    expect(renderSynonymBody(body)).toBe('value "tradeDate" meta "id1", "id2"');
  });
});

// --- non-value body alternatives --------------------------------------------

describe('renderSynonymBody — body alternatives', () => {
  it('renders a hint list', () => {
    const body = { $type: 'RosettaSynonymBody', hints: ['h1', 'h2'], values: [], metaValues: [], removeHtml: false };
    expect(renderSynonymBody(body)).toBe('hint "h1", "h2"');
  });

  it('renders a bare merge', () => {
    const body = { $type: 'RosettaSynonymBody', merge: { name: 'm' }, values: [], hints: [], metaValues: [], removeHtml: false };
    expect(renderSynonymBody(body)).toBe('merge "m"');
  });

  it('renders a merge with an exclude path', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      merge: { name: 'm', excludePath: 'x' },
      values: [], hints: [], metaValues: [], removeHtml: false
    };
    expect(renderSynonymBody(body)).toBe('merge "m" when path <> "x"');
  });

  it('renders a bare meta list', () => {
    const body = { $type: 'RosettaSynonymBody', metaValues: ['id1', 'id2'], values: [], hints: [], removeHtml: false };
    expect(renderSynonymBody(body)).toBe('meta "id1", "id2"');
  });

  it('renders a bare set-to mapping (single instance, literal)', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      mappingLogic: {
        $type: 'RosettaMapping',
        instances: [{ $type: 'RosettaMappingInstance', default: false, set: { $type: 'RosettaEnumValueReference', enumeration: { $refText: 'Foo.Bar' }, value: { $refText: 'V' } } }]
      },
      values: [], hints: [], metaValues: [], removeHtml: false
    };
    expect(renderSynonymBody(body)).toBe('set to Foo.Bar -> V');
  });
});

// --- mapping family ----------------------------------------------------------

describe('renderSynonymBody — mapping (value-form mappingLogic)', () => {
  it('renders default-to instance', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      values: [{ name: 't' }],
      mappingLogic: {
        $type: 'RosettaMapping',
        instances: [{ $type: 'RosettaMappingInstance', default: true, set: { $type: 'RosettaStringLiteral', value: 'X' } }]
      },
      hints: [], metaValues: [], removeHtml: false
    };
    expect(renderSynonymBody(body)).toBe('value "t" default to "X"');
  });

  it('renders set-when instance (single test)', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      values: [{ name: 't' }],
      mappingLogic: {
        $type: 'RosettaMapping',
        instances: [{
          $type: 'RosettaMappingInstance', default: false,
          when: { $type: 'RosettaMappingPathTests', tests: [{ $type: 'RosettaMapPath', path: { $type: 'RosettaMapPathValue', path: 'a.b' } }] }
        }]
      },
      hints: [], metaValues: [], removeHtml: false
    };
    expect(renderSynonymBody(body)).toBe('value "t" set when path = "a.b"');
  });

  it('renders a 2-instance mapping with and-chained tests', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      values: [{ name: 't' }],
      mappingLogic: {
        $type: 'RosettaMapping',
        instances: [
          {
            $type: 'RosettaMappingInstance', default: false,
            when: {
              $type: 'RosettaMappingPathTests',
              tests: [
                { $type: 'RosettaMapPath', path: { $type: 'RosettaMapPathValue', path: 'a.b' } },
                { $type: 'RosettaMapTestExistsExpression', argument: { $type: 'RosettaMapPathValue', path: 'c' } }
              ]
            }
          },
          { $type: 'RosettaMappingInstance', default: true, set: { $type: 'RosettaStringLiteral', value: 'Y' } }
        ]
      },
      hints: [], metaValues: [], removeHtml: false
    };
    expect(renderSynonymBody(body)).toBe('value "t" set when path = "a.b" and "c" exists, default to "Y"');
  });

  it('renders a bare set-to mapping with multiple instances comma-joined', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      mappingLogic: {
        $type: 'RosettaMapping',
        instances: [
          {
            $type: 'RosettaMappingInstance', default: false,
            set: { $type: 'RosettaStringLiteral', value: 'X' },
            when: { $type: 'RosettaMappingPathTests', tests: [{ $type: 'RosettaMapPath', path: { $type: 'RosettaMapPathValue', path: 'a' } }] }
          },
          {
            $type: 'RosettaMappingInstance', default: false,
            set: { $type: 'RosettaStringLiteral', value: 'Y' },
            when: { $type: 'RosettaMappingPathTests', tests: [{ $type: 'RosettaMapPath', path: { $type: 'RosettaMapPathValue', path: 'b' } }] }
          }
        ]
      },
      values: [], hints: [], metaValues: [], removeHtml: false
    };
    expect(renderSynonymBody(body)).toBe('set to "X" when path = "a", set to "Y" when path = "b"');
  });
});

// --- each mapping-test form -------------------------------------------------

describe('renderSynonymBody — mapping-test forms', () => {
  function withTest(test: unknown): string {
    const body = {
      $type: 'RosettaSynonymBody',
      values: [{ name: 't' }],
      mappingLogic: {
        $type: 'RosettaMapping',
        instances: [{ $type: 'RosettaMappingInstance', default: false, when: { $type: 'RosettaMappingPathTests', tests: [test] } }]
      },
      hints: [], metaValues: [], removeHtml: false
    };
    return renderSynonymBody(body);
  }

  it('path = "s" (RosettaMapPath)', () => {
    expect(withTest({ $type: 'RosettaMapPath', path: { $type: 'RosettaMapPathValue', path: 'a.b' } }))
      .toBe('value "t" set when path = "a.b"');
  });

  it('rosettaPath = <attrRef> (RosettaMapRosettaPath, single hop)', () => {
    const attrRef = {
      $type: 'RosettaAttributeReference',
      receiver: { $type: 'RosettaDataReference', data: { $refText: 'Data.Type' } },
      attribute: { $refText: 'attr' }
    };
    expect(withTest({ $type: 'RosettaMapRosettaPath', path: attrRef }))
      .toBe('value "t" set when rosettaPath = Data.Type -> attr');
  });

  it('rosettaPath = <attrRef> (recursive, 2 hops)', () => {
    const attrRef = {
      $type: 'RosettaAttributeReference',
      receiver: {
        $type: 'RosettaAttributeReference',
        receiver: { $type: 'RosettaDataReference', data: { $refText: 'Data.Type' } },
        attribute: { $refText: 'attr' }
      },
      attribute: { $refText: 'nested' }
    };
    expect(withTest({ $type: 'RosettaMapRosettaPath', path: attrRef }))
      .toBe('value "t" set when rosettaPath = Data.Type -> attr -> nested');
  });

  it('"s" exists (RosettaMapTestExistsExpression)', () => {
    expect(withTest({ $type: 'RosettaMapTestExistsExpression', argument: { $type: 'RosettaMapPathValue', path: 'c' } }))
      .toBe('value "t" set when "c" exists');
  });

  it('"s" is absent (RosettaMapTestAbsentExpression)', () => {
    expect(withTest({ $type: 'RosettaMapTestAbsentExpression', argument: { $type: 'RosettaMapPathValue', path: 'c' } }))
      .toBe('value "t" set when "c" is absent');
  });

  it('"s" = <primary> (RosettaMapTestEqualityOperation, literal)', () => {
    expect(withTest({
      $type: 'RosettaMapTestEqualityOperation',
      left: { $type: 'RosettaMapPathValue', path: 'c' }, operator: '=',
      right: { $type: 'RosettaStringLiteral', value: 'd' }
    })).toBe('value "t" set when "c" = "d"');
  });

  it('"s" <> <primary> (RosettaMapTestEqualityOperation, enum-value-ref)', () => {
    expect(withTest({
      $type: 'RosettaMapTestEqualityOperation',
      left: { $type: 'RosettaMapPathValue', path: 'c' }, operator: '<>',
      right: { $type: 'RosettaEnumValueReference', enumeration: { $refText: 'Foo.Bar' }, value: { $refText: 'V' } }
    })).toBe('value "t" set when "c" <> Foo.Bar -> V');
  });

  it('condition-func <Ref> (RosettaMapTestFunc, no predicate path)', () => {
    expect(withTest({ $type: 'RosettaMapTestFunc', func: { $refText: 'SomeFunc' } }))
      .toBe('value "t" set when condition-func SomeFunc');
  });

  it('condition-func <Ref> condition-path "s" (RosettaMapTestFunc, with predicate path)', () => {
    expect(withTest({
      $type: 'RosettaMapTestFunc', func: { $refText: 'SomeFunc' },
      predicatePath: { $type: 'RosettaMapPathValue', path: 'p' }
    })).toBe('value "t" set when condition-func SomeFunc condition-path "p"');
  });
});

// --- suffixes + suffix ordering ---------------------------------------------

describe('renderSynonymBody — suffixes', () => {
  it('dateFormat', () => {
    const body = { $type: 'RosettaSynonymBody', values: [{ name: 'n' }], format: 'yyyy-MM-dd', hints: [], metaValues: [], removeHtml: false };
    expect(renderSynonymBody(body)).toBe('value "n" dateFormat "yyyy-MM-dd"');
  });

  it('pattern (match + replace)', () => {
    const body = { $type: 'RosettaSynonymBody', values: [{ name: 'n' }], patternMatch: 'a', patternReplace: 'b', hints: [], metaValues: [], removeHtml: false };
    expect(renderSynonymBody(body)).toBe('value "n" pattern "a" "b"');
  });

  it('removeHtml', () => {
    const body = { $type: 'RosettaSynonymBody', values: [{ name: 'n' }], removeHtml: true, hints: [], metaValues: [] };
    expect(renderSynonymBody(body)).toBe('value "n" removeHtml');
  });

  it('mapper', () => {
    const body = { $type: 'RosettaSynonymBody', values: [{ name: 'n' }], mapper: 'someMapper', hints: [], metaValues: [], removeHtml: false };
    expect(renderSynonymBody(body)).toBe('value "n" mapper "someMapper"');
  });

  it('all four suffixes in grammar order regardless of object key order', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      mapper: 'm', removeHtml: true, patternReplace: 'b', patternMatch: 'a', format: 'yyyy',
      values: [{ name: 'n' }], hints: [], metaValues: []
    };
    expect(renderSynonymBody(body)).toBe('value "n" dateFormat "yyyy" pattern "a" "b" removeHtml mapper "m"');
  });

  it('suffixes apply to non-value alternatives too (hint + dateFormat)', () => {
    const body = { $type: 'RosettaSynonymBody', hints: ['h'], format: 'yyyy', values: [], metaValues: [], removeHtml: false };
    expect(renderSynonymBody(body)).toBe('hint "h" dateFormat "yyyy"');
  });
});

// --- unknown / undiscriminable → throw -------------------------------------

describe('class synonym metaValue full surface', () => {
  // RosettaMetaSynonymValue allows `maps` (grammar L617-619) — unlike
  // RosettaClassSynonymValue. metaValue must NOT lose it (PR #363 Copilot finding).
  it('renders metaValue maps (and drops maps only on the value form)', () => {
    const s = {
      $type: 'RosettaClassSynonym',
      sources: [{ $refText: 'FpML' }],
      value: { name: 'v', maps: 9 },
      metaValue: { name: 'm', path: 'p', maps: 2 }
    };
    expect(renderNode(s as never, regen)).toBe('[synonym FpML value "v" meta "m" path "p" maps 2]');
  });
});

describe('renderSynonymBody — fallback', () => {
  it('throws UnsupportedSynonymBodyError on an undiscriminable body', () => {
    const body = { $type: 'RosettaSynonymBody', values: [], hints: [], metaValues: [], removeHtml: false };
    expect(() => renderSynonymBody(body)).toThrow(UnsupportedSynonymBodyError);
  });

  it('throws UnsupportedSynonymBodyError on an unknown mapping-test $type', () => {
    const body = {
      $type: 'RosettaSynonymBody',
      values: [{ name: 't' }],
      mappingLogic: {
        $type: 'RosettaMapping',
        instances: [{ $type: 'RosettaMappingInstance', default: false, when: { $type: 'RosettaMappingPathTests', tests: [{ $type: 'SomeFutureTestType' }] } }]
      },
      hints: [], metaValues: [], removeHtml: false
    };
    expect(() => renderSynonymBody(body)).toThrow(UnsupportedSynonymBodyError);
  });

  it('propagates a genuine renderExpression bug from a mapping primary UNwrapped (P3 warn path)', () => {
    // A malformed conditional makes renderExpression throw a TypeError — this
    // must NOT be reclassified as the designed UnsupportedSynonymBodyError,
    // or render-core's warn path never sees real bugs crossing this boundary.
    const body = {
      $type: 'RosettaSynonymBody',
      values: [{ name: 't' }],
      mappingLogic: {
        $type: 'RosettaMapping',
        instances: [{
          $type: 'RosettaMappingInstance', default: true,
          set: { $type: 'RosettaConditionalExpression', if: null, ifthen: null, full: false }
        }]
      },
      hints: [], metaValues: [], removeHtml: false
    };
    let thrown: unknown;
    try { renderSynonymBody(body); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(TypeError);
    expect(thrown).not.toBeInstanceOf(UnsupportedSynonymBodyError);
  });
});

// --- render-core delegation (full surfaces) ---------------------------------

describe('renderNode — RosettaSynonym full body surface (delegates to renderSynonymBody)', () => {
  it('renders the rich value form via render-core', () => {
    const s = {
      $type: 'RosettaSynonym', sources: [{ $refText: 'FpML' }],
      body: { $type: 'RosettaSynonymBody', values: [{ name: 'n', refType: 'tag', value: 2, path: 'p', maps: 3 }], hints: [], metaValues: [], removeHtml: false }
    };
    expect(renderNode(s as never, regen)).toBe('[synonym FpML value "n" tag 2 path "p" maps 3]');
  });

  it('renders a hint body via render-core (previously CST-fallback null)', () => {
    const s = {
      $type: 'RosettaSynonym', sources: [{ $refText: 'FpML' }],
      body: { $type: 'RosettaSynonymBody', hints: ['h1', 'h2'], values: [], metaValues: [], removeHtml: false }
    };
    expect(renderNode(s as never, regen)).toBe('[synonym FpML hint "h1", "h2"]');
  });

  it('falls back to null (CST) when the body render throws (unknown $type)', () => {
    const s = {
      $type: 'RosettaSynonym', sources: [{ $refText: 'FpML' }],
      body: { $type: 'RosettaSynonymBody', values: [], hints: [], metaValues: [], removeHtml: false },
      $cstText: '[synonym FpML /* something unrenderable */]'
    };
    expect(renderNode(s as never, regen)).toBeNull();
  });
});

describe('renderNode — RosettaClassSynonym full surface (value + metaValue)', () => {
  it('renders value with tag/path and a metaValue', () => {
    const s = {
      $type: 'RosettaClassSynonym', sources: [{ $refText: 'FpML' }],
      value: { name: 'n', refType: 'tag', value: 2, path: 'p' },
      metaValue: { name: 'm' }
    };
    expect(renderNode(s as never, regen)).toBe('[synonym FpML value "n" tag 2 path "p" meta "m"]');
  });

  it('renders metaValue only (no value)', () => {
    const s = {
      $type: 'RosettaClassSynonym', sources: [{ $refText: 'FpML' }],
      value: undefined, metaValue: { name: 'm' }
    };
    expect(renderNode(s as never, regen)).toBe('[synonym FpML meta "m"]');
  });

  it('class synonym value surface has no maps field even if present (grammar: RosettaClassSynonymValue excludes maps)', () => {
    const s = {
      $type: 'RosettaClassSynonym', sources: [{ $refText: 'FpML' }],
      // maps should never appear on RosettaClassSynonymValue per grammar; guard against accidental leakage.
      value: { name: 'n', maps: 99 }
    };
    expect(renderNode(s as never, regen)).toBe('[synonym FpML value "n"]');
  });
});

describe('renderNode — RosettaEnumSynonym full surface', () => {
  it('renders definition + pattern + removeHtml', () => {
    const s = {
      $type: 'RosettaEnumSynonym', sources: [{ $refText: 'FIX' }],
      synonymValue: 's', definition: 'd', patternMatch: 'a', patternReplace: 'b', removeHtml: true
    };
    expect(renderNode(s as never, regen)).toBe('[synonym FIX value "s" definition "d" pattern "a" "b" removeHtml]');
  });

  it('renders value only (no optional suffixes)', () => {
    const s = { $type: 'RosettaEnumSynonym', sources: [{ $refText: 'FIX' }], synonymValue: 's', removeHtml: false };
    expect(renderNode(s as never, regen)).toBe('[synonym FIX value "s"]');
  });

  // P5 corpus-sweep finding: `RosettaExternalEnumSynonym` (grammar: `'[' 'value'
  // synonymValue=STRING ('definition' ...)? ('pattern' ...)? ']'`, no `synonym`
  // keyword, no sources, no removeHtml production) `infers RosettaEnumSynonym`
  // — the SAME $type as the normal `[synonym src value "s"]` form. It is
  // structurally distinguished only by an empty `sources` array. Rendering it
  // through the internal-form branch produces `[synonym  value "s"]` (blank
  // source, invalid Rune DSL) — a real corpus-sweep bug (354/532 unique
  // RosettaEnumSynonym-typed corpus nodes are this external shape).
  it('renders the external-synonym form (empty sources) without a synonym keyword', () => {
    const s = { $type: 'RosettaEnumSynonym', sources: [], synonymValue: 'partyA', removeHtml: false };
    expect(renderNode(s as never, regen)).toBe('[value "partyA"]');
  });

  it('renders the external-synonym form with definition + pattern suffixes', () => {
    const s = {
      $type: 'RosettaEnumSynonym', sources: [],
      synonymValue: 'United Arab Emirates Dirham', definition: 'd', patternMatch: 'a', patternReplace: 'b', removeHtml: false
    };
    expect(renderNode(s as never, regen)).toBe('[value "United Arab Emirates Dirham" definition "d" pattern "a" "b"]');
  });
});
