// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { RetryExhaustedError } from '../../../src/services/instrumentation/errors.js';

describe('RetryExhaustedError', () => {
  it('carries targetId and attempts, and is a real Error', () => {
    const err = new RetryExhaustedError('cdm.base.staticdata.party.Party', 5);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('RetryExhaustedError');
    expect(err.targetId).toBe('cdm.base.staticdata.party.Party');
    expect(err.attempts).toBe(5);
  });
});
