// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportDialog } from '../../src/components/ImportDialog.js';
import type { WorkspaceFile } from '../../src/services/workspace.js';

vi.mock('@rune-langium/codegen/import', () => ({
  importModel: vi.fn()
}));
// Full-replacement mocking of '@rune-langium/core' would strip out
// createRuneDslServices/parseWorkspace/etc., which apps/studio/src/services/
// workspace.ts (imported transitively via createWorkspaceFile/updateFileContent)
// calls at module-load time — breaking the whole import graph, not just this
// test. Use the importOriginal + spread pattern already established in
// apps/studio/test/services/workspace-fallback-filter.test.ts so only `parse`
// is overridden.
vi.mock('@rune-langium/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rune-langium/core')>();
  return {
    ...actual,
    parse: vi.fn()
  };
});
vi.mock('../../src/shell/import-merge.js', () => ({
  mergeImportedText: vi.fn()
}));

import { importModel } from '@rune-langium/codegen/import';
import { parse } from '@rune-langium/core';
import { mergeImportedText } from '../../src/shell/import-merge.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function baseProps(overrides: Partial<React.ComponentProps<typeof ImportDialog>> = {}) {
  return {
    open: true,
    onClose: vi.fn(),
    files: [] as WorkspaceFile[],
    onFilesChange: vi.fn(),
    onFileFocused: vi.fn(),
    namespaceToFile: new Map<string, string>(),
    ...overrides
  };
}

describe('ImportDialog', () => {
  it('previews a new-file import and enables "Add to workspace"', async () => {
    (importModel as any).mockResolvedValue({
      text: 'namespace demo\nversion "0.0.0"\n\ntype Foo:\n  bar string (1..1)\n',
      model: { namespace: 'demo', types: [{ name: 'Foo' }], enums: [], funcs: [] },
      diagnostics: []
    });
    (parse as any).mockResolvedValue({ hasErrors: false });

    const props = baseProps();
    render(<ImportDialog {...props} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() => expect(screen.getByTestId('import-dialog__confirm')).not.toBeDisabled());
    expect(screen.getByTestId('import-dialog__confirm')).toHaveTextContent('Add to workspace');

    fireEvent.click(screen.getByTestId('import-dialog__confirm'));
    expect(props.onFilesChange).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'demo.rosetta', content: expect.stringContaining('type Foo') })
    ]);
    expect(props.onFileFocused).toHaveBeenCalledWith('demo.rosetta');
    expect(props.onClose).toHaveBeenCalled();
  });

  it('previews a namespace match and offers "Merge into <path>"', async () => {
    (importModel as any).mockResolvedValue({
      text: 'namespace demo\nversion "0.0.0"\n\ntype Foo:\n  bar string (1..1)\n',
      model: { namespace: 'demo', types: [{ name: 'Foo' }], enums: [], funcs: [] },
      diagnostics: []
    });
    (mergeImportedText as any).mockResolvedValue({ mergedText: 'MERGED', skipped: ['Existing'] });

    const files: WorkspaceFile[] = [{ name: 'demo.rosetta', path: 'demo.rosetta', content: 'ORIGINAL', dirty: false }];
    const props = baseProps({ files, namespaceToFile: new Map([['demo', 'demo.rosetta']]) });
    render(<ImportDialog {...props} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() =>
      expect(screen.getByTestId('import-dialog__confirm')).toHaveTextContent('Merge into demo.rosetta')
    );
    expect(screen.getByTestId('import-dialog__merge-banner')).toHaveTextContent('1 declaration(s) skipped');

    fireEvent.click(screen.getByTestId('import-dialog__confirm'));
    expect(props.onFilesChange).toHaveBeenCalledWith([
      expect.objectContaining({ path: 'demo.rosetta', content: 'MERGED', dirty: true })
    ]);
    expect(props.onFileFocused).toHaveBeenCalledWith('demo.rosetta');
  });

  it('shows a user-facing error when the reader throws', async () => {
    (importModel as any).mockRejectedValue(new Error('malformed JSON'));
    render(<ImportDialog {...baseProps()} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: 'not json' } });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() => expect(screen.getByTestId('import-dialog__error')).toHaveTextContent('malformed JSON'));
    expect(screen.getByTestId('import-dialog__confirm')).toBeDisabled();
  });

  it('shows an internal-error state when the new-file hard-invariant re-parse fails', async () => {
    (importModel as any).mockResolvedValue({
      text: 'namespace demo\nversion "0.0.0"\n\ntype Foo:\n  bar string (1..1)\n',
      model: { namespace: 'demo', types: [{ name: 'Foo' }], enums: [], funcs: [] },
      diagnostics: []
    });
    (parse as any).mockResolvedValue({ hasErrors: true });

    render(<ImportDialog {...baseProps()} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() => expect(screen.getByTestId('import-dialog__internal-error')).toBeInTheDocument());
    expect(screen.getByTestId('import-dialog__confirm')).toBeDisabled();
  });

  it('shows an internal-error state (not a user-facing error) when mergeImportedText fails', async () => {
    (importModel as any).mockResolvedValue({
      text: 'namespace demo\nversion "0.0.0"\n\ntype Foo:\n  bar string (1..1)\n',
      model: { namespace: 'demo', types: [{ name: 'Foo' }], enums: [], funcs: [] },
      diagnostics: []
    });
    (mergeImportedText as any).mockRejectedValue(new Error('mergeImportedText: merged output failed to re-parse.'));

    const files: WorkspaceFile[] = [{ name: 'demo.rosetta', path: 'demo.rosetta', content: 'ORIGINAL', dirty: false }];
    const props = baseProps({ files, namespaceToFile: new Map([['demo', 'demo.rosetta']]) });
    render(<ImportDialog {...props} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() =>
      expect(screen.getByTestId('import-dialog__internal-error')).toHaveTextContent(
        'mergeImportedText: merged output failed to re-parse.'
      )
    );
    expect(screen.queryByTestId('import-dialog__error')).not.toBeInTheDocument();
    expect(screen.getByTestId('import-dialog__confirm')).toBeDisabled();
  });

  it('disables confirm and shows the empty-state alert when there is nothing to import', async () => {
    (importModel as any).mockResolvedValue({
      text: 'namespace demo\nversion "0.0.0"\n',
      model: { namespace: 'demo', types: [], enums: [], funcs: [] },
      diagnostics: []
    });
    (parse as any).mockResolvedValue({ hasErrors: false });

    render(<ImportDialog {...baseProps()} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Preview'));

    await waitFor(() => expect(screen.getByTestId('import-dialog__empty')).toBeInTheDocument());
    expect(screen.getByTestId('import-dialog__confirm')).toBeDisabled();
  });

  it('resets the preview when the format is switched', async () => {
    (importModel as any).mockResolvedValue({
      text: 'namespace demo\nversion "0.0.0"\n',
      model: { namespace: 'demo', types: [{ name: 'Foo' }], enums: [], funcs: [] },
      diagnostics: []
    });
    (parse as any).mockResolvedValue({ hasErrors: false });

    render(<ImportDialog {...baseProps()} />);
    fireEvent.change(screen.getByTestId('import-dialog__source'), { target: { value: '{}' } });
    fireEvent.click(screen.getByText('Preview'));
    await waitFor(() => expect(screen.getByTestId('import-dialog__confirm')).not.toBeDisabled());

    const user = userEvent.setup({ writeToClipboard: false });
    await user.click(screen.getByRole('combobox', { name: 'Format:' }));
    await user.click(await screen.findByRole('option', { name: 'OpenAPI' }));

    expect(screen.getByTestId('import-dialog__confirm')).toBeDisabled();
    expect(screen.queryByTestId('import-dialog__preview')).not.toBeInTheDocument();
  });
});
