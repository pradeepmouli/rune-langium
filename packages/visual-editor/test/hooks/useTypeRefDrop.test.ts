// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for useTypeRefDrop hook (Phase 4, T4.1).
 *
 * Covers the canonical plan flow (smoke, accept, drop, reject) plus
 * self-review-driven cases for defensive behavior:
 * malformed JSON, missing MIME, dragleave reset, idempotent dragover,
 * and stale-callback safety across re-renders.
 *
 * Copilot-review fixes (round 7):
 * - isOver is now owned by the enterCountRef enter/leave counter, not by dragover.
 * - onDragEnter must be called before dragover for isOver to become true.
 * - Kind-specific MIMEs (typeRefMimeForKind) are required in the `types` array
 *   for the accept policy to be enforced during dragover/dragenter.
 */

import { describe, it, expect, vi } from 'vitest';
import type React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useTypeRefDrop } from '../../src/hooks/useTypeRefDrop.js';
import { TYPE_REF_PAYLOAD_MIME, type TypeRefPayload, typeRefMimeForKind } from '../../src/types/structure-view.js';

interface MakeDragEventOpts {
  readonly type: 'dragenter' | 'dragover' | 'drop' | 'dragleave';
  readonly payload?: TypeRefPayload;
  /** Force `types` array (e.g. `[]` to test missing-MIME case). */
  readonly types?: ReadonlyArray<string>;
  /** Force `getData` to return a specific string (e.g. malformed JSON). */
  readonly rawData?: string;
}

function makeDragEvent(opts: MakeDragEventOpts): React.DragEvent {
  const { type, payload, types, rawData } = opts;
  // Default types: include both the canonical MIME and the kind-specific MIME
  // so that dragenter/dragover accept-checks work out of the box.
  const effectiveTypes =
    types !== undefined ? types : payload ? [TYPE_REF_PAYLOAD_MIME, typeRefMimeForKind(payload.kind)] : [];
  const getData = vi.fn((mime: string) => {
    if (mime !== TYPE_REF_PAYLOAD_MIME) return '';
    if (rawData !== undefined) return rawData;
    // Mirror browser behavior: getData returns '' during dragover for security;
    // only return the serialized payload on `drop`.
    if (type !== 'drop') return '';
    return payload ? JSON.stringify(payload) : '';
  });
  const dt = {
    types: effectiveTypes,
    getData,
    dropEffect: 'none' as DataTransfer['dropEffect']
  };
  return {
    type,
    dataTransfer: dt,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as React.DragEvent;
}

describe('useTypeRefDrop', () => {
  it('starts with isOver=false', () => {
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));
    expect(result.current.isOver).toBe(false);
  });

  it('sets isOver=true on dragenter with an acceptable kind MIME type', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
      typeName: 'T',
      kind: 'Data'
    };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    const evt = makeDragEvent({ type: 'dragenter', payload });
    act(() => {
      result.current.dragOverHandlers.onDragEnter(evt);
    });
    expect(result.current.isOver).toBe(true);
  });

  it('dragover calls preventDefault when kind MIME matches accept', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
      typeName: 'T',
      kind: 'Data'
    };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    act(() => {
      result.current.dragOverHandlers.onDragEnter(makeDragEvent({ type: 'dragenter', payload }));
    });
    const overEvt = makeDragEvent({ type: 'dragover', payload });
    act(() => {
      result.current.dragOverHandlers.onDragOver(overEvt);
    });
    expect(overEvt.preventDefault).toHaveBeenCalled();
  });

  it('calls onDrop with the parsed payload when accepted', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
      typeName: 'T',
      kind: 'Choice'
    };
    const onDrop = vi.fn();
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Choice', 'Data'], onDrop }));

    act(() => {
      result.current.dragOverHandlers.onDrop(makeDragEvent({ type: 'drop', payload }));
    });
    expect(onDrop).toHaveBeenCalledWith(payload);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it('ignores drops whose kind is not in accept', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
      typeName: 'T',
      kind: 'Enum'
    };
    const onDrop = vi.fn();
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop }));

    act(() => {
      result.current.dragOverHandlers.onDrop(makeDragEvent({ type: 'drop', payload }));
    });
    expect(onDrop).not.toHaveBeenCalled();
  });

  // --- Self-review-driven defensive cases ---

  it('does not throw and does not call onDrop when getData returns malformed JSON', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop }));

    const evt = makeDragEvent({ type: 'drop', rawData: 'not-valid-json' });
    expect(() => {
      act(() => {
        result.current.dragOverHandlers.onDrop(evt);
      });
    }).not.toThrow();
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('does not set isOver or call preventDefault when MIME is missing on dragenter/dragover', () => {
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    const enterEvt = makeDragEvent({ type: 'dragenter', types: [] });
    const overEvt = makeDragEvent({ type: 'dragover', types: [] });
    act(() => {
      result.current.dragOverHandlers.onDragEnter(enterEvt);
      result.current.dragOverHandlers.onDragOver(overEvt);
    });
    expect(result.current.isOver).toBe(false);
    expect(overEvt.preventDefault).not.toHaveBeenCalled();
  });

  it('resets isOver to false on dragleave after dragenter set it true', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
      typeName: 'T',
      kind: 'Data'
    };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    act(() => {
      result.current.dragOverHandlers.onDragEnter(makeDragEvent({ type: 'dragenter', payload }));
    });
    expect(result.current.isOver).toBe(true);

    act(() => {
      result.current.dragOverHandlers.onDragLeave(makeDragEvent({ type: 'dragleave' }));
    });
    expect(result.current.isOver).toBe(false);
  });

  it('enterCountRef prevents flicker: nested dragleave does not clear isOver until final leave', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
      typeName: 'T',
      kind: 'Data'
    };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    // Simulate pointer entering parent, then a child (two enters, one parent-leave).
    act(() => {
      result.current.dragOverHandlers.onDragEnter(makeDragEvent({ type: 'dragenter', payload }));
      result.current.dragOverHandlers.onDragEnter(makeDragEvent({ type: 'dragenter', payload })); // child
    });
    expect(result.current.isOver).toBe(true);

    // First dragleave (parent fires as pointer moves to child) — should stay true.
    act(() => {
      result.current.dragOverHandlers.onDragLeave(makeDragEvent({ type: 'dragleave' }));
    });
    expect(result.current.isOver).toBe(true); // counter now 1, not yet 0

    // Final dragleave (pointer left the zone entirely).
    act(() => {
      result.current.dragOverHandlers.onDragLeave(makeDragEvent({ type: 'dragleave' }));
    });
    expect(result.current.isOver).toBe(false);
  });

  it('re-dispatching dragover while already isOver=true is a no-op (idempotent)', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
      typeName: 'T',
      kind: 'Data'
    };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    act(() => {
      result.current.dragOverHandlers.onDragEnter(makeDragEvent({ type: 'dragenter', payload }));
    });
    const firstReference = result.current;
    expect(firstReference.isOver).toBe(true);

    act(() => {
      result.current.dragOverHandlers.onDragOver(makeDragEvent({ type: 'dragover', payload }));
    });
    // dragover no longer touches isOver; state stays true and hook identity is preserved.
    expect(result.current.isOver).toBe(true);
    expect(result.current).toBe(firstReference);
  });

  it('uses the latest onDrop callback after a re-render (no stale closure)', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
      typeName: 'T',
      kind: 'Data'
    };
    const onDrop1 = vi.fn();
    const onDrop2 = vi.fn();

    const { result, rerender } = renderHook(
      ({ onDrop }: { onDrop: (p: TypeRefPayload) => void }) => useTypeRefDrop({ accept: ['Data'], onDrop }),
      { initialProps: { onDrop: onDrop1 } }
    );

    act(() => {
      result.current.dragOverHandlers.onDrop(makeDragEvent({ type: 'drop', payload }));
    });
    expect(onDrop1).toHaveBeenCalledTimes(1);
    expect(onDrop2).not.toHaveBeenCalled();

    rerender({ onDrop: onDrop2 });

    act(() => {
      result.current.dragOverHandlers.onDrop(makeDragEvent({ type: 'drop', payload }));
    });
    expect(onDrop1).toHaveBeenCalledTimes(1); // not called again
    expect(onDrop2).toHaveBeenCalledTimes(1);
    expect(onDrop2).toHaveBeenCalledWith(payload);
  });

  // --- Copilot-review findings (round 7) ---

  it('dragover with non-accepted kind does NOT set isOver and does not call preventDefault', () => {
    // Target accepts only 'Data'; source registers only the 'Enum' kind MIME.
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    const enterEvt = makeDragEvent({
      type: 'dragenter',
      types: [TYPE_REF_PAYLOAD_MIME, typeRefMimeForKind('Enum')]
    });
    const overEvt = makeDragEvent({
      type: 'dragover',
      types: [TYPE_REF_PAYLOAD_MIME, typeRefMimeForKind('Enum')]
    });
    act(() => {
      result.current.dragOverHandlers.onDragEnter(enterEvt);
      result.current.dragOverHandlers.onDragOver(overEvt);
    });
    expect(result.current.isOver).toBe(false);
    expect(overEvt.preventDefault).not.toHaveBeenCalled();
  });

  it('dragover with mixed kinds where at least one matches DOES set isOver', () => {
    // Target accepts 'Data' and 'Choice'; source registers both Data and Enum kind MIMEs.
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data', 'Choice'], onDrop: vi.fn() }));

    const types = [
      TYPE_REF_PAYLOAD_MIME,
      typeRefMimeForKind('Data'), // accepted
      typeRefMimeForKind('Enum') // not in accept list but Data is present
    ];
    const enterEvt = makeDragEvent({ type: 'dragenter', types });
    const overEvt = makeDragEvent({ type: 'dragover', types });
    act(() => {
      result.current.dragOverHandlers.onDragEnter(enterEvt);
      result.current.dragOverHandlers.onDragOver(overEvt);
    });
    expect(result.current.isOver).toBe(true);
    expect(overEvt.preventDefault).toHaveBeenCalled();
  });

  // --- Codex review fix: preventDefault gated on accepted payload (round 8) ---

  it('does NOT call preventDefault on a drop without a type-ref payload', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop }));
    // No payload → no type-ref MIME → parsePayload returns undefined → early return
    const evt = makeDragEvent({ type: 'drop', types: [] });
    act(() => {
      result.current.dragOverHandlers.onDrop(evt);
    });
    expect(evt.preventDefault).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
    // Hover state must still be reset
    expect(result.current.isOver).toBe(false);
  });

  it('does NOT call preventDefault on a drop with a non-accepted kind', () => {
    const onDrop = vi.fn();
    const payload: TypeRefPayload = { rune: 'type-ref', namespaceUri: 'ns', typeId: 'T', typeName: 'T', kind: 'Enum' };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop }));
    const evt = makeDragEvent({ type: 'drop', payload });
    act(() => {
      result.current.dragOverHandlers.onDrop(evt);
    });
    expect(evt.preventDefault).not.toHaveBeenCalled();
    expect(onDrop).not.toHaveBeenCalled();
  });

  // --- Codex round-8 regression: canonical-MIME-only (single-MIME fallback) ---

  it('accepts canonical-MIME-only drags during dragover/dragenter (single-MIME fallback)', () => {
    const onDrop = vi.fn();
    const payload: TypeRefPayload = { rune: 'type-ref', namespaceUri: 'ns', typeId: 'T', typeName: 'T', kind: 'Data' };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop }));

    // Source registered ONLY the canonical MIME (no kind-specific marker).
    const enterEvt = makeDragEvent({
      type: 'dragenter',
      types: [TYPE_REF_PAYLOAD_MIME],
      payload
    });
    const overEvt = makeDragEvent({
      type: 'dragover',
      types: [TYPE_REF_PAYLOAD_MIME],
      payload
    });

    act(() => {
      result.current.dragOverHandlers.onDragEnter(enterEvt);
    });
    expect(result.current.isOver).toBe(true);

    act(() => {
      result.current.dragOverHandlers.onDragOver(overEvt);
    });
    expect(overEvt.preventDefault).toHaveBeenCalled();
  });

  it('single-MIME source with accepted kind: drop calls onDrop', () => {
    const onDrop = vi.fn();
    const payload: TypeRefPayload = { rune: 'type-ref', namespaceUri: 'ns', typeId: 'T', typeName: 'T', kind: 'Data' };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop }));

    // Drop event — getData returns payload JSON (as browser does on drop).
    const dropEvt = makeDragEvent({ type: 'drop', payload });
    act(() => {
      result.current.dragOverHandlers.onDrop(dropEvt);
    });
    expect(onDrop).toHaveBeenCalledWith(payload);
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it('single-MIME source with non-accepted kind: drop does NOT call onDrop', () => {
    // Canonical-MIME-only source whose payload.kind is not in accept —
    // drop-time filter via parsePayload + accept rejects it.
    const onDrop = vi.fn();
    const payload: TypeRefPayload = { rune: 'type-ref', namespaceUri: 'ns', typeId: 'T', typeName: 'T', kind: 'Enum' };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop }));

    // Dragenter with canonical MIME only — isOver becomes true (migration trade-off).
    const enterEvt = makeDragEvent({
      type: 'dragenter',
      types: [TYPE_REF_PAYLOAD_MIME],
      payload
    });
    act(() => {
      result.current.dragOverHandlers.onDragEnter(enterEvt);
    });
    expect(result.current.isOver).toBe(true); // "soft" accept during hover — expected trade-off

    // Drop — parsePayload sees kind: 'Enum' which is not in ['Data']; onDrop must NOT fire.
    const dropEvt = makeDragEvent({ type: 'drop', payload });
    act(() => {
      result.current.dragOverHandlers.onDrop(dropEvt);
    });
    expect(onDrop).not.toHaveBeenCalled();
    // Hover state is reset regardless.
    expect(result.current.isOver).toBe(false);
  });

  // --- Browser normalization regression (Copilot round-7 fix) ---

  it('accepts browser-normalized lowercase MIME when accept list uses PascalCase kind', () => {
    // Browsers normalize DataTransfer.types to lowercase. A source that registers
    // "application/x-rune-type-ref+Data" will be seen as
    // "application/x-rune-type-ref+data" at the target.
    // The fix: typeRefMimeForKind always lowercases, and hasAcceptedMime also
    // lowercases the incoming types before checking the Set.
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    // Simulate what the browser delivers: already-lowercased kind suffix.
    const browserNormalizedTypes = [
      TYPE_REF_PAYLOAD_MIME,
      'application/x-rune-type-ref+data' // lowercase, as browser would produce
    ];
    const enterEvt = makeDragEvent({ type: 'dragenter', types: browserNormalizedTypes });
    const overEvt = makeDragEvent({ type: 'dragover', types: browserNormalizedTypes });
    act(() => {
      result.current.dragOverHandlers.onDragEnter(enterEvt);
    });
    expect(result.current.isOver).toBe(true);

    act(() => {
      result.current.dragOverHandlers.onDragOver(overEvt);
    });
    expect(overEvt.preventDefault).toHaveBeenCalled();
  });
});
