// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli
import {
  getOperationArgument,
  resolveOperationType,
  isAttribute,
  isChoice,
  isChoiceOption,
  isData,
  isRosettaRecordFeature,
  isRosettaRecordType,
  isRosettaTypeAlias,
  isRosettaSymbolReference,
  isRosettaFeatureCall,
  isRosettaDeepFeatureCall,
  isRosettaConstructorExpression,
  isRosettaFunction,
  isRosettaEnumValue,
  isShortcutDeclaration,
  isRosettaOnlyElement,
  isRosettaConditionalExpression,
  isDefaultOperation,
  isInlineFunction,
  isFilterOperation,
  isMapOperation,
  isSortOperation,
  isReverseOperation,
  isDistinctOperation,
  isFlattenOperation,
  isListLiteral,
  isThenOperation,
  isSwitchOperation,
  type RosettaDeepFeatureCall,
  type RosettaExpression,
  type RosettaType,
  type TypeCall,
  type Attribute,
  type ChoiceOption,
  type RosettaRecordFeature,
  type Choice
} from '@rune-langium/core';
import { choiceOptionFieldName } from '../emit/base-namespace-emitter.js';
import { functionOutput } from '../types/func.js';

type Feature = Attribute | ChoiceOption | RosettaRecordFeature;

export function resolveType(call: TypeCall | undefined, seen: Set<RosettaType> = new Set()): RosettaType | undefined {
  const type = call?.type?.ref;
  if (!type || seen.has(type)) return undefined;
  if (!isRosettaTypeAlias(type)) return type;
  seen.add(type);
  return resolveType(type.typeCall, seen);
}

function featureIsMany(feature: Feature | undefined): boolean {
  const card = feature && 'card' in feature ? feature.card : undefined;
  return card?.unbounded === true || (card?.sup ?? 1) > 1;
}

function featureMatches(candidate: Feature, target: Feature): boolean {
  if (candidate === target) return true;
  if (featureName(candidate) !== featureName(target)) return false;
  const candidateType = resolveType(candidate.typeCall);
  const targetType = resolveType(target.typeCall);
  if (candidateType?.name !== targetType?.name) return false;
  const candidateCard = 'card' in candidate ? candidate.card : undefined;
  const targetCard = 'card' in target ? target.card : undefined;
  return (
    candidateCard?.inf === targetCard?.inf &&
    candidateCard?.sup === targetCard?.sup &&
    candidateCard?.unbounded === targetCard?.unbounded
  );
}

function choiceOptionType(
  choice: Choice,
  optionName: string,
  seen: Set<RosettaType> = new Set()
): RosettaType | undefined {
  if (seen.has(choice)) return undefined;
  const nextSeen = new Set(seen).add(choice);
  const wanted = choiceOptionFieldName(optionName.split('.').pop()!);
  for (const feature of typeFeatures(choice)) {
    const featureType = resolveType(feature.typeCall);
    if (featureName(feature) === wanted && featureType) return featureType;
    if (isChoice(featureType)) {
      const nested = choiceOptionType(featureType, optionName, nextSeen);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function featureIsRequired(feature: Feature): boolean {
  const card = 'card' in feature ? feature.card : undefined;
  return card?.inf !== undefined && card.inf > 0;
}

/** Whether evaluating an expression can produce a collection. */
export function expressionIsMany(expr: RosettaExpression | undefined): boolean {
  if (!expr) return false;
  if (isRosettaOnlyElement(expr)) return false;
  if (
    isFilterOperation(expr) ||
    isMapOperation(expr) ||
    isSortOperation(expr) ||
    isReverseOperation(expr) ||
    isDistinctOperation(expr) ||
    isFlattenOperation(expr) ||
    isListLiteral(expr)
  )
    return true;
  if (isRosettaDeepFeatureCall(expr)) {
    return expressionIsMany(expr.receiver) || deepNavigationPaths(expr).some((path) => path.some(featureIsMany));
  }
  if (isRosettaFeatureCall(expr)) {
    return featureIsMany(expr.feature?.ref as Feature | undefined) || expressionIsMany(expr.receiver);
  }
  if (isRosettaSymbolReference(expr)) {
    const ref = expr.symbol?.ref;
    if (isRosettaFunction(ref)) return featureIsMany(functionOutput(ref));
    if (isShortcutDeclaration(ref)) return expressionIsMany(ref.expression);
    return featureIsMany(ref as Feature | undefined);
  }
  if (isThenOperation(expr)) {
    return expr.function ? expressionIsMany(expr.function.body) : expressionIsMany(expr.argument);
  }
  if (isRosettaConditionalExpression(expr)) return expressionIsMany(expr.ifthen) || expressionIsMany(expr.elsethen);
  if (isDefaultOperation(expr)) return expressionIsMany(expr.left) || expressionIsMany(expr.right);
  if (isSwitchOperation(expr))
    return expr.cases.some(
      (branch) =>
        !(isListLiteral(branch.expression) && branch.expression.elements.length === 0) &&
        expressionIsMany(branch.expression)
    );
  return false;
}

export function expressionType(expr: RosettaExpression | undefined): RosettaType | undefined {
  if (!expr) return undefined;
  if (isRosettaConstructorExpression(expr)) return expressionType(expr.typeRef);
  if (isRosettaSymbolReference(expr)) {
    const ref = expr.symbol?.ref;
    if (isData(ref) || isChoice(ref) || isRosettaRecordType(ref)) return ref;
    if (isAttribute(ref) || isChoiceOption(ref) || isRosettaRecordFeature(ref)) return resolveType(ref.typeCall);
    if (isRosettaFunction(ref)) return resolveType(functionOutput(ref)?.typeCall);
    if (isShortcutDeclaration(ref)) return expressionType(ref.expression);
  }
  if (expr.$type === 'RosettaImplicitVariable') {
    // `item` is commonly wrapped by one or more feature calls before it is
    // consumed. Walk the linked containment chain to recover the switch case
    // type instead of relying on the immediate container shape.
    const visited = new Set<object>();
    let owner: unknown = expr.$container;
    while (owner && typeof owner === 'object' && !visited.has(owner)) {
      visited.add(owner);
      if ((owner as { $type?: string }).$type === 'SwitchCaseOrDefault') {
        const target = (owner as { guard?: { referenceGuard?: { ref?: unknown } } }).guard?.referenceGuard?.ref;
        if (isData(target) || isChoice(target)) return target;
        // A bare Choice option can be shadowed by an enum value with the same
        // spelling (for example `Index`). Recover the declared option type
        // from the switch argument rather than treating that link as final.
        const operation = (owner as { $container?: unknown }).$container;
        if (isSwitchOperation(operation)) {
          const input = expressionType(operation.argument);
          const targetName =
            (target && typeof target === 'object' && 'name' in target && typeof target.name === 'string'
              ? target.name
              : undefined) ??
            operation.cases.find((currentCase) => currentCase.guard?.referenceGuard?.ref === target)?.guard
              ?.referenceGuard?.$refText;
          if (isChoice(input) && targetName) {
            const optionType = choiceOptionType(input, targetName);
            if (isData(optionType) || isChoice(optionType)) return optionType;
          }
        }
      }
      if (isInlineFunction(owner)) {
        const parent = owner.$container;
        if (parent && typeof parent === 'object' && 'argument' in parent) {
          return expressionType(getOperationArgument(parent));
        }
      }
      owner = (owner as { $container?: unknown }).$container;
    }
  }
  if (isRosettaFeatureCall(expr) || isRosettaDeepFeatureCall(expr)) {
    const ref = expr.feature?.ref;
    if (isAttribute(ref) || isChoiceOption(ref) || isRosettaRecordFeature(ref)) return resolveType(ref.typeCall);
  }
  return resolveOperationType(expr, expressionType);
}

export function typeFeatures(type: RosettaType | undefined, seen: Set<RosettaType> = new Set()): Feature[] {
  if (!type || seen.has(type)) return [];
  seen.add(type);
  if (isRosettaRecordType(type)) return type.features;
  if (isChoice(type)) return type.attributes;
  if (!isData(type)) return [];
  const inherited = typeFeatures(type.superType?.ref, seen);
  return [...new Map([...inherited, ...type.attributes].map((feature) => [featureName(feature), feature])).values()];
}

export function featureName(feature: Feature): string {
  if (!isChoiceOption(feature)) return feature.name;
  const typeRef = feature.typeCall.type;
  const typeName = typeRef.ref?.name ?? typeRef.$refText ?? '?';
  return choiceOptionFieldName(typeName.split('.').pop()!);
}

export function deepFeaturePaths(
  type: RosettaType | undefined,
  name: string,
  seen: Set<RosettaType> = new Set(),
  target?: Feature
): Feature[][] {
  if (!type || seen.has(type)) return [];
  const features = typeFeatures(type);
  const direct = features.filter(
    (feature) => featureName(feature) === name && (!target || featureMatches(feature, target))
  );
  if (direct.length > 0) return direct.map((feature) => [feature]);
  const nextSeen = new Set(seen).add(type);
  const paths = features.flatMap((feature) =>
    deepFeaturePaths(resolveType(feature.typeCall), name, nextSeen, target).map((path) => [feature, ...path])
  );
  return [...new Map(paths.map((path) => [path.map(featureName).join('\u0000'), path])).values()];
}

function deepNavigationPaths(expr: RosettaDeepFeatureCall): Feature[][] {
  const feature = expr.feature?.ref;
  const target =
    isAttribute(feature) || isChoiceOption(feature) || isRosettaRecordFeature(feature) ? feature : undefined;
  const name = target ? featureName(target) : expr.feature?.$refText;
  return name ? deepFeaturePaths(expressionType(expr.receiver), name, new Set(), target) : [];
}

export function typeMatches(
  candidate: RosettaType | undefined,
  goal: RosettaType,
  seen = new Set<RosettaType>()
): boolean {
  if (!candidate || seen.has(candidate)) return false;
  if (candidate === goal) return true;
  seen.add(candidate);
  return isData(candidate) && typeMatches(candidate.superType?.ref, goal, seen);
}

/** Find paths from a Choice's declared option keys to a guarded type. */
export function choiceOptionPaths(choice: Choice, goal: RosettaType): string[][] {
  const paths: string[][] = [];
  const visit = (type: RosettaType | undefined, prefix: string[], seen: Set<RosettaType>): void => {
    if (!type || seen.has(type)) return;
    const nextSeen = new Set(seen).add(type);
    for (const feature of typeFeatures(type)) {
      const featureType = resolveType(feature.typeCall);
      if (!featureType) continue;
      const path = [...prefix, featureName(feature)];
      if (typeMatches(featureType, goal)) paths.push(path);
      // Choice dispatch follows only declared Choice option links. Walking
      // arbitrary Data fields turns a type guard into unrelated deep paths.
      if (isChoice(featureType)) visit(featureType, path, nextSeen);
    }
  };
  if (typeMatches(choice, goal)) paths.push([]);
  visit(choice, [], new Set());
  return [...new Map(paths.map((path) => [path.join('\u0000'), path])).values()];
}

/** Project a path while retaining TypeScript's union narrowing at each choice arm. */
export function renderFeaturePath(receiver: string, path: readonly string[], many = false): string {
  if (path.length === 0) return receiver;
  // Keep the emitted expression linear in the path length. Each step is
  // wrapped once; the previous implementation recursively rendered the
  // suffix in both object and array branches, which was exponential for
  // deeply nested corpus paths.
  let result = receiver;
  for (const key of path) {
    const field = JSON.stringify(key);
    const access = `__value != null && (typeof __value === 'object' || typeof __value === 'function') && ${field} in __value ? __value[${field}] : undefined`;
    if (!many) {
      result = `((__value) => ${access})(${result})`;
      continue;
    }
    const arrayAccess = `__value.flatMap((__item) => { const __next = ${access.replace(/__value/g, '__item')}; return __next == null ? [] : Array.isArray(__next) ? __next : [__next]; })`;
    const scalarAccess = `(() => { const __next = ${access}; return __next == null ? [] : Array.isArray(__next) ? __next : [__next]; })()`;
    result = `((__value) => Array.isArray(__value) ? ${arrayAccess} : ${scalarAccess})(${result})`;
  }
  return result;
}

export function renderNavigation(
  expr: RosettaExpression,
  render: (expr: RosettaExpression) => string
): string | undefined {
  if (!isRosettaFeatureCall(expr) && !isRosettaDeepFeatureCall(expr)) return undefined;
  const feature = expr.feature?.ref;
  if (isRosettaEnumValue(feature)) return JSON.stringify(feature.name);
  const name = isChoiceOption(feature)
    ? featureName(feature)
    : (expr.feature?.$refText ?? (feature && 'name' in feature ? feature.name : undefined));
  if (!name || !expr.receiver) return undefined;
  const receiver = render(expr.receiver);
  if (isRosettaDeepFeatureCall(expr)) {
    const paths = deepNavigationPaths(expr);
    if (paths.length === 0) return undefined;
    const many = expressionIsMany(expr);
    const projections = paths.map((path) => renderFeaturePath('__root', path.map(featureName), many));
    const projected = many ? `[${projections.map((value) => `...${value}`).join(', ')}]` : projections.join(' ?? ');
    return `((__root) => ${projected})(${receiver})`;
  }
  if (isChoice(expressionType(expr.receiver)) || expressionIsMany(expr.receiver)) {
    return renderFeaturePath(receiver, [name], expressionIsMany(expr));
  }
  return `${receiver}?.${name}`;
}
