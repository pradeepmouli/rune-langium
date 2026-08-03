// @instrumentation-codemod-applied
// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Flatten diagnostics grouped by file into a flat row array for virtualization.
 */

import type { LspDiagnostic } from '../store/diagnostics-store.js';
import { withInstrumentation, Capture } from '../services/instrumentation/core.js';

export type FlatDiagnosticRow =
  | { kind: 'file-header'; uri: string; count: number }
  | { kind: 'diagnostic'; uri: string; diagnostic: LspDiagnostic; index: number };

export const flattenDiagnostics = withInstrumentation(
  function flattenDiagnostics(diagnosticsByFile: Map<string, LspDiagnostic[]>): FlatDiagnosticRow[] {
    const rows: FlatDiagnosticRow[] = [];
    for (const [uri, diags] of diagnosticsByFile.entries()) {
      rows.push({ kind: 'file-header', uri, count: diags.length });
      for (let i = 0; i < diags.length; i++) {
        rows.push({ kind: 'diagnostic', uri, diagnostic: diags[i]!, index: i });
      }
    }
    return rows;
    // Rows carry raw LSP diagnostic message text — never captured; only a count.
  },
  {
    op: 'flattenDiagnostics',
    capture: Capture.Output,
    sanitize: (value, which) => (which === 'output' && Array.isArray(value) ? { rowCount: value.length } : undefined)
  }
);
