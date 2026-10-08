// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { AstNode, LangiumDocument } from 'langium';
import type { RosettaExpression } from '@rune-langium/core';
import type { ProjectionSubject } from './types.js';
import type { FieldMetadataKind } from '../expr/metadata-runtime.js';

/** Linked identities and semantic facts shared with the authoritative codegen utilities. */
export interface PythonProjectionContext {
  subject: ProjectionSubject;
  documents: readonly LangiumDocument[];
  self: string;
  locals: ReadonlyMap<AstNode, string>;
  implicit?: { expression: RosettaExpression; name: string; metadata?: FieldMetadataKind };
  name(declaration: AstNode): string;
}
