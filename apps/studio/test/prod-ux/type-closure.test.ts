// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for `resolveCandidateFqn`, the pure resolution-precedence
 * helper extracted from `walkTypeClosure` (apps/studio/test/prod-ux/
 * type-closure.ts). Covers the same-namespace-qualify-first fix for the
 * bug where two nodes in different namespaces referencing the same bare
 * type name (e.g. both `Foo`) either collided in a global dedupe Set or
 * resolved to the wrong namespace's type.
 */

import { describe, it, expect } from 'vitest';
import { resolveCandidateFqn } from './type-closure.js';

const PREFIX = 'ns-type-nav-';

describe('resolveCandidateFqn', () => {
  it('resolves the same bare name from two different source namespaces to two different FQNs', () => {
    const candidateTestIds = [`${PREFIX}ns1.Foo`, `${PREFIX}ns2.Foo`];

    const resolvedFromNs1 = resolveCandidateFqn(candidateTestIds, 'Foo', 'ns1', PREFIX);
    const resolvedFromNs2 = resolveCandidateFqn(candidateTestIds, 'Foo', 'ns2', PREFIX);

    expect(resolvedFromNs1).toBe('ns1.Foo');
    expect(resolvedFromNs2).toBe('ns2.Foo');
    expect(resolvedFromNs1).not.toBe(resolvedFromNs2);
  });

  it('resolves a ref with no source namespace via the exact-match branch (root case)', () => {
    const candidateTestIds = [`${PREFIX}scratch.j18.ScratchClosureRoot`, `${PREFIX}other.Unrelated`];

    const resolved = resolveCandidateFqn(candidateTestIds, 'scratch.j18.ScratchClosureRoot', undefined, PREFIX);

    expect(resolved).toBe('scratch.j18.ScratchClosureRoot');
  });

  it('falls through to the corpus-wide shortname fallback when no same-namespace candidate exists', () => {
    // sourceNamespace is 'ns1', but the only candidate for 'Bar' lives in 'ns2'
    // (a genuine cross-namespace import) — this is the pre-existing, accepted
    // ambiguity production itself does not fully resolve either.
    const candidateTestIds = [`${PREFIX}ns2.Bar`];

    const resolved = resolveCandidateFqn(candidateTestIds, 'Bar', 'ns1', PREFIX);

    expect(resolved).toBe('ns2.Bar');
  });

  it('returns undefined when the ref resolves in no branch', () => {
    const candidateTestIds = [`${PREFIX}ns1.Foo`];

    const resolved = resolveCandidateFqn(candidateTestIds, 'Nonexistent', 'ns2', PREFIX);

    expect(resolved).toBeUndefined();
  });

  it('prefers the exact raw-ref match over same-namespace-qualify when both could apply', () => {
    // ref is already a full FQN (e.g. the root case, or a ref that happens
    // to already carry a dot-qualified path) — exact match wins over
    // constructing `${sourceNamespace}.${ref}`.
    const candidateTestIds = [`${PREFIX}ns1.Already.Qualified`, `${PREFIX}ns1.ns1.Already.Qualified`];

    const resolved = resolveCandidateFqn(candidateTestIds, 'ns1.Already.Qualified', 'ns1', PREFIX);

    expect(resolved).toBe('ns1.Already.Qualified');
  });

  it('prefers same-namespace-qualify over the corpus-wide shortname fallback when both could match', () => {
    const candidateTestIds = [`${PREFIX}ns1.Foo`, `${PREFIX}ns2.Foo`];

    const resolved = resolveCandidateFqn(candidateTestIds, 'Foo', 'ns2', PREFIX);

    expect(resolved).toBe('ns2.Foo');
  });
});
