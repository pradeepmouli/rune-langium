// @ts-nocheck — Generated scaffold; component props require controlled-component adapters
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CardinalitySelector,
  Field,
  FieldContent,
  FieldLabel,
  Input,
  Select,
  TypeSelector
} from '@/components/zod-form-components';
import { DataSchema } from '../../../generated/zod-schemas.js';

type StripIndexSignature<T> = T extends readonly (infer U)[]
  ? StripIndexSignature<U>[]
  : T extends object
    ? {
        [K in keyof T as string extends K
          ? never
          : number extends K
            ? never
            : symbol extends K
              ? never
              : K]: StripIndexSignature<T[K]>;
      }
    : T;

type FormData = StripIndexSignature<z.output<typeof DataSchema>>;

export function DataForm(props: { onSubmit: (data: FormData) => void }) {
  const { register, handleSubmit, control } = useForm<FormData>({
    resolver: zodResolver(DataSchema)
  });
  const {
    fields: attributesFields,
    append: appendAttributes,
    remove: removeAttributes
  } = useFieldArray<FormData, 'attributes'>({ control, name: 'attributes' });

  return (
    <form onSubmit={handleSubmit(props.onSubmit)}>
      <Field>
        <FieldLabel htmlFor="$type">$Type</FieldLabel>
        <FieldContent>
          <Select id="$type" {...register('$type')} />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <FieldContent>
          <Input id="name" {...register('name')} />
        </FieldContent>
      </Field>
      <Field>
        <FieldLabel htmlFor="superType">Super Type</FieldLabel>
        <FieldContent>
          <TypeSelector id="superType" {...register('superType')} />
        </FieldContent>
      </Field>
      <div>
        <label>Attributes</label>
        {attributesFields.map((item, index) => (
          <div key={item.id}>
            <div>
              <label>0</label>
              <fieldset>
                <legend>0</legend>
                <Field>
                  <FieldLabel htmlFor="attributes.${index}.$type">$Type</FieldLabel>
                  <FieldContent>
                    <Select
                      id="attributes.${index}.$type"
                      {...register(`attributes.${index}.$type`)}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="attributes.${index}.name">Name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="attributes.${index}.name"
                      {...register(`attributes.${index}.name`)}
                    />
                  </FieldContent>
                </Field>
                <div>
                  <label>Type Call</label>
                  <fieldset>
                    <legend>Type Call</legend>
                    <Field>
                      <FieldLabel htmlFor="attributes.${index}.typeCall.$type">$Type</FieldLabel>
                      <FieldContent>
                        <Select
                          id="attributes.${index}.typeCall.$type"
                          {...register(`attributes.${index}.typeCall.$type`)}
                        />
                      </FieldContent>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="attributes.${index}.typeCall.type">Type</FieldLabel>
                      <FieldContent>
                        <TypeSelector
                          id="attributes.${index}.typeCall.type"
                          {...register(`attributes.${index}.typeCall.type`)}
                        />
                      </FieldContent>
                    </Field>
                    <div>
                      <label>Arguments</label>
                      <p>
                        Nested array editing is not auto-generated for dynamic paths. Use a custom
                        renderer for attributes.${index}.typeCall.arguments.
                      </p>
                    </div>
                  </fieldset>
                </div>
                <Field>
                  <FieldLabel htmlFor="attributes.${index}.card">Card</FieldLabel>
                  <FieldContent>
                    <CardinalitySelector
                      id="attributes.${index}.card"
                      {...register(`attributes.${index}.card`)}
                    />
                  </FieldContent>
                </Field>
              </fieldset>
            </div>
            <button type="button" onClick={() => removeAttributes(index)}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            appendAttributes({
              $type: 'Attribute',
              name: '',
              typeCall: { $type: 'TypeCall', type: { $refText: '', ref: '' }, arguments: [] },
              card: { $type: 'RosettaCardinality', inf: 0, sup: 0, unbounded: false }
            })
          }
        >
          Add
        </button>
      </div>
      <button type="submit">Submit</button>
    </form>
  );
}
