// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { AnnotationRef } from '@rune-langium/core';

/** Metadata names defined by the Rune `metadata` annotation. */
export const metadataNames = new Set(['address', 'id', 'key', 'location', 'reference', 'scheme', 'template']);
const fieldMetadataNames = new Set(['address', 'id', 'location', 'reference', 'scheme']);

/** Canonical runtime fields used by the Rosetta Java metadata wrappers. */
export const metadataName = {
  address: 'reference',
  id: 'externalKey',
  key: 'externalKey',
  location: 'scopedKey',
  reference: 'externalReference',
  scheme: 'scheme',
  template: 'template'
} as const;

export interface MetadataAnnotatedNode {
  annotations?: readonly AnnotationRef[];
}

export type FieldMetadataKind = 'field' | 'reference';

export function unwrapMetadata(value: string, many: boolean): string {
  return many ? `(${value} ?? []).map((field) => field.value).filter((value) => value != null)` : `(${value})?.value`;
}

/** Whether a data type stores keys or template metadata on the value itself. */
export function hasTypeMetadata(node: MetadataAnnotatedNode | undefined): boolean {
  return (
    node?.annotations?.some((annotation) => {
      const name = annotation.annotation?.ref?.name ?? annotation.annotation?.$refText;
      const attribute = annotation.attribute?.ref?.name ?? annotation.attribute?.$refText;
      return name === 'metadata' && (attribute === 'key' || attribute === 'template');
    }) ?? false
  );
}

/** Return the wrapper kind required by an Attribute's metadata annotations. */
export function fieldMetadataKind(node: MetadataAnnotatedNode | undefined): FieldMetadataKind | undefined {
  let hasField = false;
  for (const annotation of node?.annotations ?? []) {
    const annotationName = annotation.annotation?.ref?.name ?? annotation.annotation?.$refText;
    const attributeName = annotation.attribute?.ref?.name ?? annotation.attribute?.$refText;
    if (annotationName !== 'metadata' || attributeName === undefined) continue;
    if (attributeName === 'reference' || attributeName === 'address') return 'reference';
    if (fieldMetadataNames.has(attributeName)) hasField = true;
  }
  return hasField ? 'field' : undefined;
}

/** Whether an Attribute carries at least one field metadata annotation. */
export function hasFieldMetadata(node: MetadataAnnotatedNode | undefined): boolean {
  return fieldMetadataKind(node) !== undefined;
}

/**
 * Render the metadata runtime for an emitted TypeScript or JavaScript file.
 * The JS branch is used by Studio's sandbox evaluator, so it must contain no
 * TypeScript-only syntax.
 */
export function metadataRuntimeSource(typescript: boolean, exported = false): string {
  const prefix = exported ? 'export ' : '';
  const types = typescript
    ? `${prefix}type RuneMetadata = Record<string, unknown>;
${prefix}type RuneFieldWithMeta<T> = { value: T; meta: RuneMetadata };
${prefix}type RuneReferenceWithMeta<T> = {
  value?: T;
  meta?: RuneMetadata;
  reference?: { reference?: unknown; scope?: unknown; pointsTo?: unknown };
  externalReference?: unknown;
  globalReference?: unknown;
};
${prefix}type RuneMetadataInputKind = 'value' | 'field' | 'reference';
${prefix}type RuneUnwrapMeta<T> = T extends readonly (infer I)[] ? RuneUnwrapMeta<I>[] : T extends { value?: infer V } ? V : T;
${prefix}type RuneWithMetaResult<T, K extends string = string, S extends RuneMetadataInputKind = 'value'> =
  S extends 'reference' ? RuneToReferenceResult<RuneUnwrapMeta<T>> :
  S extends 'field' ? [Extract<K, 'address' | 'reference'>] extends [never]
    ? RuneToFieldResult<RuneUnwrapMeta<T>> : RuneToReferenceResult<RuneUnwrapMeta<T>> :
  T extends readonly (infer I)[]
  ? [Extract<K, 'address' | 'reference'>] extends [never]
    ? [Exclude<K, 'key' | 'template'>] extends [never] ? T : RuneFieldWithMeta<I>[]
    : RuneReferenceWithMeta<I>[]
  : [Extract<K, 'address' | 'reference'>] extends [never]
    ? [Exclude<K, 'key' | 'template'>] extends [never] ? T : RuneFieldWithMeta<T>
    : RuneReferenceWithMeta<T>;
${prefix}type RuneAsKeyResult<T> = T extends readonly (infer I)[] ? RuneReferenceWithMeta<I>[] : RuneReferenceWithMeta<T>;
${prefix}type RuneToFieldResult<T> = T extends readonly (infer I)[] ? RuneFieldWithMeta<I>[] : RuneFieldWithMeta<T>;
${prefix}type RuneToReferenceResult<T> = T extends readonly (infer I)[] ? RuneReferenceWithMeta<I>[] : RuneReferenceWithMeta<T>;
${prefix}type RuneToFieldInput<T> = T extends readonly (infer I)[] ? T | RuneFieldWithMeta<I>[] : T | RuneFieldWithMeta<T>;
${prefix}type RuneToReferenceInput<T> = T extends readonly (infer I)[] ? T | RuneReferenceWithMeta<I>[] : T | RuneReferenceWithMeta<T>;
`
    : '';
  const unknownType = typescript ? ': unknown' : '';
  const typeGuard = typescript
    ? ': value is { value?: unknown; meta?: RuneMetadata; reference?: { reference?: unknown; scope?: unknown; pointsTo?: unknown }; externalReference?: unknown; globalReference?: unknown }'
    : '';
  const metadataType = typescript ? ': RuneMetadata' : '';
  const withMetaSignature = typescript
    ? "<T, K extends string, S extends RuneMetadataInputKind = 'value'>(value: T, entries: Record<K, unknown>, inputKind?: S): RuneWithMetaResult<T, K, S>"
    : '(value, entries, inputKind)';
  const asKeySignature = typescript
    ? "<T, S extends RuneMetadataInputKind = 'value'>(value: T, inputKind?: S): RuneAsKeyResult<S extends 'value' ? T : RuneUnwrapMeta<T>>"
    : '(value, inputKind)';
  const recordValue = typescript ? '(rawValue as Record<string, unknown>)' : 'rawValue';
  const recordMeta = typescript
    ? `(${recordValue}.meta as RuneMetadata | undefined) ?? {}`
    : `${recordValue}.meta || {}`;
  const existingMeta = typescript ? '(existing.meta ?? {})' : '(existing.meta || {})';
  const candidateCast = typescript
    ? ' as { value?: unknown; meta?: RuneMetadata; externalReference?: unknown; globalReference?: unknown }'
    : '';
  const nestedCast = typescript ? ' as { meta?: RuneMetadata }' : '';
  const metadataValue = typescript ? ': RuneMetadata' : '';
  const metadataNamesType = typescript ? ': Record<string, string>' : '';
  const returnType = typescript ? ': unknown' : '';
  const returnValue = typescript ? ' as RuneWithMetaResult<T, K, S>' : '';
  const keyResultType = typescript ? ': RuneReferenceWithMeta<unknown>' : '';
  const keyReturn = typescript ? " as RuneAsKeyResult<S extends 'value' ? T : RuneUnwrapMeta<T>>" : '';
  const normalizerReturn = typescript ? " as RuneToFieldResult<S extends 'value' ? T : RuneUnwrapMeta<T>>" : '';
  const referenceNormalizerReturn = typescript
    ? " as RuneToReferenceResult<S extends 'value' ? T : RuneUnwrapMeta<T>>"
    : '';

  return `${types}
const runeTypeMetaNames = new Set(['key', 'template']);
const runeReferenceMetaNames = new Set(['address', 'reference']);
const runeMetadataNames${metadataNamesType} = { address: 'reference', id: 'externalKey', key: 'externalKey', location: 'scopedKey', reference: 'externalReference', scheme: 'scheme', template: 'template' };
const runeIsMetaValue = (value${unknownType})${typeGuard} =>
  typeof value === 'object' && value !== null && (('value' in value && ('meta' in value || 'reference' in value || 'externalReference' in value || 'globalReference' in value)) || 'reference' in value || 'externalReference' in value || 'globalReference' in value);
const runeNormalizeMetadata = (value${unknownType}, inputKind${typescript ? ': RuneMetadataInputKind' : ''}, targetKind${typescript ? ": 'field' | 'reference'" : ''})${returnType} => {
  if (Array.isArray(value)) return value.map((item) => runeNormalizeMetadata(item, inputKind, targetKind));
  const existing = inputKind !== 'value' && value != null ? value${typescript ? ' as RuneReferenceWithMeta<unknown>' : ''} : undefined;
  const rawValue = existing ? existing.value : value;
  if (targetKind === 'reference') return existing ? { ...existing } : { value: rawValue };
  if (inputKind === 'reference' && rawValue == null) throw new Error('Cannot convert reference metadata to field metadata without a value');
  return { value: rawValue, meta: existing?.meta ?? {} };
};
${prefix}const runeToField = ${typescript ? "<T, S extends RuneMetadataInputKind = 'value'>(value: T, inputKind: S = 'value' as S): RuneToFieldResult<S extends 'value' ? T : RuneUnwrapMeta<T>>" : "(value, inputKind = 'value')"} =>
  runeNormalizeMetadata(value, inputKind, 'field')${normalizerReturn};
${prefix}const runeToReference = ${typescript ? "<T, S extends RuneMetadataInputKind = 'value'>(value: T, inputKind: S = 'value' as S): RuneToReferenceResult<S extends 'value' ? T : RuneUnwrapMeta<T>>" : "(value, inputKind = 'value')"} =>
  runeNormalizeMetadata(value, inputKind, 'reference')${referenceNormalizerReturn};
const runeWithMetaOne = (item${unknownType}, entries${metadataType}, inputKind${typescript ? '?: RuneMetadataInputKind' : ''})${returnType} => {
  const wrapped = inputKind === undefined ? runeIsMetaValue(item) : inputKind !== 'value';
  const existing = wrapped && item != null ? item${typescript ? ' as RuneReferenceWithMeta<unknown>' : ''} : undefined;
  const rawValue = existing ? existing.value : item;
  const typeMeta${metadataValue} = {};
  const fieldMeta${metadataValue} = {};
  const referenceMeta${metadataValue} = {};
  for (const [name, entry] of Object.entries(entries)) {
    const target = runeTypeMetaNames.has(name) ? typeMeta : runeReferenceMetaNames.has(name) ? referenceMeta : fieldMeta;
    target[runeReferenceMetaNames.has(name) ? name : runeMetadataNames[name] || name] = entry;
  }
  const value = Object.keys(typeMeta).length > 0 && rawValue && typeof rawValue === 'object'
    ? { ...${recordValue}, meta: { ...${recordMeta}, ...typeMeta } }
    : rawValue;
  if (Object.keys(referenceMeta).length > 0) {
    const result = existing ? { ...existing, value } : { value };
    for (const [name, entry] of Object.entries(referenceMeta)) {
      if (name === 'address') result.reference = { ...(existing?.reference || {}), reference: entry };
      else result.externalReference = entry;
    }
    if (Object.keys(fieldMeta).length > 0) result.meta = { ...${typescript ? '(existing?.meta ?? {})' : '(existing?.meta || {})'}, ...fieldMeta };
    return result;
  }
  if (Object.keys(fieldMeta).length === 0) return existing ? { ...existing, value } : value;
  return existing ? { ...existing, value, meta: { ...${existingMeta}, ...fieldMeta } } : { value, meta: fieldMeta };
};
${prefix}const runeWithMeta = ${withMetaSignature} => {
  if (Object.keys(entries).length === 0) return value${returnValue};
  return (Array.isArray(value) ? value.map((item) => runeWithMetaOne(item, entries, inputKind)) : runeWithMetaOne(value, entries, inputKind))${returnValue};
};
${prefix}const runeAsKey = ${asKeySignature} => {
  const key = (item${unknownType})${keyResultType} => {
    const candidate = item && typeof item === 'object' ? item${candidateCast} : undefined;
    const nested = inputKind !== 'value' && candidate && candidate.value && typeof candidate.value === 'object' ? candidate.value${nestedCast} : undefined;
    const meta = nested?.meta ?? candidate?.meta;
    const externalReference = meta?.externalKey ?? meta?.id ?? meta?.key ?? candidate?.externalReference;
    const globalReference = meta?.globalKey ?? candidate?.globalReference;
    return {
      ...(externalReference === undefined ? {} : { externalReference }),
      ...(globalReference === undefined ? {} : { globalReference })
    };
  };
  return (Array.isArray(value) ? value.map(key) : key(value))${keyReturn};
};`;
}

/** Structural value view shared by generated TypeScript function modules. */
export function runeFuncDataSource(): string {
  return [
    `type RuneFuncData<T> = T extends readonly (infer I)[]`,
    `  ? RuneFuncData<I>[]`,
    '  : T extends { readonly [Symbol.toStringTag]: `Temporal.${string}` }',
    `    ? string`,
    `    : T extends (...args: never[]) => unknown`,
    `      ? never`,
    `      : T extends object`,
    `        ? { [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: RuneFuncData<T[K]> }`,
    `        : T;`
  ].join('\n');
}
