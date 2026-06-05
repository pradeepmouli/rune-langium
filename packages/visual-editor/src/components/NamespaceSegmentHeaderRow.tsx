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

import type { CSSProperties, JSX } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@rune-langium/design-system/ui/button';
import { NumberChiclet } from '@rune-langium/design-system/ui/number-chiclet';
import type { TypeKind } from '../types.js';
import { KIND_LABEL } from './KindBadge.js';

// Order the kind-count chips deterministically (most common kinds first) so the
// breakdown reads consistently across namespaces.
const KIND_CHIP_ORDER: readonly TypeKind[] = [
  'data',
  'choice',
  'enum',
  'func',
  'record',
  'typeAlias',
  'basicType',
  'annotation'
];

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
  /**
   * Per-kind breakdown of the types DIRECTLY in this namespace (kinds with 0
   * omitted). When present and non-empty, a compact muted chip row renders under
   * the header (e.g. "14 data · 2 choice · 1 enum"). Optional so the inspector's
   * type-picker reuse of this row can omit it.
   */
  kindCounts?: Partial<Record<TypeKind, number>>;
  /** Toggle expand/collapse — fired by the chevron button and the label. */
  onToggle: () => void;
  /** Left padding in px. Flat layouts pass a constant baseline. */
  indentPx: number;
  /**
   * Nesting depth (0 = top-level namespace). Drives a progressively darker
   * resting background so deeper sub-namespaces read as nested even though the
   * flat layout keeps every header at the same indent. Defaults to 0.
   */
  depth?: number;
  /** Optional test id for the outer wrapper (explorer uses `ns-seg-${fullPath}`). */
  'data-testid'?: string;
}

export function NamespaceSegmentHeaderRow({
  fullPath,
  expanded,
  count,
  kindCounts,
  onToggle,
  indentPx,
  depth = 0,
  'data-testid': dataTestId
}: NamespaceSegmentHeaderRowProps): JSX.Element {
  // Compact per-kind chips for the types directly in this namespace. Only kinds
  // with count > 0 render; the row is omitted entirely when there are none.
  const kindChips = kindCounts
    ? KIND_CHIP_ORDER.filter((k) => (kindCounts[k] ?? 0) > 0).map((k) => ({ kind: k, count: kindCounts[k]! }))
    : [];
  // Resting fill deepens with depth (40% → +8%/level, capped at 72%) so nesting
  // is legible without a per-depth indent. Passed as a CSS variable so the
  // `.rune-ns-seg-header:hover` rule can still override the background (an inline
  // `background` would win over the hover and kill the affordance).
  const restingBgPercent = Math.min(40 + depth * 8, 72);
  const segStyle = {
    paddingLeft: `${indentPx}px`,
    '--ns-seg-bg': `color-mix(in oklch, var(--muted) ${restingBgPercent}%, transparent)`
  } as CSSProperties;

  return (
    <div data-testid={dataTestId} className="group">
      {/* Header band: separator + depth-tinted background mark this row as a
          namespace header (vs. a type row), since the flat layout drops the
          depth indent that would otherwise distinguish them. */}
      <div
        className="rune-ns-seg-header flex items-center gap-1 border-t border-border/60 px-2 py-1 text-sm cursor-default text-foreground"
        style={segStyle}
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
          className="flex-1 truncate text-xs font-normal cursor-pointer bg-transparent border-0 p-0 text-left text-inherit hover:text-inherit focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onToggle}
        >
          {fullPath || '(default)'}
        </button>

        <NumberChiclet>{count}</NumberChiclet>
      </div>

      {/* Per-kind breakdown chips for the types directly in this namespace.
          Compact + muted so the dense header rows stay scannable. Indented to
          sit under the label (chevron width + base indent). */}
      {kindChips.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pb-1 text-3xs text-muted-foreground/80"
          style={{ paddingLeft: `${indentPx + 28}px` }}
          data-testid={dataTestId ? `${dataTestId}-kinds` : undefined}
        >
          {kindChips.map(({ kind, count: kindCount }, i) => (
            <span key={kind} className="inline-flex items-center whitespace-nowrap">
              {i > 0 && <span className="mr-1.5 text-muted-foreground/40">·</span>}
              <span className="font-mono font-medium tabular-nums text-muted-foreground">{kindCount}</span>
              <span className="ml-0.5">{KIND_LABEL[kind].toLowerCase()}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
