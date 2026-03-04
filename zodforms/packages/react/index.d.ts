import type { z } from 'zod';

export interface FormMeta {
  label?: string;
  description?: string;
  [key: string]: unknown;
}

export interface UseZodFormOptions<T extends z.ZodType> {
  schema: T;
  defaultValues?: z.input<T>;
  [key: string]: unknown;
}

export interface UseZodFormReturn<T extends z.ZodType> {
  form: any;
  handleSubmit: (fn: (data: z.output<T>) => void) => (e?: React.BaseSyntheticEvent) => void;
  [key: string]: unknown;
}

export function useZodForm<T extends z.ZodType>(options: UseZodFormOptions<T>): UseZodFormReturn<T>;
