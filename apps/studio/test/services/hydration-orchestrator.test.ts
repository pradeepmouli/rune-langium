// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it, vi } from 'vitest';
import {
  HydrationOrchestrator,
  MAX_HYDRATION_RETRIES_PER_TARGET,
  type HydrationOrchestratorDeps
} from '../../src/services/hydration-orchestrator';

function makeDeps(overrides: Partial<HydrationOrchestratorDeps> = {}) {
  const hydrated = new Set<string>();
  const pending = new Set<string>();
  let changeListener: (() => void) | undefined;
  const requestNamespaceHydration = vi.fn((ns: string) => pending.add(ns));
  return {
    hydrated,
    pending,
    requestNamespaceHydration,
    fireChange: () => changeListener?.(),
    deps: {
      getHydratedNamespaces: () => [...hydrated],
      getPendingHydrationNamespaces: () => [...pending],
      requestNamespaceHydration,
      subscribeToHydrationChange: (cb: () => void) => {
        changeListener = cb;
        return () => {
          changeListener = undefined;
        };
      },
      ...overrides
    }
  };
}

describe('HydrationOrchestrator', () => {
  it('does not request hydration for a namespace that is already hydrated', async () => {
    const { hydrated, deps, requestNamespaceHydration } = makeDeps();
    hydrated.add('fpml.consolidated.shared.scheme');
    const orchestrator = new HydrationOrchestrator(deps);
    const onRetry = vi.fn();
    orchestrator.requestHydration('fpml.consolidated.shared.scheme', {
      retryFor: { targetId: 'Scheme', onRetry }
    });
    expect(requestNamespaceHydration).not.toHaveBeenCalled();
    // Verify onRetry is still called via queueMicrotask even though no hydration was requested
    await Promise.resolve();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('requests hydration once, then retries every waiting target when the namespace hydrates', () => {
    const { deps, hydrated, requestNamespaceHydration, fireChange } = makeDeps();
    const orchestrator = new HydrationOrchestrator(deps);
    const onRetryA = vi.fn();
    const onRetryB = vi.fn();
    orchestrator.requestHydration('cdm.base.staticdata.party.Scheme', {
      retryFor: { targetId: 'Scheme', onRetry: onRetryA }
    });
    orchestrator.requestHydration('cdm.base.staticdata.party.Scheme', {
      retryFor: { targetId: 'NonEmptyScheme', onRetry: onRetryB }
    });
    expect(requestNamespaceHydration).toHaveBeenCalledTimes(1);
    expect(requestNamespaceHydration).toHaveBeenCalledWith('cdm.base.staticdata.party.Scheme');

    hydrated.add('cdm.base.staticdata.party.Scheme');
    fireChange();
    expect(onRetryA).toHaveBeenCalledTimes(1);
    expect(onRetryB).toHaveBeenCalledTimes(1);
  });

  it('stops beginning new retry rounds once a target hits the retry cap', () => {
    const { deps } = makeDeps();
    const orchestrator = new HydrationOrchestrator(deps);
    for (let i = 0; i < MAX_HYDRATION_RETRIES_PER_TARGET; i++) {
      expect(orchestrator.beginRetryRound('Scheme')).toBe(true);
    }
    expect(orchestrator.beginRetryRound('Scheme')).toBe(false);
  });

  it('resets a target attempt counter on markResolved, giving it a fresh budget later', () => {
    const { deps } = makeDeps();
    const orchestrator = new HydrationOrchestrator(deps);
    for (let i = 0; i < MAX_HYDRATION_RETRIES_PER_TARGET; i++) {
      orchestrator.beginRetryRound('Scheme');
    }
    expect(orchestrator.getRemainingAttempts('Scheme')).toBe(0);
    orchestrator.markResolved('Scheme');
    expect(orchestrator.getRemainingAttempts('Scheme')).toBe(MAX_HYDRATION_RETRIES_PER_TARGET);
    expect(orchestrator.beginRetryRound('Scheme')).toBe(true);
  });

  it('does not exhaust the attempt budget when a single round calls requestHydration for many namespaces', () => {
    const { deps, requestNamespaceHydration } = makeDeps();
    const orchestrator = new HydrationOrchestrator(deps);

    expect(orchestrator.beginRetryRound('Scheme')).toBe(true);
    for (let i = 0; i < 6; i++) {
      orchestrator.requestHydration(`ns-${i}`, { retryFor: { targetId: 'Scheme', onRetry: vi.fn() } });
    }
    expect(requestNamespaceHydration).toHaveBeenCalledTimes(6);
    // Only ONE attempt was spent for this round, despite 6 requestHydration calls.
    expect(orchestrator.getRemainingAttempts('Scheme')).toBe(MAX_HYDRATION_RETRIES_PER_TARGET - 1);

    // beginRetryRound still succeeds for rounds 2-5, then fails on round 6.
    for (let round = 2; round <= MAX_HYDRATION_RETRIES_PER_TARGET; round++) {
      expect(orchestrator.beginRetryRound('Scheme')).toBe(true);
    }
    expect(orchestrator.beginRetryRound('Scheme')).toBe(false);
  });
});
