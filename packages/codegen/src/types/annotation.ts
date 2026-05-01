// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

export interface AnnotationAttribute {
  name: string;
  typeName: string;
  isList: boolean;
  isOptional: boolean;
}

export interface RuneAnnotationDecl {
  name: string;
  namespace: string;
  prefix?: string;
  attributes: AnnotationAttribute[];
  definition?: string;
}
