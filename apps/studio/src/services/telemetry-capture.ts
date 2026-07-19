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
      subject: signature
    });
  };

  const onRejection = (event: PromiseRejectionEvent): void => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    const signature = signatureFor(reason instanceof Error ? reason : undefined, message);
    addLine(fmtLine('clientUnhandledRejection', message), 'error', {
      op: 'clientUnhandledRejection',
      subject: signature
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

function signatureFor(error: Error | undefined, message: string): string {
  const topFrame = error?.stack?.split('\n')[1]?.trim();
  return topFrame ? `${message.slice(0, 80)} @ ${topFrame.slice(0, 120)}` : message.slice(0, 80);
}
