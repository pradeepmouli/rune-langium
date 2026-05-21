// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Tests for DownloadConfigModal (spec 2026-05-14 §5.1 / §5.2).
 *
 * Two layers:
 *   1. `computeNamespaceSelection` — the pure cascade math, exercised
 *      directly with no React.
 *   2. The component — default selection, layout choice, dependency cascade
 *      UI behavior, and the [Generate] payload.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  DownloadConfigModal,
  computeNamespaceSelection,
  type DownloadConfig
} from '../../src/components/DownloadConfigModal.js';

afterEach(() => cleanup());

describe('computeNamespaceSelection', () => {
  it('emits each selected namespace itself even when absent from the graph', () => {
    const result = computeNamespaceSelection(new Set(['a', 'b']), {});
    expect([...result.emitted].sort()).toEqual(['a', 'b']);
    expect(result.pulled.size).toBe(0);
  });

  it('pulls transitive deps and records provenance', () => {
    // app → [app, cdm, base]; cdm → [cdm, base]; base → [base]
    const graph = {
      app: ['app', 'cdm', 'base'],
      cdm: ['cdm', 'base'],
      base: ['base']
    };
    const result = computeNamespaceSelection(new Set(['app']), graph);
    expect([...result.emitted].sort()).toEqual(['app', 'base', 'cdm']);
    expect([...result.pulled].sort()).toEqual(['base', 'cdm']);
    expect(result.pulledBy.get('cdm')).toEqual(['app']);
    expect(result.pulledBy.get('base')).toEqual(['app']);
  });

  it('does not mark a namespace as pulled when it is also explicitly selected', () => {
    const graph = { app: ['app', 'cdm'], cdm: ['cdm'] };
    const result = computeNamespaceSelection(new Set(['app', 'cdm']), graph);
    expect(result.pulled.size).toBe(0);
    expect([...result.emitted].sort()).toEqual(['app', 'cdm']);
  });

  it('aggregates provenance when multiple selected namespaces pull the same dep', () => {
    const graph = {
      trade: ['trade', 'datetime'],
      product: ['product', 'datetime'],
      datetime: ['datetime']
    };
    const result = computeNamespaceSelection(new Set(['trade', 'product']), graph);
    expect(result.pulledBy.get('datetime')).toEqual(['product', 'trade']);
  });

  it('absorbs cycles via the precomputed closure', () => {
    // a ↔ b cycle: server already closed each to include both.
    const graph = { a: ['a', 'b'], b: ['b', 'a'] };
    const result = computeNamespaceSelection(new Set(['a']), graph);
    expect([...result.emitted].sort()).toEqual(['a', 'b']);
    expect([...result.pulled]).toEqual(['b']);
  });
});

const NS = ['app', 'cdm', 'base'];
// Fully transitive closures, as /api/parse's closeNamespaceDependencies
// produces them: app → cdm → base, so app's closure includes base too.
const GRAPH = { app: ['app', 'cdm', 'base'], cdm: ['cdm', 'base'], base: ['base'] };

function renderModal(overrides: Partial<React.ComponentProps<typeof DownloadConfigModal>> = {}) {
  const onGenerate = vi.fn();
  const onClose = vi.fn();
  render(
    <DownloadConfigModal
      open
      target="zod"
      namespaces={NS}
      dependencyGraph={GRAPH}
      onClose={onClose}
      onGenerate={onGenerate}
      {...overrides}
    />
  );
  return { onGenerate, onClose };
}

describe('DownloadConfigModal', () => {
  it('renders the target label in the title', () => {
    renderModal();
    expect(screen.getByText('Generate Zod')).toBeTruthy();
  });

  it('renders layout choices for a layout-aware target', () => {
    renderModal({ target: 'zod' });
    expect(screen.getByTestId('download-config-modal__layout-per-namespace')).toBeTruthy();
    expect(screen.getByTestId('download-config-modal__layout-barrel')).toBeTruthy();
    expect(screen.getByTestId('download-config-modal__layout-single-file')).toBeTruthy();
  });

  it('defaults to all namespaces selected', () => {
    renderModal();
    for (const ns of NS) {
      const row = screen.getByTestId(`download-config-modal__ns-row-${ns}`);
      expect(row.getAttribute('data-state')).toBe('selected');
    }
  });

  it('emits the full namespace set + default layout on Generate', () => {
    const { onGenerate } = renderModal({ target: 'zod' });
    fireEvent.click(screen.getByTestId('download-config-modal__generate'));
    expect(onGenerate).toHaveBeenCalledTimes(1);
    const config = onGenerate.mock.calls[0][0] as DownloadConfig;
    expect(config.target).toBe('zod');
    expect(config.layout).toBe('barrel'); // zod's opinionated download default
    expect(config.namespaces.sort()).toEqual(['app', 'base', 'cdm']);
  });

  it('marks transitively-pulled namespaces as read-only when a puller stays selected', () => {
    renderModal();
    // Deselect cdm and base so only app's pull keeps cdm in; cdm in turn
    // keeps base. Both should flip to "pulled" (auto, read-only).
    fireEvent.click(screen.getByTestId('download-config-modal__ns-cdm'));
    fireEvent.click(screen.getByTestId('download-config-modal__ns-base'));
    const cdmRow = screen.getByTestId('download-config-modal__ns-row-cdm');
    const baseRow = screen.getByTestId('download-config-modal__ns-row-base');
    expect(cdmRow.getAttribute('data-state')).toBe('pulled');
    expect(baseRow.getAttribute('data-state')).toBe('pulled');
    // The pulled checkboxes are disabled — can't deselect a dependency directly.
    expect((screen.getByTestId('download-config-modal__ns-cdm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('drops dependencies from the emit set once their only puller is deselected', () => {
    renderModal();
    // cdm + base start selected. Deselect them → they flip to pulled (app
    // still pulls them). Then deselect app → nothing pulls them anymore, so
    // all three rows fall back to unselected.
    fireEvent.click(screen.getByTestId('download-config-modal__ns-cdm'));
    fireEvent.click(screen.getByTestId('download-config-modal__ns-base'));
    expect(screen.getByTestId('download-config-modal__ns-row-cdm').getAttribute('data-state')).toBe('pulled');
    fireEvent.click(screen.getByTestId('download-config-modal__ns-app'));
    for (const ns of NS) {
      expect(screen.getByTestId(`download-config-modal__ns-row-${ns}`).getAttribute('data-state')).toBe(
        'unselected'
      );
    }
  });

  it('disables Generate when the emit set is empty', () => {
    renderModal();
    for (const ns of NS) {
      const box = screen.getByTestId(`download-config-modal__ns-${ns}`) as HTMLButtonElement;
      if (!box.disabled) fireEvent.click(box);
    }
    expect((screen.getByTestId('download-config-modal__generate') as HTMLButtonElement).disabled).toBe(true);
  });

  it('omits the layout section for a target with no layout choices', () => {
    // graphql is whole-model with no TARGET_PANELS entry → no layout block.
    renderModal({ target: 'graphql' });
    expect(screen.queryByTestId('download-config-modal__layout')).toBeNull();
  });
});
