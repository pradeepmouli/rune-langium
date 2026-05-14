// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Landing-state table for the code-preview panel (018 Phase 0 Task 0.7).
 *
 * Renders all targets from {@link TARGET_DESCRIPTORS} as rows. The action
 * affordance follows the emitter contract:
 *   - `contract === 'namespace'` (zod, typescript, json-schema, sql, markdown)
 *     → two buttons: [View] [Download]
 *   - `contract === 'whole-model'` (excel, graphql) → [Download] only
 *
 * The component is intentionally presentational: callers pass `onView` /
 * `onDownload` plus an optional `inflightTarget` to swap that row's
 * buttons for a spinner. State coordination lives in `CodePreviewPanel`
 * (Task 0.8); this file stays trivially testable as pure props.
 */

import React from 'react';
import { TARGET_DESCRIPTORS, type Target } from '@rune-langium/codegen';
import { Button } from '@rune-langium/design-system/ui/button';
import { Spinner } from '@rune-langium/design-system/ui/spinner';

export interface CodegenTargetsTableProps {
  /** Called when the user clicks the [View] button on a namespace-contract row. */
  onView: (target: Target) => void;
  /** Called when the user clicks the [Download] button on any row. */
  onDownload: (target: Target) => void;
  /**
   * If set, that target's row replaces its action buttons with a spinner
   * to indicate codegen is in flight for it.
   */
  inflightTarget?: Target;
}

const TARGET_KEYS = Object.keys(TARGET_DESCRIPTORS) as readonly Target[];

export function CodegenTargetsTable({
  onView,
  onDownload,
  inflightTarget
}: CodegenTargetsTableProps): React.ReactElement {
  return (
    <div
      data-testid="codegen-targets-table"
      className="preview-panel__targets-table flex h-full flex-col overflow-auto"
    >
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Target
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Description
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {TARGET_KEYS.map((target) => {
            const descriptor = TARGET_DESCRIPTORS[target];
            const isLoading = inflightTarget === target;
            const canView = descriptor.contract === 'namespace';
            return (
              <tr
                key={target}
                data-testid={`codegen-targets-table__row-${target}`}
                data-target={target}
                data-contract={descriptor.contract}
                className="border-b border-border last:border-b-0 hover:bg-muted/20"
              >
                <td className="px-3 py-2 font-medium">{descriptor.label}</td>
                <td className="px-3 py-2 text-muted-foreground">{descriptor.desc}</td>
                <td className="px-3 py-2 text-right">
                  {isLoading ? (
                    <Spinner data-testid={`codegen-targets-table__spinner-${target}`} className="ml-auto size-4" />
                  ) : (
                    <div className="flex justify-end gap-1.5">
                      {canView ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          data-testid={`codegen-targets-table__view-${target}`}
                          onClick={() => onView(target)}
                        >
                          View
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        data-testid={`codegen-targets-table__download-${target}`}
                        onClick={() => onDownload(target)}
                      >
                        Download
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
