// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * StudioWorkspace tests — the @codemirror/lsp-client Workspace
 * implementation backing the Source editor's LSP features.
 *
 * Deliberately does NOT mock @codemirror/lsp-client (unlike
 * lsp-client.test.ts) — StudioWorkspace's real logic, extending the real
 * Workspace base class, is what's under test here.
 */

import { describe, it, expect, vi } from 'vitest';
import { Text } from '@codemirror/state';
import type { LSPClient } from '@codemirror/lsp-client';
import type { EditorView } from '@codemirror/view';
import { StudioWorkspace } from '../../src/services/lsp-client.js';

function makeFakeClient() {
  return {
    didOpen: vi.fn(),
    didClose: vi.fn()
  };
}

function makeFakeView(text: string): EditorView {
  return { state: { doc: Text.of(text.split('\n')) } } as unknown as EditorView;
}

describe('StudioWorkspace', () => {
  it('tracks a file on openFile without calling client.didOpen', () => {
    // Document lifecycle is owned solely by LspProvider.tsx's
    // syncWorkspaceFiles — an EditorView mounting must not independently
    // tell the server anything, or it can race syncWorkspaceFiles's own
    // open/close tracking (see the comment above StudioWorkspace's
    // openFile/closeFile in lsp-client.ts).
    const client = makeFakeClient();
    const ws = new StudioWorkspace(client as unknown as LSPClient);
    const view = makeFakeView('namespace a');

    ws.openFile('file:///a.rosetta', 'rosetta', view);

    expect(ws.getFile('file:///a.rosetta')).not.toBeNull();
    expect(client.didOpen).not.toHaveBeenCalled();
  });

  it('untracks a file on closeFile without calling client.didClose', () => {
    const client = makeFakeClient();
    const ws = new StudioWorkspace(client as unknown as LSPClient);
    const view = makeFakeView('namespace a');
    ws.openFile('file:///a.rosetta', 'rosetta', view);

    ws.closeFile('file:///a.rosetta', view);

    expect(ws.getFile('file:///a.rosetta')).toBeNull();
    expect(client.didClose).not.toHaveBeenCalled();
  });

  it('re-opening the same URI (tab switch destroy + recreate) still never calls client.didOpen/didClose', () => {
    const client = makeFakeClient();
    const ws = new StudioWorkspace(client as unknown as LSPClient);
    const view1 = makeFakeView('namespace a');
    ws.openFile('file:///a.rosetta', 'rosetta', view1);

    const view2 = makeFakeView('namespace a');
    ws.openFile('file:///a.rosetta', 'rosetta', view2);

    expect(ws.files).toHaveLength(1);
    expect(ws.getFile('file:///a.rosetta')?.view).toBe(view2);
    expect(client.didOpen).not.toHaveBeenCalled();
    expect(client.didClose).not.toHaveBeenCalled();
  });

  it('closing an unopened URI is a no-op, not an error', () => {
    const client = makeFakeClient();
    const ws = new StudioWorkspace(client as unknown as LSPClient);
    const view = makeFakeView('namespace a');

    expect(() => ws.closeFile('file:///never-opened.rosetta', view)).not.toThrow();
    expect(client.didClose).not.toHaveBeenCalled();
  });
});
