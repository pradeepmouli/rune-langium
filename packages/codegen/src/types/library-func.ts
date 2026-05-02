// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

export interface LibraryFuncParam {
  name: string;
  typeName: string;
  isArray: boolean;
}

export interface RuneLibraryFunc {
  name: string;
  namespace: string;
  parameters: LibraryFuncParam[];
  returnTypeName: string;
  definition?: string;
}
