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
    const signature = signatureFor(event.error, event.message);
    addLine(fmtLine('clientError', event.message || 'window error'), 'error', {
      op: 'clientError',
      signature
    });
  };

  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const signature = signatureFor(reason instanceof Error ? reason : undefined, message);
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
 * Non-reversible grouping key: an allowlisted error category plus a hash of
 * the message + top stack frame, never the raw text itself. Error messages
 * and stack frames can carry workspace-derived content (file paths, type
 * names, interpolated values) that the Privacy UI promises never to send —
 * a raw substring here would violate that even though it's only used for
 * dedup grouping. FNV-1a is intentionally non-cryptographic (this only
 * needs collision-resistance for grouping, not security) and synchronous,
 * so it can run inline in the error/rejection handlers without an async
 * detour through the Web Crypto API.
 */
function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function signatureFor(error: Error | undefined, message: string): string {
  const name = error?.name && KNOWN_ERROR_NAMES.has(error.name) ? error.name : 'Error';
  const topFrame = error?.stack?.split('\n')[1]?.trim() ?? '';
  return `${name}:${hashString(`${message}\n${topFrame}`)}`;
}
