// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

export interface RuneReport {
  name: string;
  namespace: string;
  inputTypeName: string;
  reportTypeName: string;
  eligibilityRuleNames: string[];
  timing: string;
  regulatoryBody?: string;
}
