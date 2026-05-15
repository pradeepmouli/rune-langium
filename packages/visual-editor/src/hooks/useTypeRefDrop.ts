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
 *   security; only `dataTransfer.types` is reliable. We check for kind-specific
 *   MIME variants (typeRefMimeForKind) so the `accept` policy is enforced at
 *   dragover time, not just at drop time.
 * - `dropEffect` writes can throw in some strict-mode test stubs; we guard
 *   the assignment defensively without altering the public contract.
 * - The `enterCountRef` pattern (mirrored from useDragDrop.ts) prevents
 *   `isOver` from flickering when the pointer crosses child element boundaries
 *   inside the drop zone.
 *
 * @module
 */

import type React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  TYPE_REF_PAYLOAD_MIME,
  type TypeRefPayload,
  isTypeRefPayload,
  typeRefMimeForKind
} from '../types/structure-view.js';

export interface UseTypeRefDropOptions {
  /**
   * Kinds this drop target will accept. Drops whose `payload.kind` is not in
   * this list are silently ignored (no `onDrop` call). During dragover,
   * `isOver` is only set when the drag source registered at least one
   * kind-specific MIME that matches this list.
   */
  readonly accept: ReadonlyArray<TypeRefPayload['kind']>;
  /** Called with the parsed payload when an accepted drop completes. */
  readonly onDrop: (payload: TypeRefPayload) => void;
}

export interface UseTypeRefDropResult {
  readonly dragOverHandlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** True between an accepted `dragenter` and the subsequent `dragleave`/`drop`. */
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

export function useTypeRefDrop(opts: UseTypeRefDropOptions): UseTypeRefDropResult {
  const { accept, onDrop } = opts;
  const [isOver, setIsOver] = useState(false);

  // enterCountRef prevents isOver from flickering when the pointer crosses
  // child element boundaries inside the drop zone (mirrors useDragDrop.ts).
  const enterCountRef = useRef(0);

  // Memoize the acceptable MIME set so the dragover/dragenter handlers can do
  // O(1) lookups without recomputing per event.
  const acceptableMimes = useMemo(() => new Set(accept.map(typeRefMimeForKind)), [accept]);

  /** Returns true when the dataTransfer carries at least one accepted kind MIME. */
  function hasAcceptedMime(types: DataTransfer['types'] | ReadonlyArray<string> | undefined): boolean {
    if (!types) return false;
    for (let i = 0; i < types.length; i++) {
      if (acceptableMimes.has(types[i].toLowerCase())) return true;
    }
    return false;
  }

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (!hasAcceptedMime(e.dataTransfer?.types)) return;
      enterCountRef.current++;
      setIsOver(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acceptableMimes]
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!hasAcceptedMime(e.dataTransfer?.types)) return;
      e.preventDefault();
      // Some test stubs / locked-down browsers may make dropEffect read-only.
      try {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'link';
      } catch {
        // Non-fatal; the accept signal is carried by preventDefault().
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [acceptableMimes]
  );

  const onDragLeave = useCallback((_e: React.DragEvent) => {
    enterCountRef.current--;
    if (enterCountRef.current <= 0) {
      enterCountRef.current = 0;
      setIsOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      enterCountRef.current = 0;
      setIsOver(false);
      const payload = parsePayload(e);
      if (!payload) return;
      // Belt-and-braces: also check kind for sources that registered the
      // canonical MIME but not the kind-specific one.
      if (!accept.includes(payload.kind)) return;
      onDrop(payload);
    },
    [accept, onDrop]
  );

  return {
    isOver,
    dragOverHandlers: { onDragEnter, onDragOver, onDragLeave, onDrop: handleDrop }
  };
}
