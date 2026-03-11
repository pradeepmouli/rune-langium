// @ts-nocheck — Generated scaffold; component props require controlled-component adapters
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Field,
  FieldContent,
  FieldLabel,
  Input,
  Select,
  TypeSelector
} from '@/components/zod-form-components';
import { RosettaEnumerationSchema } from '../../../generated/zod-schemas.js';

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

type FormData = StripIndexSignature<z.output<typeof RosettaEnumerationSchema>>;

export function RosettaEnumerationForm(props: { onSubmit: (data: FormData) => void }) {
  const { register, handleSubmit, control } = useForm<FormData>({
    resolver: zodResolver(RosettaEnumerationSchema)
  });
  const {
    fields: enumValuesFields,
    append: appendEnumValues,
    remove: removeEnumValues
  } = useFieldArray<FormData, 'enumValues'>({ control, name: 'enumValues' });

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
        <FieldLabel htmlFor="parent">Parent</FieldLabel>
        <FieldContent>
          <TypeSelector id="parent" {...register('parent')} />
        </FieldContent>
      </Field>
      <div>
        <label>Enum Values</label>
        {enumValuesFields.map((item, index) => (
          <div key={item.id}>
            <div>
              <label>0</label>
              <fieldset>
                <legend>0</legend>
                <Field>
                  <FieldLabel htmlFor="enumValues.${index}.$type">$Type</FieldLabel>
                  <FieldContent>
                    <Select
                      id="enumValues.${index}.$type"
                      {...register(`enumValues.${index}.$type`)}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="enumValues.${index}.name">Name</FieldLabel>
                  <FieldContent>
                    <Input
                      id="enumValues.${index}.name"
                      {...register(`enumValues.${index}.name`)}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="enumValues.${index}.display">Display</FieldLabel>
                  <FieldContent>
                    <Input
                      id="enumValues.${index}.display"
                      {...register(`enumValues.${index}.display`)}
                    />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="enumValues.${index}.definition">Definition</FieldLabel>
                  <FieldContent>
                    <Input
                      id="enumValues.${index}.definition"
                      {...register(`enumValues.${index}.definition`)}
                    />
                  </FieldContent>
                </Field>
                <div>
                  <label>References</label>
                  <p>
                    Nested array editing is not auto-generated for dynamic paths. Use a custom
                    renderer for enumValues.${index}.references.
                  </p>
                </div>
                <div>
                  <label>Annotations</label>
                  <p>
                    Nested array editing is not auto-generated for dynamic paths. Use a custom
                    renderer for enumValues.${index}.annotations.
                  </p>
                </div>
                <div>
                  <label>Enum Synonyms</label>
                  <p>
                    Nested array editing is not auto-generated for dynamic paths. Use a custom
                    renderer for enumValues.${index}.enumSynonyms.
                  </p>
                </div>
              </fieldset>
            </div>
            <button type="button" onClick={() => removeEnumValues(index)}>
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            appendEnumValues({
              $type: 'RosettaEnumValue',
              name: '',
              display: '',
              definition: '',
              references: [],
              annotations: [],
              enumSynonyms: []
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
