// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T072 / T073 — ActivityBar + StatusBar.
 * T072 ActivityBar tests migrated to ActivityBar.test.tsx (Task 3 rewrite).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusBar } from '../../src/shell/StatusBar.js';

describe('StatusBar (T073)', () => {
  it('renders workspace name + LSP state', () => {
    render(<StatusBar workspaceName="My Project" lspState="connected" telemetryEnabled onToggleTelemetry={() => {}} />);
    expect(screen.getByTestId('status-workspace').textContent).toBe('⟢ My Project');
    expect(screen.getByTestId('status-lsp').textContent).toContain('connected');
  });

  it('renders git sync state only when supplied', () => {
    const { rerender } = render(<StatusBar workspaceName="W" telemetryEnabled onToggleTelemetry={() => {}} />);
    expect(screen.queryByTestId('status-git')).not.toBeInTheDocument();
    rerender(<StatusBar workspaceName="W" gitState="ahead" telemetryEnabled onToggleTelemetry={() => {}} />);
    expect(screen.getByTestId('status-git').textContent).toMatch(/unpushed/);
  });

  it('telemetry toggle button reflects + flips state', () => {
    const onToggle = vi.fn();
    render(<StatusBar workspaceName="W" telemetryEnabled onToggleTelemetry={onToggle} />);
    const btn = screen.getByRole('button', { name: /telemetry enabled/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
