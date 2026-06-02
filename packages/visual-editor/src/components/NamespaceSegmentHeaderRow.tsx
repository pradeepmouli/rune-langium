// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * NamespaceSegmentHeaderRow — the canonical sub-namespace header row.
 *
 * One source of truth for the flat, aggregated-full-path header used by BOTH
 * the namespace explorer panel and the inspector's type-picker popover, so the
 * two surfaces stay visually identical (the "shared look" requirement). The
 * header is rendered FLAT (no per-depth indentation): hierarchy is conveyed by
 * the aggregated full-path label (cdm, cdm.base, cdm.base.datetime) plus the
 * separator band, not by horizontal indent. Callers control the left padding
 * (constant in the flat layouts) via `indentPx`.
 */

import type { JSX } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@rune-langium/design-system/ui/button';

// ---------------------------------------------------------------------------
// Flat-tree geometry — the single source of truth for both the namespace
// explorer and the inspector's tree picker. There is NO per-depth step: every
// segment header sits at the base indent, and type rows get one fixed
// membership indent past it. Hierarchy reads from the aggregated full-path
// labels + separator bands, not from horizontal indentation.
// (Phase 5 will fold these into the layout-constants SSoT.)
// ---------------------------------------------------------------------------
export const NAMESPACE_TREE_INDENT_BASE = 8;
export const NAMESPACE_TREE_TYPE_INDENT = 16;

export interface NamespaceSegmentHeaderRowProps {
  /** Aggregated full dotted path shown as the label (e.g. "cdm.base.datetime"). */
  fullPath: string;
  /** Whether this segment is expanded (controls the chevron + collapse state). */
  expanded: boolean;
  /** Total count shown in the trailing chiclet (types in this subtree). */
  count: number;
  /** Toggle expand/collapse — fired by the chevron button and the label. */
  onToggle: () => void;
  /** Left padding in px. Flat layouts pass a constant baseline. */
  indentPx: number;
  /** Optional test id for the outer wrapper (explorer uses `ns-seg-${fullPath}`). */
  'data-testid'?: string;
}

export function NamespaceSegmentHeaderRow({
  fullPath,
  expanded,
  count,
  onToggle,
  indentPx,
  'data-testid': dataTestId
}: NamespaceSegmentHeaderRowProps): JSX.Element {
  return (
    <div data-testid={dataTestId} className="group">
      {/* Header band: separator + muted background mark this row as a namespace
          header (vs. a type row), since the flat layout drops the depth indent
          that would otherwise distinguish them. */}
      <div
        className="flex items-center gap-1 border-t border-border/60 bg-muted/40 px-2 py-1 text-sm hover:bg-accent/50 cursor-default text-foreground"
        style={{ paddingLeft: `${indentPx}px` }}
      >
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onToggle}
          aria-label={expanded ? 'Collapse segment' : 'Expand segment'}
          className="shrink-0"
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </Button>

        {/* Use a real <button> so keyboard users can toggle the segment with
            Enter/Space and assistive tech announces it as interactive. */}
        <button
          type="button"
          className="flex-1 truncate text-xs font-semibold tracking-wide cursor-pointer bg-transparent border-0 p-0 text-left text-inherit hover:text-inherit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onToggle}
        >
          {fullPath || '(default)'}
        </button>

        <span className="number-chiclet shrink-0">{count}</span>
      </div>
    </div>
  );
}
