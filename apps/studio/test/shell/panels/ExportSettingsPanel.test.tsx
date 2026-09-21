// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ExportSettingsPanel } from '../../../src/shell/panels/ExportSettingsPanel.js';

const config = {
  target: 'typescript' as const,
  selection: { namespaces: [], declarations: [{ namespace: 'test', name: 'Party', kind: 'Data' }] },
  options: { typescript: { layout: 'barrel' } }
};

it('keeps target-specific layout settings and generates only with selected roots', async () => {
  const onChange = vi.fn();
  const onGenerate = vi.fn();
  render(<ExportSettingsPanel config={config} onChange={onChange} onGenerate={onGenerate} generating={false} />);

  await userEvent.selectOptions(screen.getByLabelText('Export layout'), 'single-file');
  expect(onChange).toHaveBeenLastCalledWith({
    ...config,
    options: { typescript: { layout: 'single-file' } }
  });
  await userEvent.click(screen.getByRole('button', { name: 'Generate 1 selected' }));
  expect(onGenerate).toHaveBeenCalledOnce();
});

it('disables generation until the explorer supplies an export root', () => {
  render(
    <ExportSettingsPanel
      config={{ ...config, selection: { namespaces: [], declarations: [] } }}
      onChange={vi.fn()}
      onGenerate={vi.fn()}
      generating={false}
    />
  );
  expect(screen.getByRole('button', { name: 'Generate 0 selected' })).toBeDisabled();
});
