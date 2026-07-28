// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Explore's combined-diagnostics derivation — extracted from ExplorePerspective
 * (shared-perspective-chrome plan, Task 3 prep) so the FileTabStrip's future
 * sibling `ExploreCenterSlot` component can recompute the exact same value
 * `ExplorePerspective`'s body uses for the footer summary, rather than a
 * second stored copy. `combinedFileDiagnostics`/`combinedDiagnostics` are pure
 * functions of data already available via `useWorkspace()` (files/parseErrors)
 * and `useDiagnosticsStore()` (fileDiagnostics) — not independent state, so
 * they stay derivations rather than moving into `explore-file-nav-store.ts`.
 */

import type { WorkspaceFile } from '../services/workspace.js';
import type { LspDiagnostic } from '../store/diagnostics-store.js';
import { uriToPath } from '../utils/uri.js';

export function normalizeDiagnosticFilePath(uri: string, files: readonly WorkspaceFile[]): string {
  const path = uriToPath(uri);
  const match = files.find(
    (file) =>
      file.path === path || file.name === path || path.endsWith(`/${file.path}`) || path.endsWith(`/${file.name}`)
  );
  return match?.path ?? path;
}

export function toParserDiagnostics(messages: readonly string[]): LspDiagnostic[] {
  return messages.map((message, index) => ({
    range: {
      start: { line: index, character: 0 },
      end: { line: index, character: 0 }
    },
    severity: 1,
    source: 'parser',
    message
  }));
}

export function countDiagnostics(fileDiagnostics: ReadonlyMap<string, readonly LspDiagnostic[]>): {
  errors: number;
  warnings: number;
  total: number;
} {
  let errors = 0;
  let warnings = 0;
  let total = 0;
  for (const diagnostics of fileDiagnostics.values()) {
    for (const diagnostic of diagnostics) {
      total += 1;
      if (diagnostic.severity === 2) warnings += 1;
      else if (diagnostic.severity === 1) errors += 1;
    }
  }
  return { errors, warnings, total };
}

export function combineFileDiagnostics(
  fileDiagnostics: ReadonlyMap<string, readonly LspDiagnostic[]>,
  files: readonly WorkspaceFile[],
  parseErrors: ReadonlyMap<string, readonly string[]>
): Map<string, LspDiagnostic[]> {
  const merged = new Map<string, LspDiagnostic[]>();
  for (const [uri, diagnostics] of fileDiagnostics) {
    merged.set(normalizeDiagnosticFilePath(uri, files), [...diagnostics]);
  }
  for (const [filePath, messages] of parseErrors) {
    if (messages.length === 0) continue;
    const existing = merged.get(filePath) ?? [];
    merged.set(filePath, [...toParserDiagnostics(messages), ...existing]);
  }
  return merged;
}
