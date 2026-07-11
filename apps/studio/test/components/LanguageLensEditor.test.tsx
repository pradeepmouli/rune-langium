// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LanguageLensEditor } from '../../src/components/LanguageLensEditor.js';

// Real WASM fetch is exercised by ts-wasm-asset.test.ts (Step 1 of this
// task) and by parse-ts.test.ts's Node-path tests (Task 3) — this
// component test only needs SOME bytes to reach parseTs, not a real
// network fetch, so it stubs the asset fetcher deterministically.
vi.mock('../../src/lens/ts-wasm-asset.js', () => ({
  getTsWasmBytes: vi.fn(async () => {
    const { readFileSync } = await import('node:fs');
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const pkgJsonPath = require.resolve('@vscode/tree-sitter-wasm/package.json');
    return new Uint8Array(readFileSync(pkgJsonPath.replace(/package\.json$/, 'wasm/tree-sitter-typescript.wasm')));
  })
}));

describe('LanguageLensEditor', () => {
  it('defaults to the Rune view', () => {
    render(<LanguageLensEditor value="value >= 0" onChange={vi.fn()} onBlur={vi.fn()} />);
    expect(screen.getByText('value >= 0')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /typescript/i })).toBeInTheDocument();
  });

  it('projects to TypeScript on toggle', async () => {
    render(<LanguageLensEditor value="currency exists" onChange={vi.fn()} onBlur={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /typescript/i }));
    await waitFor(() => expect(screen.getByText('currency != null')).toBeInTheDocument());
  });

  it('commits a valid TS edit back as canonical Rune text via onChange', async () => {
    const onChange = vi.fn();
    render(<LanguageLensEditor value="value >= 0" onChange={onChange} onBlur={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /typescript/i }));
    await waitFor(() => screen.getByText('value >= 0'));

    const editor = screen.getByRole('textbox', { name: /typescript expression/i });
    fireEvent.input(editor, { target: { textContent: 'value > 0' } });
    fireEvent.blur(editor);

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('value > 0'));
  });

  it('blocks commit and shows an inline error for out-of-subset TS', async () => {
    const onChange = vi.fn();
    render(<LanguageLensEditor value="value >= 0" onChange={onChange} onBlur={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /typescript/i }));
    await waitFor(() => screen.getByText('value >= 0'));

    const editor = screen.getByRole('textbox', { name: /typescript expression/i });
    fireEvent.input(editor, { target: { textContent: 'value.toFixed(2)' } });
    fireEvent.blur(editor);

    await waitFor(() => expect(screen.getByText(/not supported/i)).toBeInTheDocument());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows read-only Rune with a notice for expressions outside S, never a TS toggle result', () => {
    // 'items count' is outside S (RosettaCountOperation) — renderTs returns null.
    render(<LanguageLensEditor value="items count" onChange={vi.fn()} onBlur={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /typescript/i }));
    expect(screen.getByText(/can.t be shown in typescript/i)).toBeInTheDocument();
    expect(screen.getByText('items count')).toBeInTheDocument();
  });
});
