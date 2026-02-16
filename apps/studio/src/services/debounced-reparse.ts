/**
 * Debounced re-parse hook (T035).
 *
 * After 500ms of editor idle, re-parses the current file,
 * runs semantic diff against the previous parse, and only
 * triggers graph re-layout if structural changes are detected.
 */

import { useRef, useCallback, useEffect } from 'react';
import { semanticDiff, type TypeDeclaration } from './semantic-diff.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface DebouncedReparseOptions {
  /** Debounce delay in ms (default: 500). */
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
  delay = 500,
  parseContent,
  onStructuralChange
}: DebouncedReparseOptions): (content: string) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousRef = useRef<TypeDeclaration[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleReparse = useCallback(
    (content: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      timerRef.current = setTimeout(async () => {
        try {
          const types = await parseContent(content);
          const diff = semanticDiff(previousRef.current, types);

          if (diff.hasStructuralChanges) {
            previousRef.current = types;
            onStructuralChange(types);
          }
        } catch {
          // Parse failure — skip re-layout
        }
      }, delay);
    },
    [delay, parseContent, onStructuralChange]
  );

  return scheduleReparse;
}
