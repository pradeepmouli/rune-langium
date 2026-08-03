// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { useOutputStore, fmtLine } from '../store/output-store.js';
import { withInstrumentation, Capture } from './instrumentation/core.js';

export const installTelemetryCapture = withInstrumentation(
  function installTelemetryCapture(): () => void {
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
  },
  { op: 'installTelemetryCapture' }
);

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

// Input is a raw Error (message/stack may embed user/model content) —
// never capture it. Output is the function's OWN deliberately-anonymised
// signature string (allowlisted name + hash of the top stack frame — see
// the doc comment above) — safe to capture verbatim by construction.
export const signatureFor = withInstrumentation(
  function signatureFor(error: Error | undefined): string {
    const name = error?.name && KNOWN_ERROR_NAMES.has(error.name) ? error.name : 'Error';
    const topFrame = error?.stack?.split('\n')[1]?.trim() ?? '';
    return `${name}:${hashString(topFrame)}`;
  },
  { op: 'signatureFor', capture: Capture.Output, sanitize: (value, which) => (which === 'output' ? value : undefined) }
);
