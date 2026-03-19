/**
 * Unit tests for buildMergedAttributeList and buildMergedEnumValueList helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  buildMergedAttributeList,
  buildMergedEnumValueList
} from '../../src/hooks/useInheritedMembers.js';
import type { InheritedGroup } from '../../src/hooks/useInheritedMembers.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAttrMember(name: string, type = 'string', card = '(1..1)'): Record<string, unknown> {
  return {
    $type: 'Attribute',
    name,
    typeCall: { $type: 'TypeCall', type: { $refText: type } },
    card: { inf: 1, sup: 1, unbounded: false },
    override: false
  };
}

function makeEnumMember(name: string, display = ''): Record<string, unknown> {
  return { $type: 'RosettaEnumValue', name, display };
}

function makeGroup(ancestorName: string, members: unknown[]): InheritedGroup {
  return { ancestorName, namespace: 'test', kind: 'data', members };
}

// ---------------------------------------------------------------------------
// buildMergedAttributeList
// ---------------------------------------------------------------------------

describe('buildMergedAttributeList', () => {
  it('returns only local entries when no inherited groups', () => {
    const local = [
      { id: 'f1', name: 'amount' },
      { id: 'f2', name: 'currency' }
    ];
    const result = buildMergedAttributeList(local, []);
    expect(result).toHaveLength(2);
    expect(result.every((e) => e.isLocal)).toBe(true);
  });

  it('appends inherited entries after local entries', () => {
    const local = [{ id: 'f1', name: 'amount' }];
    const groups = [makeGroup('Parent', [makeAttrMember('tradeDate')])];
    const result = buildMergedAttributeList(local, groups);
    expect(result).toHaveLength(2);
    expect(result[0]?.isLocal).toBe(true);
    expect(result[1]?.isLocal).toBe(false);
    if (!result[1]?.isLocal) {
      expect(result[1]?.name).toBe('tradeDate');
      expect(result[1]?.inheritedFrom.ancestorName).toBe('Parent');
      expect(result[1]?.inheritedFrom.inheritanceDepth).toBe(1);
    }
  });

  it('shadows inherited member when local has same name', () => {
    const local = [{ id: 'f1', name: 'tradeDate' }];
    const groups = [makeGroup('Parent', [makeAttrMember('tradeDate')])];
    const result = buildMergedAttributeList(local, groups);
    expect(result).toHaveLength(1);
    expect(result[0]?.isLocal).toBe(true);
  });

  it('assigns incrementing inheritanceDepth across ancestors', () => {
    const local: { id: string; name: string }[] = [];
    const groups = [
      makeGroup('Parent', [makeAttrMember('a')]),
      makeGroup('Grandparent', [makeAttrMember('b')])
    ];
    const result = buildMergedAttributeList(local, groups);
    const depths = result
      .filter((e) => !e.isLocal)
      .map((e) => (!e.isLocal ? e.inheritedFrom.inheritanceDepth : -1));
    expect(depths).toEqual([1, 2]);
  });

  it('deeper ancestor does not re-introduce name already shadowed by nearer ancestor', () => {
    const local: { id: string; name: string }[] = [];
    const groups = [
      makeGroup('Parent', [makeAttrMember('shared')]),
      makeGroup('Grandparent', [makeAttrMember('shared')])
    ];
    const result = buildMergedAttributeList(local, groups);
    const sharedRows = result.filter((e) => !e.isLocal && e.name === 'shared');
    expect(sharedRows).toHaveLength(1);
  });

  it('preserves fieldIndex correctly for local entries', () => {
    const local = [
      { id: 'f0', name: 'a' },
      { id: 'f1', name: 'b' },
      { id: 'f2', name: 'c' }
    ];
    const result = buildMergedAttributeList(local, []);
    result.forEach((e, i) => {
      if (e.isLocal) {
        expect(e.fieldIndex).toBe(i);
      }
    });
  });

  it('empty local and empty groups returns empty array', () => {
    expect(buildMergedAttributeList([], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildMergedEnumValueList
// ---------------------------------------------------------------------------

describe('buildMergedEnumValueList', () => {
  it('returns only local entries when no inherited groups', () => {
    const local = [{ id: 'v1', name: 'USD' }];
    const result = buildMergedEnumValueList(local, []);
    expect(result).toHaveLength(1);
    expect(result[0]?.isLocal).toBe(true);
  });

  it('appends inherited values after local values', () => {
    const local = [{ id: 'v1', name: 'USD' }];
    const groups = [makeGroup('ParentEnum', [makeEnumMember('EUR', 'Euro')])];
    const result = buildMergedEnumValueList(local, groups);
    expect(result).toHaveLength(2);
    expect(result[1]?.isLocal).toBe(false);
    if (!result[1]?.isLocal) {
      expect(result[1]?.name).toBe('EUR');
      expect(result[1]?.displayName).toBe('Euro');
      expect(result[1]?.inheritedFrom.ancestorName).toBe('ParentEnum');
    }
  });

  it('local value shadows inherited value with same name', () => {
    const local = [{ id: 'v1', name: 'EUR' }];
    const groups = [makeGroup('ParentEnum', [makeEnumMember('EUR', 'Euro')])];
    const result = buildMergedEnumValueList(local, groups);
    expect(result).toHaveLength(1);
    expect(result[0]?.isLocal).toBe(true);
  });

  it('generates stable ids for inherited entries', () => {
    const local: { id: string; name: string }[] = [];
    const groups = [makeGroup('ParentEnum', [makeEnumMember('EUR')])];
    const result = buildMergedEnumValueList(local, groups);
    expect(result[0]?.id).toBe('inherited:ParentEnum:EUR');
  });
});
