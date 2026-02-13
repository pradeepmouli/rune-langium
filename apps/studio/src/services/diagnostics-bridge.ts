/**
 * Diagnostics bridge — LSP diagnostics → type name mapping (T033).
 *
 * Maps LSP diagnostics to the type declarations they belong to,
 * using line-range intersection. This lets the ReactFlow graph
 * show error badges on the correct type nodes.
 */

import type { LspDiagnostic, TypeDiagnosticsSummary } from '../types/diagnostics.js';

export type { LspDiagnostic, TypeDiagnosticsSummary } from '../types/diagnostics.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface TypePosition {
  /** Start line (0-based). */
  start: number;
  /** End line (0-based, inclusive). */
  end: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Implementation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map LSP diagnostics to type-level summaries using line-range intersection.
 */
export function mapDiagnosticsToTypes(
  uri: string,
  diagnostics: LspDiagnostic[],
  typePositions: Map<string, TypePosition>
): TypeDiagnosticsSummary[] {
  if (diagnostics.length === 0 || typePositions.size === 0) return [];

  // Build per-type counters
  const counters = new Map<string, { errors: number; warnings: number }>();

  for (const diag of diagnostics) {
    const diagLine = diag.range.start.line;

    for (const [typeName, pos] of typePositions) {
      if (diagLine >= pos.start && diagLine <= pos.end) {
        let counter = counters.get(typeName);
        if (!counter) {
          counter = { errors: 0, warnings: 0 };
          counters.set(typeName, counter);
        }
        if (diag.severity === 1) counter.errors++;
        else if (diag.severity === 2) counter.warnings++;
        break; // A diagnostic belongs to at most one type
      }
    }
  }

  // Convert to summaries
  const result: TypeDiagnosticsSummary[] = [];
  for (const [typeName, counter] of counters) {
    const pos = typePositions.get(typeName)!;
    result.push({
      typeName,
      errorCount: counter.errors,
      warningCount: counter.warnings,
      fileUri: uri,
      lineRange: { start: pos.start, end: pos.end }
    });
  }

  return result;
}
