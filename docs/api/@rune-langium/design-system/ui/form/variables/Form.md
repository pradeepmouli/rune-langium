[**Documentation v0.1.0**](../../../../../README.md)

***

[Documentation](../../../../../README.md) / [@rune-langium/design-system](../../../README.md) / [ui/form](../README.md) / Form

# Variable: Form

> `const` **Form**: \<`TFieldValues`, `TContext`, `TTransformedValues`\>(`props`) => `Element` = `FormProvider`

Defined in: [packages/design-system/src/ui/form.tsx:16](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/design-system/src/ui/form.tsx#L16)

A provider component that propagates the `useForm` methods to all children components via [React Context](https://react.dev/reference/react/useContext) API. To be used with useFormContext.

## Type Parameters

### TFieldValues

`TFieldValues` *extends* `FieldValues`

### TContext

`TContext` = `any`

### TTransformedValues

`TTransformedValues` = `TFieldValues`

## Parameters

### props

`FormProviderProps`\<`TFieldValues`, `TContext`, `TTransformedValues`\>

all useForm methods

## Returns

`Element`

## Remarks

[API](https://react-hook-form.com/docs/useformcontext) • [Demo](https://codesandbox.io/s/react-hook-form-v7-form-context-ytudi)

## Example

```tsx
function App() {
  const methods = useForm();
  const onSubmit = data => console.log(data);

  return (
    <FormProvider {...methods} >
      <form onSubmit={methods.handleSubmit(onSubmit)}>
        <NestedInput />
        <input type="submit" />
      </form>
    </FormProvider>
  );
}

 function NestedInput() {
  const { register } = useFormContext(); // retrieve all hook methods
  return <input {...register("test")} />;
}
```
