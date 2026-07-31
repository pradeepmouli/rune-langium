// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';

import { conditionsToDisplay } from '../../src/adapters/model-helpers.js';

describe('conditionsToDisplay', () => {
  it('does not leak a stale isPostCondition role across the shared WeakMap cache', () => {
    // Same raw reference looked up first as a regular condition, then later
    // (a separate call) as a post-condition — the per-reference cache must
    // not keep serving the FIRST role it ever saw for that object (Codex
    // review on PR #449).
    const condition = { name: 'c1', definition: 'must hold', expression: { $cstText: 'true' } };

    const asCondition = conditionsToDisplay([condition]);
    expect(asCondition[0]?.isPostCondition).toBe(false);

    const asPostCondition = conditionsToDisplay([], [condition]);
    expect(asPostCondition[0]?.isPostCondition).toBe(true);

    // Looking it up again as a regular condition must still report false —
    // the post-condition lookup above must not have clobbered this role.
    const asConditionAgain = conditionsToDisplay([condition]);
    expect(asConditionAgain[0]?.isPostCondition).toBe(false);
  });

  it('still caches per reference across repeated identical lookups', () => {
    const condition = { name: 'c1', definition: 'must hold', expression: { $cstText: 'true' } };
    const first = conditionsToDisplay([condition])[0];
    const second = conditionsToDisplay([condition])[0];
    expect(second).toBe(first);
  });
});
