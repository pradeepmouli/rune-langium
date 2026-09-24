// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useOutputStore } from '../../../src/store/output-store.js';
import { OutputPanel } from '../../../src/shell/panels/OutputPanel.js';
import { UtilityHeaderActionsProvider } from '../../../src/shell/utility-header-actions-context.js';

afterEach(() => useOutputStore.setState({ lines: [] }));

describe('OutputPanel', () => {
  it('shows local diagnostic metadata when hovering an output line', () => {
    useOutputStore.getState().addLine('[preview] Validation failed', 'error', {
      op: 'preview',
      subject: 'local type',
      durationMs: 8.4,
      signature: 'Error:def456',
      opId: 9
    });
    render(
      <UtilityHeaderActionsProvider>
        <OutputPanel />
      </UtilityHeaderActionsProvider>
    );

    const tooltip = screen.getByText('✗ [preview] Validation failed').getAttribute('title');
    expect(tooltip).toContain('Message: [preview] Validation failed');
    expect(tooltip).toContain('Subject: local type');
    expect(tooltip).toContain('Duration: 8 ms');
    expect(tooltip).toContain('Signature: Error:def456');
    expect(tooltip).toContain('Correlation ID: 9');
  });
});
