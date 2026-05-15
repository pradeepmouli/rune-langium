// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for useTypeRefDrop hook (Phase 4, T4.1).
 *
 * Covers the canonical plan flow (smoke, accept, drop, reject) plus
 * self-review-driven cases for defensive behavior:
 * malformed JSON, missing MIME, dragleave reset, idempotent dragover,
 * and stale-callback safety across re-renders.
 */

import { describe, it, expect, vi } from 'vitest';
import type React from 'react';
import { renderHook, act } from '@testing-library/react';
import { useTypeRefDrop } from '../../src/hooks/useTypeRefDrop.js';
import { TYPE_REF_PAYLOAD_MIME, type TypeRefPayload } from '../../src/types/structure-view.js';

interface MakeDragEventOpts {
  readonly type: 'dragover' | 'drop' | 'dragleave';
  readonly payload?: TypeRefPayload;
  /** Force `types` array (e.g. `[]` to test missing-MIME case). */
  readonly types?: ReadonlyArray<string>;
  /** Force `getData` to return a specific string (e.g. malformed JSON). */
  readonly rawData?: string;
}

function makeDragEvent(opts: MakeDragEventOpts): React.DragEvent {
  const { type, payload, types, rawData } = opts;
  const effectiveTypes = types !== undefined ? types : payload ? [TYPE_REF_PAYLOAD_MIME] : [];
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

  it("sets isOver=true on dragover with an acceptable payload's MIME type", () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
      kind: 'Data'
    };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    const evt = makeDragEvent({ type: 'dragover', payload });
    act(() => {
      result.current.dragOverHandlers.onDragOver(evt);
    });
    expect(result.current.isOver).toBe(true);
    expect(evt.preventDefault).toHaveBeenCalled();
  });

  it('calls onDrop with the parsed payload when accepted', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
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

  it('does not set isOver or call preventDefault when MIME is missing on dragover', () => {
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    const evt = makeDragEvent({ type: 'dragover', types: [] });
    act(() => {
      result.current.dragOverHandlers.onDragOver(evt);
    });
    expect(result.current.isOver).toBe(false);
    expect(evt.preventDefault).not.toHaveBeenCalled();
  });

  it('resets isOver to false on dragleave after dragover set it true', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
      kind: 'Data'
    };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    act(() => {
      result.current.dragOverHandlers.onDragOver(makeDragEvent({ type: 'dragover', payload }));
    });
    expect(result.current.isOver).toBe(true);

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
      kind: 'Data'
    };
    const { result } = renderHook(() => useTypeRefDrop({ accept: ['Data'], onDrop: vi.fn() }));

    act(() => {
      result.current.dragOverHandlers.onDragOver(makeDragEvent({ type: 'dragover', payload }));
    });
    const firstReference = result.current;
    expect(firstReference.isOver).toBe(true);

    act(() => {
      result.current.dragOverHandlers.onDragOver(makeDragEvent({ type: 'dragover', payload }));
    });
    // Object.is on the boolean keeps the same state value; React bails out and the
    // hook return object identity is preserved by useState/useCallback memoization.
    expect(result.current.isOver).toBe(true);
    expect(result.current).toBe(firstReference);
  });

  it('uses the latest onDrop callback after a re-render (no stale closure)', () => {
    const payload: TypeRefPayload = {
      rune: 'type-ref',
      namespaceUri: 'ns',
      typeId: 'T',
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
});
