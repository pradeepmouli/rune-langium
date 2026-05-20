// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Shared runtime guards for studio Web Worker modules.
 *
 * Workers expose response-type guards and inbound-message types that the
 * main bundle imports for type-checking and structural validation. That
 * static import path also drags in any top-level side effects from the
 * worker module — most notably, the `self.addEventListener('message', ...)`
 * registration at the bottom of `parser-worker.ts` and `codegen-worker.ts`.
 *
 * To keep that registration scoped to actual Web Worker execution, every
 * worker module must gate its listener behind `isWorkerGlobalScope()`. The
 * earlier ad-hoc guard `typeof self !== 'undefined' && typeof self.postMessage
 * === 'function'` was true in browsers because `self === window` and
 * `window.postMessage` exists for cross-window messaging — so the main
 * bundle ended up registering a `message` listener on `window` and feeding
 * every arriving event (browser extensions, embed beacons, cross-origin
 * frames) into the worker's dispatcher. Those messages carry arbitrary
 * `event.data`, so `req.type` threw `TypeError: Cannot read properties of
 * undefined (reading 'type')` on every cold load in prod (surfaced by the
 * 2026-05-20 prod-smoke check; see PR #214).
 *
 * This guard checks `WorkerGlobalScope` (only defined inside a worker) and
 * falls back to `importScripts` (defined on DedicatedWorkerGlobalScope,
 * SharedWorkerGlobalScope, AND ServiceWorkerGlobalScope — i.e. every worker
 * variant — but never on `window`). Both checks stay safe in SSR / Node test
 * environments where `self` is undefined.
 */
export function isWorkerGlobalScope(): boolean {
  if (typeof self === 'undefined') return false;
  // `WorkerGlobalScope` only exists inside a worker; in the main thread it's
  // undefined even though `self` resolves to `window`.
  const WorkerGlobalScopeCtor = (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope;
  if (typeof WorkerGlobalScopeCtor === 'function' && self instanceof (WorkerGlobalScopeCtor as new () => unknown)) {
    return true;
  }
  // Fallback: `importScripts` is defined on every worker variant
  // (Dedicated, Shared, and Service worker global scopes) but never on
  // `window`, so it's a sound "is-this-a-worker" check.
  return typeof (self as { importScripts?: unknown }).importScripts === 'function';
}
