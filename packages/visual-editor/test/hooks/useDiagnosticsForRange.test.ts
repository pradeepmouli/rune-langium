// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for useDiagnosticsForRange hook (spec 020 §3.4).
 *
 * The hook is a pure computation wrapped in useMemo — we test it via
 * renderHook so the test is idiomatic for hooks but the logic is pure.
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDiagnosticsForRange } from '../../src/hooks/useDiagnosticsForRange.js';
import type { RangeDiagnostic } from '../../src/hooks/useDiagnosticsForRange.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const error: RangeDiagnostic = { start: 10, end: 20, severity: 1, message: 'type not found' };
const warn: RangeDiagnostic = { start: 10, end: 20, severity: 2, message: 'deprecated' };
const info: RangeDiagnostic = { start: 10, end: 20, severity: 3, message: 'hint' };
const hint: RangeDiagnostic = { start: 10, end: 20, severity: 4, message: 'style' };

// ---------------------------------------------------------------------------
// Core overlap tests
// ---------------------------------------------------------------------------

describe('useDiagnosticsForRange', () => {
  it('returns undefined when astRange is undefined', () => {
    const { result } = renderHook(() => useDiagnosticsForRange(undefined, [error]));
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when diagnostics array is empty', () => {
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 5, end: 15 }, []));
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when astRange is zero-length', () => {
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 10, end: 10 }, [error]));
    expect(result.current).toBeUndefined();
  });

  it('returns the overlapping diagnostic when ranges overlap', () => {
    // astRange [5, 15) overlaps error [10, 20)
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 5, end: 15 }, [error]));
    expect(result.current).toBe(error);
  });

  it('returns undefined when diagnostic is entirely before astRange', () => {
    // diag [0, 5) does not overlap [10, 20)
    const before: RangeDiagnostic = { start: 0, end: 5, severity: 1, message: 'before' };
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 10, end: 20 }, [before]));
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when diagnostic is entirely after astRange', () => {
    // diag [25, 35) does not overlap [10, 20)
    const after: RangeDiagnostic = { start: 25, end: 35, severity: 1, message: 'after' };
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 10, end: 20 }, [after]));
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when diagnostic end equals astRange start (adjacent, no overlap)', () => {
    // diag [0, 10) is adjacent to [10, 20) — half-open intervals do NOT overlap
    const adjacent: RangeDiagnostic = { start: 0, end: 10, severity: 1, message: 'adjacent' };
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 10, end: 20 }, [adjacent]));
    expect(result.current).toBeUndefined();
  });

  it('returns undefined when diagnostic start equals astRange end (adjacent, no overlap)', () => {
    // diag [20, 30) is adjacent to [10, 20)
    const adjacent: RangeDiagnostic = { start: 20, end: 30, severity: 1, message: 'adjacent' };
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 10, end: 20 }, [adjacent]));
    expect(result.current).toBeUndefined();
  });

  it('returns the diagnostic when it is fully contained within astRange', () => {
    // diag [12, 15) is inside [10, 20)
    const inner: RangeDiagnostic = { start: 12, end: 15, severity: 2, message: 'inner' };
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 10, end: 20 }, [inner]));
    expect(result.current).toBe(inner);
  });

  it('returns the diagnostic when astRange is fully contained within it', () => {
    // diag [5, 25) contains [10, 20)
    const outer: RangeDiagnostic = { start: 5, end: 25, severity: 2, message: 'outer' };
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 10, end: 20 }, [outer]));
    expect(result.current).toBe(outer);
  });
});

// ---------------------------------------------------------------------------
// Severity ranking
// ---------------------------------------------------------------------------

describe('useDiagnosticsForRange — severity ranking', () => {
  it('returns the error (severity 1) over a warning when both overlap', () => {
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 5, end: 25 }, [warn, error]));
    expect(result.current).toBe(error);
  });

  it('returns the error when listed after the warning', () => {
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 5, end: 25 }, [error, warn]));
    expect(result.current).toBe(error);
  });

  it('returns the warning over info', () => {
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 5, end: 25 }, [info, warn]));
    expect(result.current).toBe(warn);
  });

  it('returns the info over hint', () => {
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 5, end: 25 }, [hint, info]));
    expect(result.current).toBe(info);
  });

  it('returns the single overlapping diagnostic even when a higher-severity one misses', () => {
    // error at [100, 200) misses [10, 20); warn at [5, 15) overlaps
    const missedError: RangeDiagnostic = { start: 100, end: 200, severity: 1, message: 'far away' };
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 10, end: 20 }, [missedError, warn]));
    expect(result.current).toBe(warn);
  });

  it('returns undefined when no diagnostic overlaps, even if many are present', () => {
    const far1: RangeDiagnostic = { start: 100, end: 200, severity: 1, message: 'far1' };
    const far2: RangeDiagnostic = { start: 300, end: 400, severity: 2, message: 'far2' };
    const { result } = renderHook(() => useDiagnosticsForRange({ start: 10, end: 20 }, [far1, far2]));
    expect(result.current).toBeUndefined();
  });
});
