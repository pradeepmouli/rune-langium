// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * T065 / T076 — DockShell mounts every panel + ARIA roles + reset-layout.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DockShell } from '../../src/shell/DockShell.js';
import { PANEL_COMPONENT_NAMES } from '../../src/shell/layout-factory.js';

describe('DockShell — panel mounting + roles (T065 + T076)', () => {
  it('mounts every panel in the locked registry with the right role', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    for (const name of PANEL_COMPONENT_NAMES) {
      const id = name.replace('workspace.', '');
      expect(screen.getByTestId(`panel-${id}`)).toBeInTheDocument();
    }
  });

  it('exposes a `application` role on the shell container', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    expect(screen.getByRole('application', { name: /studio dock shell/i })).toBeInTheDocument();
  });

  it('every panel exposes role=region with an accessible name', () => {
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" />);
    const regions = screen.getAllByRole('region');
    // Six panels → six regions.
    expect(regions.length).toBe(6);
    // Every region has an aria-label.
    for (const r of regions) {
      expect(r.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('persists layout via onLayoutChange whenever the layout state changes', () => {
    const onChange = vi.fn();
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" onLayoutChange={onChange} />);
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.version).toBe(1);
  });

  it('Reset layout swaps to a fresh default without unmounting panels', () => {
    const onChange = vi.fn();
    render(
      <DockShell
        studioVersion="9.9.9"
        workspaceId="ws-1"
        initialLayout={{ version: 1, writtenBy: '0.0.1', dockview: { foo: 'bar' } }}
        onLayoutChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId('reset-layout'));
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.writtenBy).toBe('9.9.9');
    // Sanity: panels still mounted.
    expect(screen.getByTestId('panel-editor')).toBeInTheDocument();
  });
});

describe('DockShell — keyboard shortcuts (T074 / T075)', () => {
  it('forwards Ctrl+Alt+ArrowRight as focus-next-panel', () => {
    const onAction = vi.fn();
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" onAction={onAction} />);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, altKey: true })
      );
    });
    expect(onAction).toHaveBeenCalledWith('focus-next-panel');
  });

  it('forwards Ctrl+Alt+B as toggle-panel-collapse', () => {
    const onAction = vi.fn();
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" onAction={onAction} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, altKey: true }));
    });
    expect(onAction).toHaveBeenCalledWith('toggle-panel-collapse');
  });

  it('does not match a plain key without modifiers', () => {
    const onAction = vi.fn();
    render(<DockShell studioVersion="0.1.0" workspaceId="ws-1" onAction={onAction} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    });
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('EditorPanel dirty indicator (FR-026)', () => {
  it('renders a dirty marker distinct from the close affordance', async () => {
    const { EditorPanel } = await import('../../src/shell/panels/EditorPanel.js');
    render(<EditorPanel tabs={[{ path: 'foo.rosetta', dirty: true }]} activePath="foo.rosetta" />);
    expect(screen.getByTestId('dirty-foo.rosetta')).toBeInTheDocument();
    expect(screen.getByLabelText(/Close foo\.rosetta/i)).toBeInTheDocument();
    // Distinct elements (not the same node).
    expect(screen.getByTestId('dirty-foo.rosetta')).not.toBe(
      screen.getByLabelText(/Close foo\.rosetta/i)
    );
  });
});
