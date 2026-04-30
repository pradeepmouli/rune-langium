// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Debounced re-parse hook (T035).
 *
 * After a short idle window, re-parses the current file,
 * runs semantic diff against the previous parse, and only
 * triggers graph re-layout if structural changes are detected.
 */

import { useRef, useCallback, useEffect } from 'react';
import { semanticDiff, type TypeDeclaration } from './semantic-diff.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface DebouncedReparseOptions {
  /** Debounce delay in ms (default: 350). */
  delay?: number;
  /** Function to parse content into type declarations. */
  parseContent: (content: string) => TypeDeclaration[] | Promise<TypeDeclaration[]>;
  /** Callback when structural changes are detected. */
  onStructuralChange: (types: TypeDeclaration[]) => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────────────────

/**
 * React hook that debounces content changes and triggers re-parse
 * only when structural changes are detected.
 */
export function useDebouncedReparse({
  delay = 350,
  parseContent,
  onStructuralChange
}: DebouncedReparseOptions): (content: string) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousRef = useRef<TypeDeclaration[]>([]);
  const runIdRef = useRef(0);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleReparse = useCallback(
    (content: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const runId = ++runIdRef.current;

      timerRef.current = setTimeout(async () => {
        try {
          const types = await parseContent(content);
          if (runId !== runIdRef.current) {
            return;
          }
          const diff = semanticDiff(previousRef.current, types);

          if (diff.hasStructuralChanges) {
            previousRef.current = types;
            onStructuralChange(types);
          }
        } catch (error) {
          // Parse failure — skip re-layout, but surface the cause in devtools.
          console.warn(
            '[useDebouncedReparse] parseContent failed; skipping structural re-layout',
            error
          );
        }
      }, delay);
    },
    [delay, parseContent, onStructuralChange]
  );

  return scheduleReparse;
}
