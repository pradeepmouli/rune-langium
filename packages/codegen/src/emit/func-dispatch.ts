// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * The normalized selector carried by a Rune dispatch function overload.
 *
 * The parser stores these as references (`dispatchAttribute` and
 * `dispatchValue`).  Extraction resolves them to names before handing a
 * function to this emitter so that this module stays independent of Langium.
 */
export interface FuncDispatchMetadata {
  name: string;
  dispatchAttribute?: string;
  dispatchValue?: string;
}

export interface FuncDispatchRenderOptions<TFunc extends FuncDispatchMetadata> {
  /** Render the complete exported function signature for the base function. */
  renderSignature: (base: TFunc) => string;
  /** Render the complete body, including its final return, for one variant. */
  renderBody: (func: TFunc) => string | readonly string[];
}

/**
 * Group declarations by their Rune name while retaining source order.
 *
 * A base declaration belongs in the same group as its dispatch overloads.
 * Keeping the grouping here prevents the TS emitter from accidentally
 * emitting duplicate exports for the overload declarations.
 */
export function groupFuncDispatches<TFunc extends FuncDispatchMetadata>(funcs: readonly TFunc[]): TFunc[][] {
  const groups = new Map<string, TFunc[]>();
  for (const func of funcs) {
    const group = groups.get(func.name);
    if (group) group.push(func);
    else groups.set(func.name, [func]);
  }
  return [...groups.values()];
}

function selectorOf<TFunc extends FuncDispatchMetadata>(func: TFunc): string | undefined {
  const hasAttribute = func.dispatchAttribute !== undefined;
  const hasValue = func.dispatchValue !== undefined;
  if (hasAttribute !== hasValue) {
    throw new Error(
      `Invalid dispatch metadata for '${func.name}': dispatchAttribute and dispatchValue must be supplied together`
    );
  }
  if (!hasAttribute) return undefined;
  return `${func.dispatchAttribute}\u0000${func.dispatchValue}`;
}

function bodyLines(body: string | readonly string[]): string[] {
  return typeof body === 'string' ? body.split('\n') : [...body];
}

function indent(lines: readonly string[], spaces: number): string[] {
  const prefix = ' '.repeat(spaces);
  return lines.map((line) => (line.length === 0 ? line : `${prefix}${line}`));
}

function renderBlock<TFunc extends FuncDispatchMetadata>(
  func: TFunc,
  options: FuncDispatchRenderOptions<TFunc>
): string[] {
  return ['{', ...indent(bodyLines(options.renderBody(func)), 2), '}'];
}

/**
 * Render one function group as one executable exported TypeScript function.
 *
 * The first declaration without a selector is the fallback body.  Every
 * selected body is placed in its own block, which preserves the existing
 * body callback's aliases, result accumulator, pre-conditions, assignments,
 * and post-conditions without allowing declarations from one branch to leak
 * into another.  The selector is read by key (`input["kind"]`) so Rune
 * identifiers remain valid even when they need escaping in TypeScript.
 */
export function renderFuncDispatchGroup<TFunc extends FuncDispatchMetadata>(
  group: readonly TFunc[],
  options: FuncDispatchRenderOptions<TFunc>
): string {
  if (group.length === 0) throw new Error('Cannot render an empty function group');

  const base = group.find((func) => selectorOf(func) === undefined);
  if (!base) {
    throw new Error(`Dispatch function '${group[0]!.name}' has no base declaration for fallback behavior`);
  }
  if (group.filter((func) => selectorOf(func) === undefined).length > 1) {
    throw new Error(`Dispatch function '${base.name}' has more than one base declaration`);
  }

  const cases: { func: TFunc; selector: string }[] = [];
  const seenSelectors = new Set<string>();
  for (const func of group) {
    const selector = selectorOf(func);
    if (selector === undefined) continue;
    if (seenSelectors.has(selector)) {
      throw new Error(`Dispatch function '${func.name}' has duplicate selector '${func.dispatchValue}'`);
    }
    seenSelectors.add(selector);
    cases.push({ func, selector });
  }

  const selectorAttribute = cases[0]?.func.dispatchAttribute;
  if (cases.some(({ func }) => func.dispatchAttribute !== selectorAttribute)) {
    throw new Error(`Dispatch function '${base.name}' uses more than one dispatch attribute`);
  }

  const lines = [`${options.renderSignature(base)} {`];
  if (cases.length === 0) {
    lines.push(...indent(renderBlock(base, options), 2));
  } else {
    lines.push(`  switch (input[${JSON.stringify(selectorAttribute)}]) {`);
    for (const { func } of cases) {
      lines.push(`    case ${JSON.stringify(func.dispatchValue)}:`);
      lines.push(...indent(renderBlock(func, options), 6));
    }
    lines.push('    default:');
    lines.push(...indent(renderBlock(base, options), 6));
    lines.push('  }');
  }
  lines.push('}');
  return lines.join('\n');
}

/** Render all declarations, coalescing same-name dispatch overloads. */
export function renderFuncDispatches<TFunc extends FuncDispatchMetadata>(
  funcs: readonly TFunc[],
  options: FuncDispatchRenderOptions<TFunc>
): string[] {
  return groupFuncDispatches(funcs).map((group) => renderFuncDispatchGroup(group, options));
}
