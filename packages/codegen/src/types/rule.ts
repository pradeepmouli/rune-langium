// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

export interface RuneRule {
  name: string;
  namespace: string;
  isEligibility: boolean;
  inputTypeName?: string;
  exprNode: unknown;
  identifier?: string;
  definition?: string;
}
