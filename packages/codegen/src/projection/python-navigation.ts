// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  isAttribute,
  isChoice,
  isChoiceOption,
  isData,
  isRosettaEnumValue,
  isRosettaRecordFeature,
  isRosettaRecordType,
  resolveTypeAliases,
  type RosettaExpression,
  type RosettaType
} from '@rune-langium/core';
import {
  deepFeaturePaths,
  expressionIsMany,
  expressionType,
  featureName,
  typeFeatures,
  typeMatches
} from '../expr/navigation.js';
import { isMetadataFeature, metadataPropertyPath } from '../expr/metadata-runtime.js';
import { expressionMetadataKind, choiceSelection } from '../expr/metadata-type.js';
import { dataSelectionFacts } from '../expr/type-selection.js';
import {
  pythonBind,
  pythonFresh,
  pythonRead,
  pythonUnwrap,
  pythonNormalize,
  pyBool,
  pyString,
  type PythonRenderContext,
  type PythonRender
} from './python-operations.js';

export function pythonCalendarField(feature: unknown, receiver: string, many = false): string | undefined {
  if (
    !isRosettaRecordFeature(feature) ||
    !isRosettaRecordType(feature.$container) ||
    !['date', 'dateTime', 'zonedDateTime'].includes(feature.$container.name)
  )
    return undefined;
  const read = (value: string) =>
    `rune_date_field(${value}, ${pyString(feature.$container.name)}, ${pyString(feature.name)})`;
  return many ? `[child for value in rune_list(${receiver}) for child in rune_list(${read('value')})]` : read(receiver);
}
export function pythonNavigation(
  expression: RosettaExpression,
  context: PythonRenderContext,
  render: PythonRender
): string | undefined {
  if (expression.$type !== 'RosettaFeatureCall' && expression.$type !== 'RosettaDeepFeatureCall') return undefined;
  const feature = expression.feature?.ref;
  if (isRosettaEnumValue(feature)) return pyString(feature.name);
  if (!feature) throw new Error(`Unresolved navigation '${expression.feature?.$refText ?? '?'}'`);
  const calendar = pythonCalendarField(
    feature,
    render(expression.receiver, { ...context, preserveMetadata: false }),
    expressionIsMany(expression.receiver)
  );
  if (calendar) return calendar;
  if (isMetadataFeature(feature))
    return pythonRead(
      render(expression.receiver, { ...context, preserveMetadata: true }),
      metadataPropertyPath('name' in feature ? String(feature.name) : (expression.feature?.$refText ?? '?')),
      expressionIsMany(expression.receiver)
    );
  const name = isChoiceOption(feature)
    ? featureName(feature)
    : 'name' in feature
      ? String(feature.name)
      : (expression.feature?.$refText ?? '?');
  const receiver = render(expression.receiver, { ...context, preserveMetadata: false });
  let result: string;
  if (expression.$type === 'RosettaDeepFeatureCall') {
    const paths = deepFeaturePaths(
      expressionType(expression.receiver),
      name,
      new Set(),
      isAttribute(feature) || isChoiceOption(feature) || isRosettaRecordFeature(feature) ? feature : undefined
    );
    if (!paths.length) throw new Error(`Unresolved deep navigation '${name}'`);
    const root = pythonFresh(context, 'root'),
      many = expressionIsMany(expression);
    const values = paths.map((path) => pythonRead(root, path.map(featureName), many));
    result = pythonBind(
      receiver,
      root,
      many ? `[item for branch in [${values.join(', ')}] for item in branch]` : `rune_coalesce([${values.join(', ')}])`
    );
  } else result = pythonRead(receiver, [name], expressionIsMany(expression.receiver));
  return context.preserveMetadata
    ? result
    : pythonUnwrap(result, expressionMetadataKind(expression), expressionIsMany(expression));
}

export function pythonTypeSelection(value: string, input: RosettaType, target: RosettaType, exact = false) {
  const resolved = resolveTypeAliases(target) ?? target;
  if (isChoice(input)) {
    const selection = choiceSelection(input, resolved, exact);
    if (!selection.paths.length) throw new Error(`Unresolved Choice path from '${input.name}' to '${target.name}'`);
    const branches = selection.paths.map((path) => {
      let result = value;
      path.forEach((step, index) => {
        result = pythonRead(result, [step.name]);
        if (index < path.length - 1) result = pythonUnwrap(result, step.metadataKind);
      });
      return pythonNormalize(result, path[path.length - 1]?.metadataKind, selection.metadataKind);
    });
    const selected = `rune_coalesce([${branches.join(', ')}])`;
    return { selected, guard: `(${selected} is not None)`, metadata: selection.metadataKind, projected: true };
  }
  if (exact && isData(input) && (!isData(resolved) || !typeMatches(resolved, input)))
    throw new Error(`Unresolved exact narrowing from '${input.name}' to '${target.name}'`);
  const required = isData(resolved) ? dataSelectionFacts(resolved, input) : undefined;
  const checks = [`isinstance(${value}, dict)`];
  if (required) {
    checks.push(...required.required.map((name) => `${pyString(name)} in ${value}`));
    if (!required.matches)
      checks.push(
        `(${required.distinguishing.map((name) => `${value}.get(${pyString(name)}) is not None`).join(' or ') || 'False'})`
      );
  } else if (isChoice(resolved)) {
    checks.push(
      `any(${value}.get(key) is not None for key in [${typeFeatures(resolved)
        .map((feature) => pyString(featureName(feature)))
        .join(', ')}])`
    );
  } else throw new Error(`Unresolved object narrowing to '${target.name}'`);
  return { selected: value, guard: `(${checks.join(' and ')})`, metadata: undefined, projected: false };
}

export function pythonOnlyExists(
  expression: RosettaExpression,
  context: PythonRenderContext,
  render: PythonRender
): string | undefined {
  if (expression.$type !== 'RosettaOnlyExistsExpression') return undefined;
  const args = expression.args.length
    ? expression.args
    : expression.argument?.$type === 'ListLiteral'
      ? expression.argument.elements
      : expression.argument
        ? [expression.argument]
        : [];
  if (!args.length) throw new Error('only-exists requires a linked common parent');
  const first = args[0]!,
    parent = first.$type === 'RosettaFeatureCall' ? first.receiver : undefined;
  const value = parent ? render(parent, context) : context.self;
  const allowed = new Set<string>();
  for (const arg of args) {
    if (parent && arg.$type === 'RosettaFeatureCall' && render(arg.receiver, context) === value) {
      const feature = arg.feature?.ref;
      if (!feature) throw new Error('Unresolved only-exists field');
      allowed.add(isChoiceOption(feature) ? featureName(feature) : (arg.feature?.$refText ?? '?'));
    } else if (!parent && arg.$type === 'RosettaSymbolReference') allowed.add(arg.symbol.$refText);
    else throw new Error('only-exists requires a linked common parent');
  }
  const type = parent ? expressionType(parent) : context.implicit?.type;
  const fields = typeFeatures(type);
  if (!fields.length) throw new Error('only-exists requires a linked common parent');
  const names = fields.map(featureName).filter((name) => !allowed.has(name));
  const bound = pythonFresh(context, 'parent');
  return pythonBind(
    value,
    bound,
    names.map((name) => `not rune_exists(${pythonRead(bound, [name])})`).join(' and ') || pyBool(true)
  );
}
