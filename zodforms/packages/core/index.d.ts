export interface FormMeta {
  label?: string;
  description?: string;
  [key: string]: unknown;
}
export function createFormMeta(meta: FormMeta): FormMeta;
