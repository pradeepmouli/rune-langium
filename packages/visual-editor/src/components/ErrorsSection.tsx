// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * ErrorsSection — shared read-only list of a node's domain/graph-level
 * validation errors (`GraphNodeMeta.errors`), rendered as a `Separator`
 * plus a labeled list of destructive-styled rows.
 *
 * Extracted from OtherForm so the five covered-kind editor forms
 * (DataTypeForm, EnumForm, ChoiceForm, FunctionForm, TypeAliasForm) can
 * show the same diagnostics OtherForm always did, instead of silently
 * dropping them once a refOnly node routes into its own form (Codex
 * review, PR #494).
 *
 * @module
 */

import { AlertCircle } from 'lucide-react';
import { Separator } from '@rune-langium/design-system/ui/separator';
import type { ValidationError } from '../types.js';

export interface ErrorsSectionProps {
  /** Domain/graph-level validation errors for the displayed node. */
  errors: ValidationError[];
}

export function ErrorsSection({ errors }: ErrorsSectionProps) {
  if (errors.length === 0) return null;

  return (
    <>
      <Separator />
      <div data-slot="errors-section" className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-destructive">Errors ({errors.length})</span>
        {errors.map((err, i) => (
          <div
            key={`${err.ruleId ?? 'err'}:${err.message}:${i}`}
            className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
          >
            <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
            <span>{err.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}
