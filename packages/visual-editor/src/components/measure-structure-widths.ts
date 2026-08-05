// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * DOM measurement pass for the Structure View's measure-then-layout pipeline.
 *
 * The structure layout must know every node's size BEFORE React renders
 * (positions come out of the layout), so the first pass uses character-count
 * estimates. This module implements the correction pass: after the estimated
 * layout commits, each rendered node's rows column and header are briefly
 * forced to `width: max-content` and their natural `offsetWidth` is read,
 * all synchronously inside a layout effect — the browser never paints the
 * mutated styles, so there is no visual flash.
 *
 * `offsetWidth` is used (not getBoundingClientRect) because it reports layout
 * pixels unaffected by React Flow's viewport zoom transform. It rounds to
 * integers, so +1px is added as sub-pixel headroom.
 *
 * jsdom safety: elements that report `offsetWidth === 0` (no real layout
 * engine, or display:none) are skipped, so unit tests exercise the pure
 * estimate path unchanged.
 */

import type { MeasuredNodeWidths } from '../types/structure-view.js';

/** Tolerance below which a re-measurement is considered unchanged (px). */
const EPSILON = 1.5;

interface MeasureTarget {
  readonly id: string;
  readonly rows: HTMLElement | null;
  readonly header: HTMLElement | null;
}

function differs(a: number | undefined, b: number | undefined): boolean {
  if (a === undefined || b === undefined) return a !== b;
  return Math.abs(a - b) > EPSILON;
}

/**
 * Measure the natural widths of every structure node currently in the DOM.
 *
 * @param container element wrapping the React Flow instance
 * @param prev previously recorded measurements for the same layout key —
 *   used to detect convergence so the measure → re-layout → measure loop
 *   terminates (returns `null` when nothing new or changed was found).
 * @returns a fresh map (prev entries merged with new ones) when at least one
 *   node produced a new or meaningfully different measurement; `null` when
 *   the pass found nothing to update (converged or nothing measurable).
 */
export function measureStructureNodeWidths(
  container: HTMLElement,
  prev: ReadonlyMap<string, MeasuredNodeWidths> | undefined
): Map<string, MeasuredNodeWidths> | null {
  const nodeEls = container.querySelectorAll<HTMLElement>('.react-flow__node');
  if (nodeEls.length === 0) return null;

  // Collect targets first so style writes and reads batch into single
  // reflows instead of interleaving (layout thrash).
  const targets: MeasureTarget[] = [];
  for (const el of nodeEls) {
    const id = el.getAttribute('data-id');
    if (!id) continue;
    targets.push({
      id,
      rows: el.querySelector<HTMLElement>('.rune-node-rows, .rune-graph-group__base-rows'),
      header: el.querySelector<HTMLElement>('.rune-node-header')
    });
  }
  if (targets.length === 0) return null;

  // WRITE phase — force natural sizing on every measured element.
  const undo: Array<{ el: HTMLElement; width: string }> = [];
  for (const t of targets) {
    for (const el of [t.rows, t.header]) {
      if (!el) continue;
      undo.push({ el, width: el.style.width });
      el.style.width = 'max-content';
    }
  }

  // READ phase — one reflow for the whole batch.
  const readings = targets.map((t) => ({
    id: t.id,
    rowsColWidth: t.rows && t.rows.offsetWidth > 0 ? t.rows.offsetWidth + 1 : undefined,
    headerWidth: t.header && t.header.offsetWidth > 0 ? t.header.offsetWidth + 1 : undefined
  }));

  // RESTORE phase — put the pre-measurement inline widths back before paint.
  for (const { el, width } of undo) el.style.width = width;

  // Merge with prev; only report a change when something actually moved.
  let changed = false;
  const next = new Map<string, MeasuredNodeWidths>(prev ?? []);
  for (const r of readings) {
    if (r.rowsColWidth === undefined && r.headerWidth === undefined) continue;
    const existing = next.get(r.id);
    if (existing && !differs(existing.rowsColWidth, r.rowsColWidth) && !differs(existing.headerWidth, r.headerWidth)) {
      continue;
    }
    next.set(r.id, { rowsColWidth: r.rowsColWidth, headerWidth: r.headerWidth });
    changed = true;
  }
  return changed ? next : null;
}
