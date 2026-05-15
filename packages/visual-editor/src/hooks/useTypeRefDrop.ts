// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * useTypeRefDrop — shared drop-target hook for `application/x-rune-type-ref`
 * payloads (Structure View, Phase 4).
 *
 * Consumed by:
 * - Phase 5 TypePickerCell (cell-level drop)
 * - Phase 8 NamespaceExplorer palette (cross-pane drop)
 * - Phase 9 CodeMirror editor (paste-as-drop)
 *
 * Design notes:
 * - The hook is purely event-handler driven; it has no subscriptions and
 *   needs no cleanup. Do not add `useEffect`.
 * - During `dragover`, browsers return `''` from `dataTransfer.getData` for
 *   security; only `dataTransfer.types` is reliable. We therefore gate
 *   accept-during-dragover on the MIME type alone, and only validate the
 *   parsed payload on `drop`.
 * - `dropEffect` writes can throw in some strict-mode test stubs; we guard
 *   the assignment defensively without altering the public contract.
 *
 * @module
 */

import type React from 'react';
import { useCallback, useState } from 'react';

import { TYPE_REF_PAYLOAD_MIME, type TypeRefPayload, isTypeRefPayload } from '../types/structure-view.js';

export interface UseTypeRefDropOptions {
  /**
   * Kinds this drop target will accept. Drops whose `payload.kind` is not in
   * this list are silently ignored (no `onDrop` call).
   */
  readonly accept: ReadonlyArray<TypeRefPayload['kind']>;
  /** Called with the parsed payload when an accepted drop completes. */
  readonly onDrop: (payload: TypeRefPayload) => void;
}

export interface UseTypeRefDropResult {
  readonly dragOverHandlers: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** True between an accepted `dragover` and the subsequent `dragleave`/`drop`. */
  readonly isOver: boolean;
}

function parsePayload(e: React.DragEvent): TypeRefPayload | undefined {
  const raw = e.dataTransfer?.getData(TYPE_REF_PAYLOAD_MIME);
  if (!raw) return undefined;
  try {
    const v: unknown = JSON.parse(raw);
    return isTypeRefPayload(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function hasTypeRefMime(types: DataTransfer['types'] | ReadonlyArray<string> | undefined): boolean {
  if (!types) return false;
  // `DataTransferItemList`-like objects expose iteration but not Array methods.
  for (const t of Array.from(types)) {
    if (t === TYPE_REF_PAYLOAD_MIME) return true;
  }
  return false;
}

export function useTypeRefDrop(opts: UseTypeRefDropOptions): UseTypeRefDropResult {
  const { accept, onDrop } = opts;
  const [isOver, setIsOver] = useState(false);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasTypeRefMime(e.dataTransfer?.types)) return;
    e.preventDefault();
    // Some test stubs / locked-down browsers may make dropEffect read-only.
    try {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'link';
    } catch {
      // Non-fatal; the accept signal is carried by preventDefault().
    }
    setIsOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsOver(false);
      const payload = parsePayload(e);
      if (!payload) return;
      if (!accept.includes(payload.kind)) return;
      onDrop(payload);
    },
    [accept, onDrop]
  );

  return {
    isOver,
    dragOverHandlers: { onDragOver, onDragLeave, onDrop: handleDrop }
  };
}
