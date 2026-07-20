// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormPreviewSchema } from '@rune-langium/codegen/export';
import { FormPreviewPanel } from '../../src/components/FormPreviewPanel.js';
import { usePreviewStore } from '../../src/store/preview-store.js';
import { useOutputStore } from '../../src/store/output-store.js';

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

const unresolvedReferenceTradeSchema: FormPreviewSchema = {
  ...tradeSchema,
  status: 'unsupported',
  unsupportedFeatures: ['unresolved-reference:Instrument', 'unresolved-reference:Party'],
  fields: [
    ...tradeSchema.fields,
    {
      path: 'instrument',
      label: 'instrument',
      kind: 'unknown',
      required: true,
      description: 'Type reference Instrument could not be resolved for form preview.'
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
    // Use defineProperty (not Object.assign) so the override works even after
    // user-event installs its own non-writable clipboard implementation.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      writable: true,
      value: {
        writeText: async () => undefined
      }
    });
  });

  it('shows a no-selection state when no schema is available', () => {
    render(<FormPreviewPanel schema={undefined} status={{ state: 'waiting' }} />);

    expect(screen.getByRole('region', { name: /form preview/i })).toBeInTheDocument();
    expect(screen.getByText(/select a type from the graph, file tree, or source editor/i)).toBeInTheDocument();
  });

  it('shows a waiting state when generation is in progress for a selected type', () => {
    render(<FormPreviewPanel schema={undefined} status={{ state: 'waiting', targetId: tradeSchema.targetId }} />);

    expect(screen.getByText(/generating preview for the selected type/i)).toBeInTheDocument();
    expect(screen.queryByText(/select a type from the graph, file tree, or source editor/i)).not.toBeInTheDocument();
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
    render(<FormPreviewPanel schema={tradeSchema} status={{ state: 'ready', targetId: tradeSchema.targetId }} />);

    expect(screen.getByRole('heading', { name: 'Trade' })).toBeInTheDocument();
    expect(screen.getByLabelText('id')).toHaveAttribute('type', 'text');
    // Radix Select renders the trigger as a button — assert the visible value
    // text rather than `toHaveDisplayValue` (which only works on form controls).
    expect(screen.getByLabelText('side')).toHaveTextContent('Buy side');
    expect(screen.getByLabelText('name')).toHaveAttribute('type', 'text');
    expect(screen.getByText('tags')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add tags item/i })).toBeInTheDocument();
    expect(screen.getByText(/ready to validate sample/i)).toBeInTheDocument();
  });

  it('lets users clear an optional enum back to the unset placeholder', async () => {
    const optionalEnumSchema: FormPreviewSchema = {
      schemaVersion: 1,
      targetId: 'test.preview.OptionalSide',
      title: 'OptionalSide',
      status: 'ready',
      fields: [
        {
          path: 'side',
          label: 'side',
          kind: 'enum',
          required: false,
          enumValues: [
            { value: 'Buy', label: 'Buy side' },
            { value: 'Sell', label: 'Sell' }
          ]
        }
      ],
      sourceMap: []
    };

    render(
      <FormPreviewPanel
        schema={optionalEnumSchema}
        status={{ state: 'ready', targetId: optionalEnumSchema.targetId }}
      />
    );

    const trigger = screen.getByLabelText('side');
    // Initially unset for an optional enum -> placeholder visible.
    expect(trigger).toHaveTextContent('Select…');

    // `writeToClipboard: false` keeps userEvent from installing a non-writable
    // clipboard mock, which otherwise breaks the per-test `navigator.clipboard`
    // override in this file's beforeEach.
    const user = userEvent.setup({ writeToClipboard: false });
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Sell' }));
    expect(trigger).toHaveTextContent('Sell');

    // Clearing back to unset must round-trip through the sentinel "Select…" item.
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Select…' }));
    expect(trigger).toHaveTextContent('Select…');
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

  it('logs an op-log warning when the schema has unsupported preview features', () => {
    useOutputStore.setState({ lines: [] });

    render(
      <FormPreviewPanel
        schema={unsupportedTradeSchema}
        status={{ state: 'ready', targetId: unsupportedTradeSchema.targetId }}
      />
    );

    const entry = useOutputStore.getState().lines.find((l) => l.op === 'preview');
    expect(entry).toBeDefined();
    expect(entry?.severity).toBe('warn');
    expect(entry?.text).toContain('exported-subschema:PartyDefaults');
    expect(entry?.subject).toBe(unsupportedTradeSchema.targetId);
  });

  it('does not log an op-log warning when the schema has no unsupported preview features', () => {
    useOutputStore.setState({ lines: [] });

    render(<FormPreviewPanel schema={tradeSchema} status={{ state: 'ready', targetId: tradeSchema.targetId }} />);

    expect(useOutputStore.getState().lines.find((l) => l.op === 'preview')).toBeUndefined();
  });

  it('surfaces the root cause when a type reference could not be resolved', () => {
    useOutputStore.setState({ lines: [] });

    render(
      <FormPreviewPanel
        schema={unresolvedReferenceTradeSchema}
        status={{ state: 'ready', targetId: unresolvedReferenceTradeSchema.targetId }}
      />
    );

    const entry = useOutputStore.getState().lines.find((l) => l.op === 'preview');
    expect(entry?.text).toContain('references could not be resolved: Instrument, Party');
    expect(entry?.text).not.toContain('unresolved-reference:');

    expect(screen.getByText(/references could not be resolved: Instrument, Party/i)).toBeInTheDocument();
  });

  it('renders nested preview metadata without field description annotations', () => {
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

    // Field descriptions are no longer rendered (removed in restyle)
    expect(screen.queryByText(/mapped via exported subschema defaults/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/uses partydefaults\.name component mapping/i)).not.toBeInTheDocument();
    // But the fields themselves remain
    expect(screen.getByText('counterparty')).toBeInTheDocument();
    expect(screen.getByText('Legal name')).toBeInTheDocument();
  });

  it('does not surface raw source locations in the form UI', () => {
    render(<FormPreviewPanel schema={tradeSchema} status={{ state: 'ready', targetId: tradeSchema.targetId }} />);

    expect(screen.queryByText(/preview\.rosetta:12:5/i)).not.toBeInTheDocument();
    // Field descriptions are no longer rendered (removed in restyle)
    expect(screen.queryByText(/legal entity name/i)).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: /^reset$/i }));

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
    // The "Section omitted from the sample." caption was removed — the
    // absent nested children (no Name input rendered) is the affordance.
    // The Add button stays accessible via its aria-label even though the
    // label text is replaced by a + icon.
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
    render(<FormPreviewPanel schema={numericSchema} status={{ state: 'ready', targetId: numericSchema.targetId }} />);

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
      fireEvent.click(screen.getByRole('button', { name: /^copy$/i }));
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

  describe('controlled mode (values/onValuesChange props)', () => {
    it('renders using the given values prop instead of usePreviewStore state', () => {
      render(
        <FormPreviewPanel
          schema={validationTradeSchema}
          status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
          values={{ tradeId: 'EXT-1', party: { name: 'External Bank' }, aliases: ['Ext alias'] }}
        />
      );

      expect(screen.getByLabelText('Trade id')).toHaveValue('EXT-1');
      expect(screen.getByLabelText('Name')).toHaveValue('External Bank');
      expect(screen.getByLabelText('Alias 1')).toHaveValue('Ext alias');
      // The uncontrolled store's sample for this targetId must remain untouched.
      expect(usePreviewStore.getState().samples.has(validationTradeSchema.targetId)).toBe(false);
    });

    it('calls onValuesChange with the full merged object on a scalar edit + blur, and does not call updateSample', () => {
      const updateSampleSpy = vi.spyOn(usePreviewStore.getState(), 'updateSample');
      const onValuesChange = vi.fn();
      render(
        <FormPreviewPanel
          schema={validationTradeSchema}
          status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
          values={{ tradeId: '', party: { name: '' }, aliases: [] }}
          onValuesChange={onValuesChange}
        />
      );

      fireEvent.change(screen.getByLabelText('Trade id'), { target: { value: 'TRD-9' } });
      fireEvent.blur(screen.getByLabelText('Trade id'));

      expect(onValuesChange).toHaveBeenCalledWith({ tradeId: 'TRD-9', party: { name: '' }, aliases: [] });
      expect(updateSampleSpy).not.toHaveBeenCalled();
      updateSampleSpy.mockRestore();
    });

    it('produces correctly nested onValuesChange payloads for a nested-object field edit and an array add/remove', () => {
      const onValuesChange = vi.fn();
      const { rerender } = render(
        <FormPreviewPanel
          schema={validationTradeSchema}
          status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
          values={{ tradeId: 'TRD-1', party: { name: '' }, aliases: [] }}
          onValuesChange={onValuesChange}
        />
      );

      // Nested-object field edit.
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Bank' } });
      expect(onValuesChange).toHaveBeenLastCalledWith({
        tradeId: 'TRD-1',
        party: { name: 'Acme Bank' },
        aliases: []
      });

      // Array add — simulate the parent feeding the updated values back in
      // (as InstanceFormPanel will via the store), since this component is
      // controlled and does not track its own values across renders.
      rerender(
        <FormPreviewPanel
          schema={validationTradeSchema}
          status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
          values={{ tradeId: 'TRD-1', party: { name: 'Acme Bank' }, aliases: [] }}
          onValuesChange={onValuesChange}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /add aliases item/i }));
      expect(onValuesChange).toHaveBeenLastCalledWith({
        tradeId: 'TRD-1',
        party: { name: 'Acme Bank' },
        aliases: ['']
      });

      // Array remove — feed the added-item state back in, then remove it.
      rerender(
        <FormPreviewPanel
          schema={validationTradeSchema}
          status={{ state: 'ready', targetId: validationTradeSchema.targetId }}
          values={{ tradeId: 'TRD-1', party: { name: 'Acme Bank' }, aliases: ['Primary alias'] }}
          onValuesChange={onValuesChange}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /remove alias 1/i }));
      expect(onValuesChange).toHaveBeenLastCalledWith({
        tradeId: 'TRD-1',
        party: { name: 'Acme Bank' },
        aliases: []
      });
    });
  });
});
