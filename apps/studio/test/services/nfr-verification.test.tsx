// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { FormPreviewSchema } from '@rune-langium/codegen';
import { FormPreviewPanel } from '../../src/components/FormPreviewPanel.js';
import { usePreviewStore } from '../../src/store/preview-store.js';

const previewSchema: FormPreviewSchema = {
  schemaVersion: 1,
  targetId: 'nfr.preview.Trade',
  title: 'NFR Trade',
  status: 'ready',
  fields: [
    { path: 'tradeId', label: 'Trade id', kind: 'string', required: true },
    { path: 'quantity', label: 'Quantity', kind: 'number', required: false },
    {
      path: 'side',
      label: 'Side',
      kind: 'enum',
      required: true,
      enumValues: [
        { value: 'Buy', label: 'Buy' },
        { value: 'Sell', label: 'Sell' }
      ]
    },
    {
      path: 'party',
      label: 'Party',
      kind: 'object',
      required: true,
      children: [{ path: 'party.name', label: 'Name', kind: 'string', required: true }]
    },
    {
      path: 'aliases',
      label: 'Aliases',
      kind: 'array',
      required: true,
      cardinality: { min: 1, max: 2 },
      children: [{ path: 'aliases[]', label: 'Alias', kind: 'string', required: true }]
    }
  ]
};

describe('form preview NFR verification', () => {
  beforeEach(() => {
    usePreviewStore.getState().resetPreviewState();
  });

  it('keeps sample data in-memory and emits no network or storage writes during edit, validate, reset, and copy', async () => {
    const fetchSpy = vi.fn();
    const sendBeaconSpy = vi.fn();
    const xhrOpenSpy = vi.fn();
    const xhrSendSpy = vi.fn();
    const storageSpy = vi.fn();
    const writeText = vi.fn(async () => undefined);

    vi.stubGlobal('fetch', fetchSpy);
    Object.defineProperty(navigator, 'sendBeacon', { value: sendBeaconSpy, configurable: true });
    Object.assign(navigator, { clipboard: { writeText } });
    vi.stubGlobal(
      'XMLHttpRequest',
      class MockXMLHttpRequest {
        open = xhrOpenSpy;
        send = xhrSendSpy;
      } as unknown as typeof XMLHttpRequest
    );
    Storage.prototype.setItem = storageSpy;

    render(
      <FormPreviewPanel
        schema={previewSchema}
        status={{ state: 'ready', targetId: previewSchema.targetId }}
      />
    );

    fireEvent.blur(screen.getByLabelText('Trade id'));
    fireEvent.change(screen.getByLabelText('Trade id'), { target: { value: 'TRD-1' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme' } });
    fireEvent.click(screen.getByRole('button', { name: /add aliases item/i }));
    fireEvent.change(screen.getByLabelText('Alias 1'), { target: { value: 'Desk alias' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy sample data/i }));
    });
    fireEvent.click(screen.getByRole('button', { name: /reset sample/i }));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(xhrOpenSpy).not.toHaveBeenCalled();
    expect(xhrSendSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(usePreviewStore.getState().samples.get(previewSchema.targetId)?.serialized).toBe(
      '{\n  "tradeId": "",\n  "quantity": "",\n  "side": "Buy",\n  "party": {\n    "name": ""\n  },\n  "aliases": []\n}'
    );
  });

  it('keeps summary status visible and updates within the preview latency budget', () => {
    const startedAt = performance.now();

    render(
      <FormPreviewPanel
        schema={previewSchema}
        status={{ state: 'ready', targetId: previewSchema.targetId }}
      />
    );

    expect(screen.getByText(/ready to validate sample/i)).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText('Trade id'));
    fireEvent.blur(screen.getByLabelText('Name'));
    expect(screen.getByText(/invalid sample/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Trade id'), { target: { value: 'TRD-2' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Contoso' } });
    fireEvent.click(screen.getByRole('button', { name: /add aliases item/i }));
    fireEvent.change(screen.getByLabelText('Alias 1'), { target: { value: 'Ops' } });

    expect(screen.getByText(/valid sample/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/sample data output/i)).toHaveTextContent('"tradeId": "TRD-2"');
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });
});
