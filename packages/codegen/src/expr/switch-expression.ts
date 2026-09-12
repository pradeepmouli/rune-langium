// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import {
  isChoice,
  isData,
  isRosettaEnumValue,
  isSwitchOperation,
  type RosettaExpression,
  type RosettaType,
  type SwitchOperation
} from '@rune-langium/core';
import {
  choiceOptionPaths,
  expressionType,
  featureIsRequired,
  featureName,
  renderFeaturePath,
  typeMatches,
  typeFeatures
} from './navigation.js';

export interface SwitchExpressionRenderOptions {
  /** Render an expression, optionally rebinding the implicit `item`. */
  renderExpression: (expression: RosettaExpression, options?: { selfName?: string; projected?: boolean }) => string;
  /** Compare an unwrapped payload while retaining the original selector for branch binding. */
  selector?: { name: string; unwrap: (selector: string) => string };
  /** Report an unsupported or unresolved switch case. */
  report?: (message: string) => void;
  /** Rendering scope used when a switch omits its explicit argument. */
  selfName?: string;
}

function typeName(type: RosettaType | undefined): string {
  return type?.name ?? '?';
}

function referenceName(reference: { $refText?: string; ref?: { name?: string } } | undefined): string | undefined {
  return reference?.ref?.name ?? reference?.$refText;
}

function isObject(value: string): string {
  return `${value} != null && typeof ${value} === 'object' && !Array.isArray(${value})`;
}

function dataGuard(value: string, data: RosettaType, inputType: RosettaType): string {
  const features = typeFeatures(data);
  const required = features.filter(featureIsRequired).map((feature) => JSON.stringify(featureName(feature)));
  const checks = [isObject(value), ...required.map((key) => `${key} in ${value}`)];
  if (!typeMatches(inputType, data)) {
    const inputFields = new Set([
      ...typeFeatures(inputType).map(featureName),
      ...typeFeatures(isData(data) ? data.superType?.ref : undefined).map(featureName)
    ]);
    const distinguishing = features.filter((feature) => !inputFields.has(featureName(feature)));
    checks.push(
      distinguishing.length === 0
        ? 'false'
        : `(${distinguishing
            .map((feature) => {
              const key = JSON.stringify(featureName(feature));
              return `(${key} in ${value} && ${value}[${key}] != null)`;
            })
            .join(' || ')})`
    );
  }
  return checks.join(' && ');
}

function choiceGuard(value: string, choice: RosettaType): string {
  const keys = typeFeatures(choice).map((feature) => JSON.stringify(featureName(feature)));
  if (keys.length === 0) return 'false';
  return `${isObject(value)} && [${keys.map((key) => `${key} in ${value}`).join(', ')}].filter(Boolean).length === 1`;
}

function primitiveSwitch(
  operation: SwitchOperation,
  argument: string,
  options: SwitchExpressionRenderOptions,
  inputType: RosettaType | undefined
): string {
  let fallback = 'undefined';
  const cases: string[] = [];
  for (const currentCase of operation.cases) {
    const branch = options.renderExpression(currentCase.expression, { selfName: options.selector?.name ?? '__sw' });
    if (!currentCase.guard) {
      fallback = branch;
      continue;
    }
    if (currentCase.guard.literalGuard) {
      cases.push(`(__sw === ${options.renderExpression(currentCase.guard.literalGuard)}) ? ${branch}`);
      continue;
    }
    const target = currentCase.guard.referenceGuard?.ref;
    if (isRosettaEnumValue(target)) {
      cases.push(`(__sw === ${JSON.stringify(target.name)}) ? ${branch}`);
      continue;
    }
    const targetName = referenceName(currentCase.guard.referenceGuard);
    // Keep unresolved cross-namespace references executable using the same
    // name comparison as the legacy renderer. Once linking supplies a Data or
    // Choice target, objectSwitch above takes the structural path instead.
    if (targetName !== undefined) {
      cases.push(`(__sw === ${JSON.stringify(targetName)}) ? ${branch}`);
    } else {
      options.report?.(`Unsupported ${typeName(inputType)} switch guard`);
    }
  }
  const chain = cases.reduceRight((acc, currentCase) => `${currentCase} : ${acc}`, fallback);
  return `((__sw) => (${chain}))(${argument})`;
}

function objectSwitch(
  operation: SwitchOperation,
  argument: string,
  inputType: RosettaType,
  options: SwitchExpressionRenderOptions
): string {
  const lines = [`((__sw) => {`, `  if (__sw == null) return undefined;`];
  for (const currentCase of operation.cases) {
    if (!currentCase.guard) continue;
    const target = currentCase.guard.referenceGuard?.ref;
    if (!target || (!isData(target) && !isChoice(target))) {
      const targetName = referenceName(currentCase.guard.referenceGuard);
      if (targetName !== undefined) {
        const branch = options.renderExpression(currentCase.expression, { selfName: '__item' });
        lines.push(`  if (__sw === ${JSON.stringify(targetName)}) {`);
        lines.push(`    const __item = ${options.selector?.name ?? '__sw'};`);
        lines.push(`    return ${branch};`);
        lines.push('  }');
      } else {
        options.report?.(`Unsupported ${typeName(inputType)} switch guard`);
      }
      continue;
    }
    const paths = isChoice(inputType) ? choiceOptionPaths(inputType, target) : [];
    if (isChoice(inputType) && paths.length === 0) {
      options.report?.(`No declared Choice option path from '${inputType.name}' to '${typeName(target)}'`);
      continue;
    }
    const selected = paths.length > 0 ? paths.map((path) => renderFeaturePath('__sw', path)).join(' ?? ') : '__sw';
    const guard =
      paths.length > 0
        ? `${selected} != null`
        : isData(target)
          ? dataGuard('__sw', target, inputType)
          : choiceGuard('__sw', target);
    const projected = paths.length > 0 && paths.every((path) => path.length > 0);
    const branch = options.renderExpression(currentCase.expression, { selfName: '__item', projected });
    lines.push(`  if (${guard}) {`);
    lines.push(`    const __item = ${!projected && options.selector?.name ? options.selector?.name : selected};`);
    lines.push(`    return ${branch};`);
    lines.push('  }');
  }
  const fallbackCase = operation.cases.find((currentCase) => !currentCase.guard);
  lines.push(
    `  return ${fallbackCase ? options.renderExpression(fallbackCase.expression, { selfName: options.selector?.name ?? '__sw' }) : 'undefined'};`
  );
  lines.push(`})(${argument})`);
  return lines.join('\n');
}

/**
 * Render a linked Rune `switch` expression.
 *
 * Choice cases follow declared option paths and bind the selected value to
 * the callback's implicit-variable name. Data cases check required Shape keys
 * and distinguishing subtype fields on plain objects as well as instances.
 * Enum and literal cases retain the compact equality semantics used by the
 * existing expression renderer.
 */
export function renderSwitchExpression(
  expression: RosettaExpression,
  options: SwitchExpressionRenderOptions
): string | undefined {
  if (!isSwitchOperation(expression)) return undefined;
  const argument = expression.argument
    ? options.renderExpression(expression.argument)
    : (options.selfName ?? 'undefined');
  const inputType = expressionType(expression.argument);
  const selector = options.selector ? options.selector.unwrap(options.selector.name) : argument;
  const result =
    inputType && (isChoice(inputType) || isData(inputType))
      ? objectSwitch(expression, selector, inputType, options)
      : primitiveSwitch(expression, selector, options, inputType);
  return options.selector ? `((${options.selector.name}) => (${result}))(${argument})` : result;
}
