// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Unit tests for navigation history stack logic.
 *
 * The navigation history is implemented as a simple array-based stack
 * (push/pop) used via useRef in EditorPage. This test validates the
 * stack behavior pattern independently.
 *
 * Covers:
 * - Push/pop behavior
 * - Empty stack returns undefined on pop
 * - History preserves order (LIFO)
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal stack implementation matching the pattern used in EditorPage
// ---------------------------------------------------------------------------

/** A simple LIFO stack for navigation history entries. */
class NavigationHistory<T> {
  private stack: T[] = [];

  push(entry: T): void {
    this.stack.push(entry);
  }

  pop(): T | undefined {
    return this.stack.pop();
  }

  get length(): number {
    return this.stack.length;
  }

  isEmpty(): boolean {
    return this.stack.length === 0;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NavigationHistory', () => {
  it('starts empty', () => {
    const history = new NavigationHistory<string>();
    expect(history.length).toBe(0);
    expect(history.isEmpty()).toBe(true);
  });

  it('returns undefined when popping from empty stack', () => {
    const history = new NavigationHistory<string>();
    expect(history.pop()).toBeUndefined();
  });

  it('pushes and pops a single entry', () => {
    const history = new NavigationHistory<string>();
    history.push('cdm.base.math::Quantity');
    expect(history.length).toBe(1);

    const popped = history.pop();
    expect(popped).toBe('cdm.base.math::Quantity');
    expect(history.length).toBe(0);
  });

  it('preserves LIFO order', () => {
    const history = new NavigationHistory<string>();
    history.push('node-A');
    history.push('node-B');
    history.push('node-C');

    expect(history.pop()).toBe('node-C');
    expect(history.pop()).toBe('node-B');
    expect(history.pop()).toBe('node-A');
    expect(history.pop()).toBeUndefined();
  });

  it('handles interleaved push/pop', () => {
    const history = new NavigationHistory<string>();
    history.push('first');
    history.push('second');
    expect(history.pop()).toBe('second');

    history.push('third');
    expect(history.pop()).toBe('third');
    expect(history.pop()).toBe('first');
    expect(history.isEmpty()).toBe(true);
  });

  it('works with object entries (nodeId + viewport)', () => {
    interface NavEntry {
      nodeId: string;
      viewport: { x: number; y: number; zoom: number };
    }

    const history = new NavigationHistory<NavEntry>();
    const entry1: NavEntry = {
      nodeId: 'cdm.base.math::Quantity',
      viewport: { x: 100, y: 200, zoom: 1.5 }
    };
    const entry2: NavEntry = {
      nodeId: 'cdm.product::Trade',
      viewport: { x: 300, y: 400, zoom: 1.0 }
    };

    history.push(entry1);
    history.push(entry2);

    expect(history.pop()).toEqual(entry2);
    expect(history.pop()).toEqual(entry1);
  });
});
