/**
 * Tests for the useDragDrop hook (useDraggable + useDroppable).
 *
 * Validates drag event handling, enter/leave counter logic, MIME type
 * validation, and canDrag/canDrop guards.
 *
 * @module
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDraggable, useDroppable, EXPRESSION_DRAG_TYPE } from '../../src/hooks/useDragDrop.js';

// ---------------------------------------------------------------------------
// Helpers — mock DragEvent
// ---------------------------------------------------------------------------

function mockDragEvent(
  overrides: Partial<{
    types: string[];
    data: Record<string, string>;
    dropEffect: string;
  }> = {}
): any {
  const data = overrides.data ?? {};
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      types: overrides.types ?? [EXPRESSION_DRAG_TYPE],
      effectAllowed: 'uninitialized',
      dropEffect: overrides.dropEffect ?? 'none',
      setData: vi.fn((type: string, val: string) => {
        data[type] = val;
      }),
      getData: vi.fn((type: string) => data[type] ?? '')
    }
  };
}

// ---------------------------------------------------------------------------
// useDraggable
// ---------------------------------------------------------------------------

describe('useDraggable', () => {
  it('returns draggable: true and isDragging: false initially', () => {
    const { result } = renderHook(() => useDraggable({ nodeId: 'n1' }));
    expect(result.current.draggable).toBe(true);
    expect(result.current.isDragging).toBe(false);
  });

  it('sets isDragging to true on dragStart and false on dragEnd', () => {
    const { result } = renderHook(() => useDraggable({ nodeId: 'n1' }));
    const event = mockDragEvent();

    act(() => result.current.onDragStart(event));
    expect(result.current.isDragging).toBe(true);
    expect(event.dataTransfer.setData).toHaveBeenCalledWith(EXPRESSION_DRAG_TYPE, 'n1');
    expect(event.dataTransfer.effectAllowed).toBe('move');

    act(() => result.current.onDragEnd(event));
    expect(result.current.isDragging).toBe(false);
  });

  it('prevents drag when canDrag returns false', () => {
    const canDrag = vi.fn(() => false);
    const { result } = renderHook(() => useDraggable({ nodeId: 'n1', canDrag }));
    const event = mockDragEvent();

    act(() => result.current.onDragStart(event));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it('allows drag when canDrag returns true', () => {
    const canDrag = vi.fn(() => true);
    const { result } = renderHook(() => useDraggable({ nodeId: 'n1', canDrag }));
    const event = mockDragEvent();

    act(() => result.current.onDragStart(event));
    expect(result.current.isDragging).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useDroppable
// ---------------------------------------------------------------------------

describe('useDroppable', () => {
  it('returns isDropTarget: false initially', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDroppable({ nodeId: 't1', onDrop }));
    expect(result.current.isDropTarget).toBe(false);
  });

  it('sets dropEffect on dragOver for valid MIME type', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDroppable({ nodeId: 't1', onDrop }));
    const event = mockDragEvent();

    act(() => result.current.onDragOver(event));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.dataTransfer.dropEffect).toBe('move');
  });

  it('ignores dragOver for invalid MIME type', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDroppable({ nodeId: 't1', onDrop }));
    const event = mockDragEvent({ types: ['text/plain'] });

    act(() => result.current.onDragOver(event));
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('handles enter/leave counter pattern correctly', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDroppable({ nodeId: 't1', onDrop }));

    // Enter outer element
    act(() => result.current.onDragEnter(mockDragEvent()));
    expect(result.current.isDropTarget).toBe(true);

    // Enter inner element (nested)
    act(() => result.current.onDragEnter(mockDragEvent()));
    expect(result.current.isDropTarget).toBe(true);

    // Leave inner element — should NOT clear isDropTarget
    act(() => result.current.onDragLeave(mockDragEvent()));
    expect(result.current.isDropTarget).toBe(true);

    // Leave outer element — should clear isDropTarget
    act(() => result.current.onDragLeave(mockDragEvent()));
    expect(result.current.isDropTarget).toBe(false);
  });

  it('calls onDrop with correct IDs on valid drop', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDroppable({ nodeId: 't1', onDrop }));
    const event = mockDragEvent({ data: { [EXPRESSION_DRAG_TYPE]: 'dragged-1' } });

    act(() => result.current.onDrop(event));
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledWith('dragged-1', 't1');
    expect(result.current.isDropTarget).toBe(false);
  });

  it('rejects drop on self', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDroppable({ nodeId: 't1', onDrop }));
    const event = mockDragEvent({ data: { [EXPRESSION_DRAG_TYPE]: 't1' } });

    act(() => result.current.onDrop(event));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('rejects drop when canDrop returns false', () => {
    const onDrop = vi.fn();
    const canDrop = vi.fn(() => false);
    const { result } = renderHook(() => useDroppable({ nodeId: 't1', onDrop, canDrop }));
    const event = mockDragEvent({ data: { [EXPRESSION_DRAG_TYPE]: 'dragged-1' } });

    act(() => result.current.onDrop(event));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('rejects drop with no data', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDroppable({ nodeId: 't1', onDrop }));
    const event = mockDragEvent({ data: {} });

    act(() => result.current.onDrop(event));
    expect(onDrop).not.toHaveBeenCalled();
  });
});
