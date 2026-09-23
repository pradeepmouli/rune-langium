// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InstancePayloadPanel } from '../../src/components/InstancePayloadPanel.js';

describe('InstancePayloadPanel', () => {
  it('renders one JSON value and delegates exporting to its owner', async () => {
    const onExport = vi.fn().mockResolvedValue(undefined);
    render(<InstancePayloadPanel payload={{ kind: 'instance', value: { name: 'Acme' } }} onExport={onExport} />);

    expect(screen.getByTestId('instance-payload-output')).toHaveTextContent('"Acme"');
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(onExport).toHaveBeenCalledOnce());
  });

  it('keeps a failed persistence/export operation visible', async () => {
    render(
      <InstancePayloadPanel
        payload={{ kind: 'instance', value: { name: 'Acme' } }}
        onExport={async () => {
          throw new Error('Instance save failed.');
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Instance save failed.');
  });
});
