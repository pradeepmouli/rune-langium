// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { FieldConfig } from '@zod-to-form/core';

/** Section layout includes inherited AST properties and editor-only comments. */
export const editorSections = new Map([
  ['AnnotationSection', ['annotations']],
  ['ConditionSection', ['conditions', 'postConditions']],
  ['MetadataSection', ['definition', 'comments', 'synonyms']]
]);

/** Generated forms consume the same section assignments as the Inspector. */
export const editorSectionFields: Record<string, FieldConfig> = Object.fromEntries(
  Array.from(editorSections, ([section, fields]) => fields.map((field) => [field, { section }])).flat()
);
