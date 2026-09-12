// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import type { RuneFuncParam } from '../types/func.js';

/** Shared runtime bounds for function arguments, outputs, and nested assignments. */
export function renderCardinalityChecks(
  value: string,
  cardinality: RuneFuncParam['cardinality'],
  many: boolean,
  minimumError: string,
  maximumError: string,
  arraySize = `${value}.length`
): string[] {
  const checks: string[] = [];
  if (cardinality.lower > 0) {
    const missing = many ? `${arraySize} < ${cardinality.lower}` : `${value} == null`;
    checks.push(`if (${missing}) throw new Error(${JSON.stringify(minimumError)});`);
  }
  const excess =
    cardinality.upper === null
      ? undefined
      : many
        ? `${arraySize} > ${cardinality.upper}`
        : cardinality.upper === 0
          ? `${value} != null`
          : undefined;
  if (excess) checks.push(`if (${excess}) throw new Error(${JSON.stringify(maximumError)});`);
  return checks;
}

/** Normalize collection values before checking their declared bounds. */
export function normalizeCardinalityValue(
  value: string,
  cardinality: RuneFuncParam['cardinality'],
  label: string
): string {
  const many = cardinality.upper === null || cardinality.upper > 1;
  if (many) value = `((value) => value == null ? [] : Array.isArray(value) ? value : [value])(${value})`;
  const checks = renderCardinalityChecks(
    'value',
    cardinality,
    many,
    many ? `${label} has too few values` : `${label} requires a value`,
    `${label} has too many values`
  );
  return checks.length ? `((value) => { ${checks.join(' ')} return value; })(${value})` : value;
}
