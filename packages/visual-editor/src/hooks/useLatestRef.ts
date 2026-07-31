// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Returns a ref that always holds the latest `value` — the standard escape
 * hatch for reading a fresh value inside a stable callback (e.g. a
 * useCallback/useMemo with an intentionally narrow dependency array, or a
 * timer/observer closure) without re-creating that callback on every change.
 *
 * Syncs via `useLayoutEffect` rather than writing `ref.current = value`
 * directly in the render body: a render-body write leaks into replayed or
 * discarded render work (Strict Mode double-render, Suspense retries,
 * concurrent prerendering), whereas a layout effect only runs after a render
 * actually commits.
 */

import { useLayoutEffect, useRef, type RefObject } from 'react';

export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
