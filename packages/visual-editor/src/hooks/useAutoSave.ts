/**
 * Auto-save hook with configurable debounce delay.
 *
 * Commits the latest value after a period of inactivity. Uses a ref-based
 * approach to always flush the most recent value, avoiding stale closures.
 * Flushes pending value on unmount to prevent data loss.
 *
 * @example
 * ```tsx
 * const debouncedSave = useAutoSave((value: string) => {
 *   store.renameType(nodeId, value);
 * }, 500);
 *
 * <input onChange={(e) => debouncedSave(e.target.value)} />
 * ```
 */

import { useCallback, useEffect, useRef } from 'react';

/**
 * Returns a debounced callback that auto-saves the latest value after
 * `delay` milliseconds of inactivity. Flushes on unmount.
 *
 * @param onCommit - Callback invoked with the latest value on commit.
 * @param delay - Debounce delay in milliseconds (default 500).
 * @returns A debounced setter function.
 */
export function useAutoSave<T>(onCommit: (value: T) => void, delay = 500): (value: T) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<T | undefined>(undefined);
  const pendingRef = useRef(false);
  const commitRef = useRef(onCommit);

  // Keep the commit callback ref up to date without re-creating the debounced fn
  commitRef.current = onCommit;

  const debouncedSet = useCallback(
    (value: T) => {
      latestRef.current = value;
      pendingRef.current = true;

      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        if (pendingRef.current) {
          commitRef.current(latestRef.current as T);
          pendingRef.current = false;
        }
        timerRef.current = null;
      }, delay);
    },
    [delay]
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      if (pendingRef.current) {
        commitRef.current(latestRef.current as T);
        pendingRef.current = false;
      }
    };
  }, []);

  return debouncedSet;
}
