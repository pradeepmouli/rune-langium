// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { GeneratorDiagnostic } from './types.js';

/**
 * Optional location fields for a diagnostic.
 */
export interface DiagnosticOpts {
  sourceUri?: string;
  line?: number;
  char?: number;
}

/**
 * Creates a GeneratorDiagnostic with the given severity, code, and message.
 * Optionally includes source location information.
 * FR-025.
 *
 * @param severity - The severity of the diagnostic.
 * @param code - Short diagnostic code (e.g. 'unresolved-ref').
 * @param message - Human-readable description of the issue.
 * @param opts - Optional source location.
 * @returns A GeneratorDiagnostic object.
 */
export function createDiagnostic(
  severity: GeneratorDiagnostic['severity'],
  code: string,
  message: string,
  opts?: DiagnosticOpts
): GeneratorDiagnostic {
  return {
    severity,
    code,
    message,
    ...(opts?.sourceUri !== undefined && { sourceUri: opts.sourceUri }),
    ...(opts?.line !== undefined && { line: opts.line }),
    ...(opts?.char !== undefined && { char: opts.char })
  };
}

/**
 * Returns true if any diagnostic in the array has severity 'error'.
 * Used to determine whether a generation run encountered fatal issues.
 * FR-022, FR-025.
 *
 * @param diags - Array of diagnostics to check.
 * @returns true if any diagnostic is an error.
 */
export function hasFatalDiagnostics(diags: GeneratorDiagnostic[]): boolean {
  return diags.some((d) => d.severity === 'error');
}
