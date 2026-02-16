/**
 * useExpressionAutocomplete — hook for expression editor autocompletion.
 *
 * Given cursor position and expression text, derives completion candidates:
 * - Type names from availableTypes
 * - Feature paths from selected input types
 * - Built-in function names
 *
 * Returns filtered suggestions for popup rendering.
 *
 * @module
 */

import { useMemo, useCallback } from 'react';
import type { TypeOption } from '../types.js';

// ---------------------------------------------------------------------------
// Built-in function names (Rune DSL expression builtins)
// ---------------------------------------------------------------------------

const BUILTIN_FUNCTIONS = [
  'if',
  'then',
  'else',
  'exists',
  'is absent',
  'count',
  'only exists',
  'only element',
  'all',
  'any',
  'contains',
  'disjoint',
  'flatten',
  'distinct',
  'reverse',
  'first',
  'last',
  'sum',
  'min',
  'max',
  'sort',
  'filter',
  'map',
  'reduce',
  'extract',
  'join',
  'to-string',
  'to-number',
  'to-int',
  'to-enum',
  'to-date',
  'to-time',
  'to-dateTime',
  'to-zonedDateTime'
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompletionItem {
  /** Display label for the completion. */
  label: string;
  /** Kind of completion (type, function, feature). */
  kind: 'type' | 'function' | 'feature';
  /** Optional detail text. */
  detail?: string;
  /** The text to insert. */
  insertText: string;
}

export interface UseExpressionAutocompleteResult {
  /** Get completions for the given query text. */
  getCompletions: (query: string) => CompletionItem[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function useExpressionAutocomplete(
  availableTypes: TypeOption[],
  inputParams?: Array<{ name: string; typeName?: string }>
): UseExpressionAutocompleteResult {
  // Precompute type completions
  const typeCompletions = useMemo<CompletionItem[]>(
    () =>
      availableTypes.map((opt) => ({
        label: opt.label,
        kind: 'type' as const,
        detail: opt.namespace ?? opt.kind,
        insertText: opt.label
      })),
    [availableTypes]
  );

  // Precompute function completions
  const functionCompletions = useMemo<CompletionItem[]>(
    () =>
      BUILTIN_FUNCTIONS.map((fn) => ({
        label: fn,
        kind: 'function' as const,
        detail: 'built-in',
        insertText: fn
      })),
    []
  );

  // Precompute feature path completions from input params
  const featureCompletions = useMemo<CompletionItem[]>(() => {
    if (!inputParams) return [];

    return inputParams.map((param) => ({
      label: param.name,
      kind: 'feature' as const,
      detail: param.typeName ? `→ ${param.typeName}` : 'input',
      insertText: param.name
    }));
  }, [inputParams]);

  // Combined search
  const getCompletions = useCallback(
    (query: string): CompletionItem[] => {
      if (!query || query.trim().length === 0) {
        // Return all (capped at 50)
        return [
          ...featureCompletions,
          ...functionCompletions.slice(0, 20),
          ...typeCompletions.slice(0, 20)
        ];
      }

      const lower = query.toLowerCase();
      const allItems = [...featureCompletions, ...functionCompletions, ...typeCompletions];

      return allItems.filter((item) => item.label.toLowerCase().includes(lower)).slice(0, 30);
    },
    [typeCompletions, functionCompletions, featureCompletions]
  );

  return { getCompletions };
}

export { useExpressionAutocomplete };
