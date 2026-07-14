// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { InstanceFormPanel } from '../../../src/shell/panels/InstanceFormPanel.js';
import { instanceFieldsKey, useInstanceStore } from '../../../src/store/instance-store.js';

describe('InstanceFormPanel', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {}, resolvedFields: {} });
  });

  it('renders one input per top-level resolved field and writes edits to the store', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    useInstanceStore.setState((s) => ({
      resolvedFields: {
        ...s.resolvedFields,
        [instanceFieldsKey('test.Party', [])]: [{ path: 'name', label: 'name', kind: 'string', required: true }]
      }
    }));
    render(<InstanceFormPanel instanceId={id} />);
    const input = screen.getByLabelText('name');
    fireEvent.change(input, { target: { value: 'Acme' } });
    expect(useInstanceStore.getState().instances[id]?.data).toEqual({ name: 'Acme' });
  });
});

describe('InstanceFormPanel — (1..*) array fields', () => {
  beforeEach(() => {
    useInstanceStore.setState({ instances: {}, resolvedFields: {} });
  });

  function seedAliasesField(typeFqn: string) {
    useInstanceStore.setState((s) => ({
      resolvedFields: {
        ...s.resolvedFields,
        [instanceFieldsKey(typeFqn, [])]: [
          {
            path: 'aliases',
            label: 'aliases',
            kind: 'array',
            required: false,
            children: [{ path: 'aliases[]', label: 'aliases', kind: 'string', required: true }]
          }
        ]
      }
    }));
  }

  it('renders an Add button for an array field, and adding twice yields two item inputs', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    seedAliasesField('test.Party');
    render(<InstanceFormPanel instanceId={id} />);
    fireEvent.click(screen.getByRole('button', { name: /add aliases/i }));
    fireEvent.click(screen.getByRole('button', { name: /add aliases/i }));
    expect(screen.getAllByLabelText(/aliases\[\d+\]/)).toHaveLength(2);
  });

  it('removing an item drops it from the stored array and re-indexes the rest', () => {
    const id = useInstanceStore.getState().createInstance('test.Party', 'My Party');
    seedAliasesField('test.Party');
    useInstanceStore.getState().updateInstanceData(id, 'aliases', ['A', 'B']);
    render(<InstanceFormPanel instanceId={id} />);
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]!);
    expect(useInstanceStore.getState().instances[id]?.data).toEqual({ aliases: ['B'] });
  });
});
