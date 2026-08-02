// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Thrown by a retry-cap-exhausted / give-up branch instead of quietly
 * transitioning state. Flows through the exact same withInstrumentation
 * capture-and-rethrow path as any other exception — there is no separate
 * reportExhaustion() API (see the design doc's "Exhaustion is not a
 * separate API" section). Named so sanitizers/dashboards can categorize
 * "gave up after N attempts" apart from a genuine bug.
 */
export class RetryExhaustedError extends Error {
  constructor(
    public readonly targetId: string,
    public readonly attempts: number
  ) {
    super(`Retry budget exhausted for "${targetId}" after ${attempts} attempt(s)`);
    this.name = 'RetryExhaustedError';
  }
}
