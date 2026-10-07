// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { useZodForm } from '@zod-to-form/react';
import { useFieldArray } from 'react-hook-form';
import { EditorFormProvider, EditorController } from '../../src/components/forms/EditorFormProvider.js';
import {
  DataSchema,
  ChoiceSchema,
  RosettaEnumerationSchema,
  RosettaFunctionSchema,
  RosettaTypeAliasSchema
} from '../../src/generated/zod-schemas.js';

afterEach(cleanup);

function Harness({
  schema,
  name = 'name',
  value = 'GoodName'
}: {
  schema: z.ZodObject;
  name?: string;
  value?: string;
}) {
  const { form } = useZodForm(schema, { optimization: { level: 1 }, mode: 'onChange' });
  return (
    <EditorFormProvider {...form} schema={schema}>
      <EditorController
        name={name}
        defaultValue={value}
        render={({ field, fieldState }) => (
          <>
            <input aria-label="field" {...field} />
            <span role="status">{fieldState.error?.message ?? 'valid'}</span>
          </>
        )}
      />
    </EditorFormProvider>
  );
}

describe('EditorForms L1 validation', () => {
  it('validates only the changed field', async () => {
    const unrelated = vi.fn(() => true);
    const schema = z.object({ name: z.string().min(1), other: z.string().refine(unrelated) });
    function Fields() {
      const { form } = useZodForm(schema, {
        optimization: { level: 1 },
        mode: 'onChange',
        defaultValues: { name: 'Name', other: 'Other' }
      });
      return (
        <EditorFormProvider {...form} schema={schema}>
          <EditorController
            name="name"
            render={({ field, fieldState }) => (
              <>
                <input aria-label="name" {...field} />
                <span role="status">{fieldState.invalid ? 'invalid' : 'valid'}</span>
              </>
            )}
          />
          <EditorController name="other" render={({ field }) => <input aria-label="other" {...field} />} />
        </EditorFormProvider>
      );
    }
    render(<Fields />);
    unrelated.mockClear();
    fireEvent.change(screen.getByLabelText('name'), { target: { value: '' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('invalid'));
    expect(unrelated).not.toHaveBeenCalled();
  });

  it('keeps rules attached after array reorder, removal, and addition', async () => {
    const schema = z.object({ rows: z.array(z.object({ name: z.string().min(1) })) });
    function Rows() {
      const { form } = useZodForm(schema, {
        optimization: { level: 1 },
        mode: 'onChange',
        defaultValues: { rows: [{ name: 'A' }, { name: 'B' }] }
      });
      const { fields, move, remove, append } = useFieldArray({ control: form.control, name: 'rows' });
      return (
        <EditorFormProvider {...form} schema={schema}>
          <button onClick={() => move(0, 1)}>Move</button>
          <button onClick={() => remove(0)}>Remove</button>
          <button onClick={() => append({ name: 'C' })}>Add</button>
          {fields.map((row, index) => (
            <EditorController
              key={row.id}
              name={`rows.${index}.name`}
              render={({ field, fieldState }) => (
                <>
                  <input aria-label={`row-${index}`} {...field} />
                  <span data-testid={`status-${index}`}>{fieldState.invalid ? 'invalid' : 'valid'}</span>
                </>
              )}
            />
          ))}
        </EditorFormProvider>
      );
    }
    render(<Rows />);
    fireEvent.click(screen.getByText('Move'));
    expect(screen.getByLabelText('row-0')).toHaveValue('B');
    fireEvent.click(screen.getByText('Remove'));
    fireEvent.click(screen.getByText('Add'));
    fireEvent.change(screen.getByLabelText('row-1'), { target: { value: '' } });
    await waitFor(() => expect(screen.getByTestId('status-1')).toHaveTextContent('invalid'));
    expect(screen.getByTestId('status-0')).toHaveTextContent('valid');
  });

  it.each([DataSchema, ChoiceSchema, RosettaEnumerationSchema, RosettaFunctionSchema, RosettaTypeAliasSchema])(
    'preserves identifier rejection without parsing the whole AST',
    async (schema) => {
      const parse = vi.spyOn(schema, 'safeParse');
      render(<Harness schema={schema} />);
      fireEvent.change(screen.getByLabelText('field'), { target: { value: '' } });
      await waitFor(() => expect(screen.getByRole('status').textContent).not.toBe('valid'));
      fireEvent.change(screen.getByLabelText('field'), { target: { value: 'NewName' } });
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('valid'));
      expect(parse).not.toHaveBeenCalled();
      parse.mockRestore();
    }
  );

  it.each([
    [DataSchema, 'attributes.3.name'],
    [RosettaEnumerationSchema, 'enumValues.2.name'],
    [RosettaFunctionSchema, 'inputs.4.name'],
    [RosettaFunctionSchema, 'output.name']
  ] as const)('validates nested identifiers at any row index', async (schema, name) => {
    render(<Harness schema={schema} name={name} />);
    fireEvent.change(screen.getByLabelText('field'), { target: { value: '' } });
    await waitFor(() => expect(screen.getByRole('status').textContent).not.toBe('valid'));
  });

  it('normalizes an empty optional enum display to undefined', async () => {
    render(<Harness schema={RosettaEnumerationSchema} name="enumValues.7.display" value="Display" />);
    fireEvent.change(screen.getByLabelText('field'), { target: { value: '' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('valid'));
  });

  it('preserves loose-object UI-only fields', async () => {
    render(<Harness schema={RosettaFunctionSchema} name="expressionText" />);
    fireEvent.change(screen.getByLabelText('field'), { target: { value: 'some expression' } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('valid'));
  });
});
