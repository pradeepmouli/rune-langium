// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Component tests for CodegenTargetsTable (018 Phase 0 Task 0.7).
 *
 * The table is pure props — no zustand mocks needed. Each test verifies a
 * single behavior so a future regression points squarely at the broken
 * piece.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TARGET_DESCRIPTORS, type Target } from '@rune-langium/codegen';
import { CodegenTargetsTable } from '../../src/components/CodegenTargetsTable.js';

afterEach(() => cleanup());

const NAMESPACE_TARGETS = (Object.keys(TARGET_DESCRIPTORS) as Target[]).filter(
  (t) => TARGET_DESCRIPTORS[t].contract === 'namespace'
);
const WHOLE_MODEL_TARGETS = (Object.keys(TARGET_DESCRIPTORS) as Target[]).filter(
  (t) => TARGET_DESCRIPTORS[t].contract === 'whole-model'
);

describe('CodegenTargetsTable', () => {
  it('renders one row per target with its label and description', () => {
    render(<CodegenTargetsTable onView={vi.fn()} onDownload={vi.fn()} />);
    for (const target of Object.keys(TARGET_DESCRIPTORS) as Target[]) {
      const row = screen.getByTestId(`codegen-targets-table__row-${target}`);
      expect(row).toBeTruthy();
      const descriptor = TARGET_DESCRIPTORS[target];
      expect(row.textContent).toContain(descriptor.label);
      expect(row.textContent).toContain(descriptor.desc);
    }
  });

  it('shows [View] + [Download] for namespace-contract targets', () => {
    render(<CodegenTargetsTable onView={vi.fn()} onDownload={vi.fn()} />);
    for (const target of NAMESPACE_TARGETS) {
      expect(screen.getByTestId(`codegen-targets-table__view-${target}`)).toBeTruthy();
      expect(screen.getByTestId(`codegen-targets-table__download-${target}`)).toBeTruthy();
    }
  });

  it('shows [Download] only (no [View]) for whole-model targets', () => {
    render(<CodegenTargetsTable onView={vi.fn()} onDownload={vi.fn()} />);
    for (const target of WHOLE_MODEL_TARGETS) {
      expect(screen.queryByTestId(`codegen-targets-table__view-${target}`)).toBeNull();
      expect(screen.getByTestId(`codegen-targets-table__download-${target}`)).toBeTruthy();
    }
  });

  it('invokes onView with the target id when [View] is clicked', () => {
    const onView = vi.fn();
    render(<CodegenTargetsTable onView={onView} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-zod'));
    expect(onView).toHaveBeenCalledWith('zod');
  });

  it('invokes onDownload with the target id when [Download] is clicked', () => {
    const onDownload = vi.fn();
    render(<CodegenTargetsTable onView={vi.fn()} onDownload={onDownload} />);
    fireEvent.click(screen.getByTestId('codegen-targets-table__download-excel'));
    expect(onDownload).toHaveBeenCalledWith('excel');
  });

  it("replaces a row's buttons with a spinner when inflightTarget matches", () => {
    render(<CodegenTargetsTable onView={vi.fn()} onDownload={vi.fn()} inflightTarget="typescript" />);
    expect(screen.getByTestId('codegen-targets-table__spinner-typescript')).toBeTruthy();
    expect(screen.queryByTestId('codegen-targets-table__view-typescript')).toBeNull();
    expect(screen.queryByTestId('codegen-targets-table__download-typescript')).toBeNull();
  });

  it('only shows the spinner on the in-flight row; other rows remain interactive', () => {
    const onView = vi.fn();
    render(<CodegenTargetsTable onView={onView} onDownload={vi.fn()} inflightTarget="zod" />);
    // zod's spinner shown
    expect(screen.getByTestId('codegen-targets-table__spinner-zod')).toBeTruthy();
    // typescript's row is untouched
    fireEvent.click(screen.getByTestId('codegen-targets-table__view-typescript'));
    expect(onView).toHaveBeenCalledWith('typescript');
  });
});
