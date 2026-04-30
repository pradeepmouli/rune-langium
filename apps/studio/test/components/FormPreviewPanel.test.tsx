// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { FormPreviewSchema } from '@rune-langium/codegen';
import { FormPreviewPanel } from '../../src/components/FormPreviewPanel.js';
import { usePreviewStore } from '../../src/store/preview-store.js';

const tradeSchema: FormPreviewSchema = {
  schemaVersion: 1,
  targetId: 'test.preview.Trade',
  title: 'Trade',
  status: 'ready',
  fields: [
    { path: 'id', label: 'id', kind: 'string', required: true },
    {
      path: 'side',
      label: 'side',
      kind: 'enum',
      required: true,
      enumValues: [
        { value: 'Buy', label: 'Buy side' },
        { value: 'Sell', label: 'Sell' }
      ]
    },
    {
      path: 'party',
      label: 'party',
      kind: 'object',
      required: true,
      children: [
        {
          path: 'party.name',
          label: 'name',
          kind: 'string',
          required: true,
          description: 'Legal entity name'
        }
      ]
    },
    {
      path: 'tags',
      label: 'tags',
      kind: 'array',
      required: false,
      cardinality: { min: 0, max: 'unbounded' },
      children: [{ path: 'tags[]', label: 'tags item', kind: 'string', required: true }]
    }
  ],
  sourceMap: [
    {
      fieldPath: 'party.name',
      sourceUri: 'file:///workspace/preview.rosetta',
      sourceLine: 12,
      sourceChar: 5
    }
  ]
};

const unsupportedTradeSchema: FormPreviewSchema = {
  ...tradeSchema,
  status: 'unsupported',
  unsupportedFeatures: ['exported-subschema:PartyDefaults'],
  fields: [
    ...tradeSchema.fields,
    {
      path: 'counterparty',
      label: 'counterparty',
      kind: 'object',
      required: true,
      description: 'Mapped via exported subschema defaults',
      children: [
        {
          path: 'counterparty.legalName',
          label: 'Legal name',
          kind: 'string',
          required: true,
          description: 'Uses PartyDefaults.name component mapping'
        }
      ]
    }
  ]
};

const validationTradeSchema: FormPreviewSchema = {
  schemaVersion: 1,
  targetId: 'test.preview.ValidatedTrade',
  title: 'Validated Trade',
  status: 'ready',
  fields: [
    { path: 'tradeId', label: 'Trade id', kind: 'string', required: true },
    {
      path: 'party',
      label: 'Counterparty',
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

const optionalSectionSchema: FormPreviewSchema = {
  schemaVersion: 1,
  targetId: 'test.preview.OptionalTrade',
  title: 'Optional Trade',
  status: 'ready',
  fields: [
    { path: 'tradeId', label: 'Trade id', kind: 'string', required: true },
    {
      path: 'counterparty',
      label: 'Counterparty',
      kind: 'object',
      required: false,
      children: [{ path: 'counterparty.name', label: 'Name', kind: 'string', required: true }]
    }
  ]
};

const numericSchema: FormPreviewSchema = {
  schemaVersion: 1,
  targetId: 'test.preview.NumericTrade',
  title: 'Numeric Trade',
  status: 'ready',
  fields: [{ path: 'quantity', label: 'Quantity', kind: 'number', required: false }]
};

describe('FormPreviewPanel', () => {
  beforeEach(() => {
    usePreviewStore.getState().resetPreviewState();
    Object.assign(navigator, {
      clipboard: {
        writeText: async () => undefined
      }
    });
  });

  it('shows a no-selection state when no schema is available', () => {
    render(<FormPreviewPanel schema={undefined} status={{ state: 'waiting' }} />);

    expect(screen.getByRole('region', { name: /form preview/i })).toBeInTheDocument();
    expect(
      screen.getByText(/select a type from the graph, file tree, or source editor/i)
    ).toBeInTheDocument();
  });

  it('shows a waiting state when generation is in progress for a selected type', () => {
    render(
      <FormPreviewPanel
        schema={undefined}
        status={{ state: 'waiting', targetId: tradeSchema.targetId }}
      />
    );

    expect(screen.getByText(/generating preview for the selected type/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/select a type from the graph, file tree, or source editor/i)
    ).not.toBeInTheDocument();
  });

  it('shows an unavailable state when no preview can be generated yet', () => {
    render(
      <FormPreviewPanel
        schema={undefined}
        status={{
          state: 'unavailable',
          targetId: tradeSchema.targetId,
          reason: 'generation-error',
          message: 'Preview generation failed'
        }}
      />
    );

    expect(screen.getByText(/preview generation failed/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/preview generation failed/i);
  });

  it('renders scalar, enum, nested object, and array controls from the preview schema', () => {
    render(
      <FormPreviewPanel
        schema={tradeSchema}
        status={{ state: 'ready', targetId: tradeSchema.targetId }}
      />
    );

    expect(screen.getByRole('heading', { name: 'Trade' })).toBeInTheDocument();
    expect(screen.getByLabelText('id')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('side')).toHaveDisplayValue('Buy side');
    expect(screen.getByLabelText('name')).toHaveAttribute('type', 'text');
    expect(screen.getByText('tags')).toBeInTheDocument();
    expect(screen.getByText(/optional/i)).toBeInTheDocument();
    expect(screen.getByText(/repeatable \(0\.\.\*\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add tags item/i })).toBeInTheDocument();
    expect(screen.getByText(/ready to validate sample/i)).toBeInTheDocument();
  });

  it('shows unsupported preview messaging without presenting the sample as valid', () => {
    render(
      <FormPreviewPanel
        schema={unsupportedTradeSchema}
        status={{ state: 'ready', targetId: unsupportedTradeSchema.targetId }}
      />
    );

    expect(screen.getByText(/unsupported preview features/i)).toBeInTheDocument();
    expect(screen.getByText(/exported-subschema:PartyDefaults/i)).toBeInTheDocument();
    expect(screen.getByText('Legal name')).toBeInTheDocument();
    expect(screen.queryByText(/valid sample/i)).not.toBeInTheDocument();
  });

  it('renders field descriptions from mapped nested preview metadata', () => {
    render(
      <FormPreviewPanel
        schema={unsupportedTradeSchema}
        status={{
          state: 'stale',
          targetId: unsupportedTradeSchema.targetId,
          reason: 'generation-error',
          message: 'Using last successful preview'
        }}
      />
    );

    expect(screen.getByText(/mapped via exported subschema defaults/i)).toBeInTheDocument();
    expect(screen.getByText(/uses partydefaults\.name component mapping/i)).toBeInTheDocument();
  });

  it('surfaces source-backed field metadata when the preview schema provides source locations', () => {
    render(
      <FormPreviewPanel
        schema={tradeSchema}
        status={{ state: 'ready', targetId: tradeSchema.targetId }}
      />
    );

    expect(screen.getByText(/preview\.rosetta:12:5/i)).toBeInTheDocument();
    expect(screen.getByText(/legal entity name/i)).toBeInTheDocument();
  });

  it('shows invalid and valid summary states, nested validation errors, and reset behavior', () => {
    render(
      <FormPreviewPanel
        schema={validationTradeSchema}
        status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
      />
    );

    expect(screen.getByText(/ready to validate sample/i)).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText('Trade id'));
    fireEvent.blur(screen.getByLabelText('Name'));

    expect(screen.getByText(/invalid sample/i)).toBeInTheDocument();
    expect(screen.getByText(/trade id is required/i)).toBeInTheDocument();
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/add at least 1 aliases item/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Trade id'), { target: { value: 'TRD-1' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Bank' } });
    fireEvent.click(screen.getByRole('button', { name: /add aliases item/i }));
    fireEvent.change(screen.getByLabelText('Alias 1'), { target: { value: 'Primary alias' } });

    expect(screen.getByText(/valid sample/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reset sample/i }));

    expect(screen.getByText(/ready to validate sample/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Trade id')).toHaveValue('');
    expect(screen.getByLabelText('Name')).toHaveValue('');
    expect(screen.queryByLabelText('Alias 1')).not.toBeInTheDocument();
  });

  it('enforces array max-cardinality validation when a repeatable field exceeds its preview limit', () => {
    render(
      <FormPreviewPanel
        schema={validationTradeSchema}
        status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
      />
    );

    fireEvent.change(screen.getByLabelText('Trade id'), { target: { value: 'TRD-1' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Bank' } });
    fireEvent.click(screen.getByRole('button', { name: /add aliases item/i }));
    fireEvent.click(screen.getByRole('button', { name: /add aliases item/i }));
    fireEvent.click(screen.getByRole('button', { name: /add aliases item/i }));

    expect(screen.getByText(/use at most 2 aliases items/i)).toBeInTheDocument();
    expect(screen.getByText(/invalid sample/i)).toBeInTheDocument();
  });

  it('lets optional object sections stay absent until explicitly added', () => {
    render(
      <FormPreviewPanel
        schema={optionalSectionSchema}
        status={{ state: 'ready', targetId: optionalSectionSchema.targetId }}
      />
    );

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.getByText(/section omitted from the sample/i)).toBeInTheDocument();
    expect(screen.getByTestId('sample-data-output')).not.toHaveTextContent('counterparty');

    fireEvent.click(screen.getByRole('button', { name: /add counterparty/i }));
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByTestId('sample-data-output')).toHaveTextContent('"counterparty": {');

    fireEvent.blur(screen.getByLabelText('Name'));
    expect(screen.getByText(/name is required/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove counterparty/i }));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(screen.queryByText(/name is required/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('sample-data-output')).not.toHaveTextContent('counterparty');
  });

  it('stores numeric sample values as numbers instead of strings', () => {
    render(
      <FormPreviewPanel
        schema={numericSchema}
        status={{ state: 'ready', targetId: numericSchema.targetId }}
      />
    );

    fireEvent.change(screen.getByLabelText('Quantity'), {
      target: { value: '42', valueAsNumber: 42 }
    });

    expect(screen.getByTestId('sample-data-output')).toHaveTextContent('"quantity": 42');
  });

  it('renders synchronized sample data and copies it through the clipboard action', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <FormPreviewPanel
        schema={validationTradeSchema}
        status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
      />
    );

    fireEvent.change(screen.getByLabelText('Trade id'), { target: { value: 'TRD-1' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Bank' } });
    fireEvent.click(screen.getByRole('button', { name: /add aliases item/i }));
    fireEvent.change(screen.getByLabelText('Alias 1'), { target: { value: 'Desk alias' } });

    expect(screen.getByTestId('sample-data-output')).toHaveTextContent('"tradeId": "TRD-1"');
    expect(screen.getByTestId('sample-data-output')).toHaveTextContent('"name": "Acme Bank"');
    expect(screen.getByTestId('sample-data-output')).toHaveTextContent('"Desk alias"');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy sample data/i }));
    });

    expect(writeText).toHaveBeenCalledWith(`{
  "tradeId": "TRD-1",
  "party": {
    "name": "Acme Bank"
  },
  "aliases": [
    "Desk alias"
  ]
}`);
    expect(screen.getByText(/sample data copied/i)).toBeInTheDocument();
  });
});
