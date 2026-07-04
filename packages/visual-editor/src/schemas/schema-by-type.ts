// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * `$type` → generated Zod schema registry.
 *
 * Shared by the corpus invariant gate (every dehydrated corpus node must
 * `safeParse` against its own `$type`'s schema — the schemas-never-reject-
 * parser-output invariant) and the render gate (`cst-reuse-renderer`'s
 * schema-driven structural-render-vs-CST-fallback decision).
 *
 * Keys cover every `$type` render-core's `renderNode` dispatches on
 * (`rosetta-render-core.ts`) plus the top-level `$type`s the VE's
 * `astToModel` adapter recognizes — the union of both consumers' needs.
 * Completeness against the renderer's dispatch set is enforced by
 * `test/serialize/schema-by-type-exhaustiveness.test.ts`.
 *
 * @module
 */

import type { z } from 'zod';
import {
  DataSchema,
  AttributeSchema,
  ChoiceSchema,
  ChoiceOptionSchema,
  RosettaEnumerationSchema,
  RosettaEnumValueSchema,
  ConditionSchema,
  RosettaFunctionSchema,
  OperationSchema,
  ShortcutDeclarationSchema,
  RosettaTypeAliasSchema,
  TypeParameterSchema,
  AnnotationRefSchema,
  RosettaClassSynonymSchema,
  RosettaSynonymSchema,
  RosettaEnumSynonymSchema,
  RosettaRecordTypeSchema,
  RosettaBasicTypeSchema,
  AnnotationSchema
} from '../generated/zod-schemas.js';

/** Every `$type` this map keys, in the order render-core's dispatcher checks them. */
export const RENDERER_HANDLED_TYPES = [
  'Data',
  'Attribute',
  'Choice',
  'ChoiceOption',
  'RosettaEnumeration',
  'RosettaEnumValue',
  'Condition',
  'RosettaFunction',
  'Operation',
  'ShortcutDeclaration',
  'RosettaTypeAlias',
  'TypeParameter',
  'AnnotationRef',
  'RosettaClassSynonym',
  'RosettaSynonym',
  'RosettaEnumSynonym'
] as const;

/** Top-level `$type`s the VE's `astToModel` adapter recognizes (a subset of the above, plus record/basicType/annotation). */
export const TOP_LEVEL_TYPES = [
  'Data',
  'Choice',
  'RosettaEnumeration',
  'RosettaFunction',
  'RosettaRecordType',
  'RosettaTypeAlias',
  'RosettaBasicType',
  'Annotation'
] as const;

/** `$type` → generated schema, covering every renderer-handled type and every top-level type. */
export const SCHEMA_BY_TYPE: Record<string, z.ZodTypeAny> = {
  Data: DataSchema,
  Attribute: AttributeSchema,
  Choice: ChoiceSchema,
  ChoiceOption: ChoiceOptionSchema,
  RosettaEnumeration: RosettaEnumerationSchema,
  RosettaEnumValue: RosettaEnumValueSchema,
  Condition: ConditionSchema,
  RosettaFunction: RosettaFunctionSchema,
  Operation: OperationSchema,
  ShortcutDeclaration: ShortcutDeclarationSchema,
  RosettaTypeAlias: RosettaTypeAliasSchema,
  TypeParameter: TypeParameterSchema,
  AnnotationRef: AnnotationRefSchema,
  RosettaClassSynonym: RosettaClassSynonymSchema,
  RosettaSynonym: RosettaSynonymSchema,
  RosettaEnumSynonym: RosettaEnumSynonymSchema,
  RosettaRecordType: RosettaRecordTypeSchema,
  RosettaBasicType: RosettaBasicTypeSchema,
  Annotation: AnnotationSchema
};
