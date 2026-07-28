// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, fmtLine } from '../store/output-store.js';

/**
 * Installs window.onerror / unhandledrejection / long-task capture, publishing
 * through the SAME addLine publish point op-log.ts already reads — this is
 * not a new logging channel, it's a producer into the existing one. Task 3's
 * shipper (subscribing to useOutputStore) picks these up automatically.
 *
 * Grouping "signature" (top stack frame + op context) lets the Worker-side
 * aggregation (Task 4) count distinct error shapes rather than raw messages,
 * which can carry high-cardinality noise (line numbers, dynamic ids).
 */
export function installTelemetryCapture(): () => void {
  const addLine = useOutputStore.getState().addLine;

  const onError = (event: ErrorEvent): void => {
    const signature = signatureFor(event.error);
    addLine(fmtLine('clientError', event.message || 'window error'), 'error', {
      op: 'clientError',
      signature
    });
  };

  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const signature = signatureFor(reason instanceof Error ? reason : undefined);
    addLine(fmtLine('clientUnhandledRejection', message), 'error', {
      op: 'clientUnhandledRejection',
      signature
    });
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  let observer: PerformanceObserver | undefined;
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        addLine(fmtLine('longTask', `${Math.round(entry.duration)}ms`), 'warn', {
          op: 'longTask',
          durationMs: Math.round(entry.duration)
        });
      }
    });
    observer.observe({ type: 'longtask', buffered: false });
  } catch {
    // longtask entry type unsupported in this browser — capture degrades
    // gracefully to error/rejection-only, matching telemetry's "never
    // block the user" invariant.
  }

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    observer?.disconnect();
  };
}

// Fixed vocabulary of built-in Error subclass names — safe to transmit
// verbatim (never user/model content). Anything else collapses to 'Error'.
const KNOWN_ERROR_NAMES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError'
]);

/**
 * A single FNV-1a pass. Not exported — hashString() below always runs it
 * twice with independent seeds, since a lone 32-bit hash collides too
 * often across a real fleet (birthday bound ~2^16 distinct values) to be a
 * trustworthy grouping key on its own.
 */
function fnv1a(seed: number, input: string): number {
  let hash = seed;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Two independent 32-bit FNV-1a passes (different seeds) concatenated into
 * a 16-hex-char (64-bit-equivalent) digest — cheap, dependency-free, and
 * cuts collision likelihood far below a single 32-bit pass. Still
 * intentionally non-cryptographic: this only needs collision resistance
 * for grouping, not security, and stays synchronous so it can run inline
 * in the error/rejection handlers without an async detour through the Web
 * Crypto API.
 */
function hashString(input: string): string {
  const a = fnv1a(0x811c9dc5, input);
  const b = fnv1a(0x9e3779b9, input); // distinct seed (a different constant, not derived from `a`)
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/**
 * Non-reversible grouping key: an allowlisted error category plus a hash of
 * the top stack frame — deliberately EXCLUDING the error message. A hash is
 * non-reversible against a brute-force *unknown* input, but error messages
 * are low-entropy, guessable text (a finite-ish set of runtime error
 * templates, often with interpolated values) — hashing them is dictionary-
 * attackable regardless of hash strength, so a deterministic hash of the
 * message would not actually satisfy the "never scratch workspace text"
 * privacy invariant even though the raw text itself is never transmitted.
 * The top stack frame doesn't have this problem: it identifies a location
 * in STUDIO's OWN bundled code (function name + line:col of code shipped
 * to every user), never user-authored model/workspace content, so hashing
 * it groups the same recurring bug across sessions without deriving
 * anything from what the user actually typed.
 */
function signatureFor(error: Error | undefined): string {
  const name = error?.name && KNOWN_ERROR_NAMES.has(error.name) ? error.name : 'Error';
  const topFrame = error?.stack?.split('\n')[1]?.trim() ?? '';
  return `${name}:${hashString(topFrame)}`;
}
