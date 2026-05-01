// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

export interface Condition {
  name?: string;
  expression?: unknown;
}

export interface TypeParam {
  name: string;
  typeName: string;
}

export interface RuneTypeAlias {
  name: string;
  namespace: string;
  targetTypeName: string;
  targetKind: 'primitive' | 'enum' | 'data' | 'alias';
  conditions: Condition[];
  parameters: TypeParam[];
  definition?: string;
}
