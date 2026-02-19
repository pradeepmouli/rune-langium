/**
 * Form — re-exports react-hook-form's FormProvider as Form.
 *
 * For field UI primitives, use the `Field` component family from `./field.js`.
 * See https://ui.shadcn.com/docs/forms/react-hook-form for the recommended
 * pattern using `<Controller />` + `<Field />`.
 *
 * @module
 */

import { FormProvider } from 'react-hook-form';

const Form = FormProvider;

export { Form };
