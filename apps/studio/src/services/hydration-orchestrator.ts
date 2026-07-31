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
    for (const [namespace, waiters] of [...this.waitingByNamespace.entries()]) {
      if (!hydrated.has(namespace)) continue;
      this.waitingByNamespace.delete(namespace);
      for (const target of waiters.values()) target.onRetry();
    }
  }
}
