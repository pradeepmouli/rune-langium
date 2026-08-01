// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

export const MAX_HYDRATION_RETRIES_PER_TARGET = 5;

export interface HydrationRetryTarget {
  /** Opaque id the caller uses to know which of its own retries this is (a preview targetId, etc). */
  targetId: string;
  /** Invoked once per retry attempt after the namespace(s) this target was waiting on have hydrated. */
  onRetry: () => void;
}

export interface RequestHydrationOptions {
  retryFor: HydrationRetryTarget;
}

export interface HydrationOrchestratorDeps {
  getHydratedNamespaces: () => string[];
  getPendingHydrationNamespaces: () => string[];
  requestNamespaceHydration: (ns: string) => void;
  subscribeToHydrationChange: (onChange: () => void) => () => void;
}

export class HydrationOrchestrator {
  private readonly waitingByNamespace = new Map<string, Map<string, HydrationRetryTarget>>();
  private readonly attemptsByTarget = new Map<string, number>();
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: HydrationOrchestratorDeps) {
    this.unsubscribe = deps.subscribeToHydrationChange(() => this.onHydrationChanged());
  }

  /**
   * Spends one retry-round attempt for `targetId`. Call this ONCE per
   * unresolved `preview:result` (not once per unresolved reference name) —
   * a target with several simultaneously-unresolved references shares one
   * budget for that round, not one budget per name. Returns false once the
   * cap (MAX_HYDRATION_RETRIES_PER_TARGET) is reached; the caller should
   * skip calling requestHydration for this round when it does.
   */
  beginRetryRound(targetId: string): boolean {
    const attempts = this.attemptsByTarget.get(targetId) ?? 0;
    if (attempts >= MAX_HYDRATION_RETRIES_PER_TARGET) return false;
    this.attemptsByTarget.set(targetId, attempts + 1);
    return true;
  }

  /**
   * Registers a namespace hydration wait for `retryFor.targetId`, requesting
   * the namespace be hydrated if it isn't already (or isn't already
   * pending). Does NOT itself spend a retry-attempt budget — callers that
   * want a bounded number of attempts must call `beginRetryRound(targetId)`
   * before their per-round `requestHydration` calls and skip them when it
   * returns false (see its doc comment). Callers whose retries are already
   * naturally bounded by something else (e.g. user-driven re-selection,
   * with no re-entrant retry loop) may skip `beginRetryRound` entirely and
   * stay uncapped — `apps/studio/src/shell/ExplorePerspective.tsx`'s three
   * call sites do this deliberately.
   */
  requestHydration(namespace: string, { retryFor }: RequestHydrationOptions): void {
    if (this.deps.getHydratedNamespaces().includes(namespace)) {
      // Already hydrated by someone else — retry on the next microtask so
      // callers never re-enter synchronously from inside requestHydration.
      queueMicrotask(() => retryFor.onRetry());
      return;
    }

    let waiters = this.waitingByNamespace.get(namespace);
    if (!waiters) {
      waiters = new Map();
      this.waitingByNamespace.set(namespace, waiters);
    }
    waiters.set(retryFor.targetId, retryFor);

    if (!this.deps.getPendingHydrationNamespaces().includes(namespace)) {
      this.deps.requestNamespaceHydration(namespace);
    }
  }

  markResolved(targetId: string): void {
    this.attemptsByTarget.delete(targetId);
  }

  getRemainingAttempts(targetId: string): number {
    return MAX_HYDRATION_RETRIES_PER_TARGET - (this.attemptsByTarget.get(targetId) ?? 0);
  }

  dispose(): void {
    this.unsubscribe();
    this.waitingByNamespace.clear();
    this.attemptsByTarget.clear();
  }

  private onHydrationChanged(): void {
    const hydrated = new Set(this.deps.getHydratedNamespaces());
    const firing = new Map<string, HydrationRetryTarget>();
    for (const [namespace, waiters] of [...this.waitingByNamespace.entries()]) {
      if (!hydrated.has(namespace)) continue;
      this.waitingByNamespace.delete(namespace);
      for (const [targetId, target] of waiters) {
        firing.set(targetId, target);
      }
    }
    for (const target of firing.values()) {
      target.onRetry();
    }
  }
}
