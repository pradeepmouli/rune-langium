// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * TypeScript class target emitter for the Rune code generator.
 *
 * Entry point: emitNamespace(docs, namespace, options, funcs?) → GeneratorOutput
 *
 * FR-020 (full TS class shape, no Zod dependency), US5B acceptance scenarios 2–5, SC-005.
 * T104–T111 (Phase 8).
 *
 * Produces one *.ts module per namespace containing:
 *   - Inlined RUNTIME_HELPER_SOURCE (no `import { z }` — zero Zod dependency)
 *   - export interface <TypeName>Shape { ... }
 *   - export class <TypeName> implements <TypeName>Shape (or extends Parent)
 *   - static from(json: unknown): <TypeName> factory
 *   - export function is<TypeName>(x: unknown): x is <TypeName> type guard
 *   - export function is<Child>(x: <Parent>): x is <Child> discriminator predicates
 *   - validate<ConditionName>(): { valid: boolean; errors: string[] } instance methods
 *   - // (functions emitted by Phase 8b appear below this line)  [marker for Phase 8b]
 */

import type { LangiumDocument } from 'langium';
import {
  isData,
  isRosettaModel,
  isRosettaEnumeration,
  isRosettaBasicType,
  isData as _isData,
  type Data,
  type Attribute,
  type Condition,
  type RosettaEnumeration,
  type RosettaModel,
  type RosettaCardinality
} from '@rune-langium/core';
import type {
  GeneratorOptions,
  GeneratorOutput,
  SourceMapEntry,
  GeneratorDiagnostic,
  GeneratedFunc
} from '../types.js';
import { buildTypeReferenceGraph, findCyclicTypes } from '../cycle-detector.js';
import { topoSort } from '../topo-sort.js';
import { RUNTIME_HELPER_SOURCE } from '../helpers.js';
import { transpileCondition, type ExpressionTranspilerContext } from '../expr/transpiler.js';

// ---------------------------------------------------------------------------
// Internal emission context
// ---------------------------------------------------------------------------

interface EmissionContext {
  target: 'typescript';
  emitOrder: string[];
  lazyTypes: Set<string>;
  sourceMap: SourceMapEntry[];
  diagnostics: GeneratorDiagnostic[];
  namespace: string;
  dataByName: Map<string, Data>;
  enumByName: Map<string, RosettaEnumeration>;
}

// ---------------------------------------------------------------------------
// Built-in type maps
// ---------------------------------------------------------------------------

/**
 * Maps Rune built-in type names to TypeScript primitive type names.
 * T105.
 */
const TS_TYPE_MAP: Record<string, string> = {
  string: 'string',
  int: 'number',
  number: 'number',
  boolean: 'boolean',
  date: 'string',
  dateTime: 'string',
  zonedDateTime: 'string',
  time: 'string',
  productType: 'string',
  eventType: 'string'
};

/**
 * Maps Rune built-in type names to JS typeof strings.
 * Used for type-guard checks. T108.
 */
const JS_TYPEOF_MAP: Record<string, string> = {
  string: 'string',
  int: 'number',
  number: 'number',
  boolean: 'boolean',
  date: 'string',
  dateTime: 'string',
  zonedDateTime: 'string',
  time: 'string',
  productType: 'string',
  eventType: 'string'
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the TypeScript type expression for an attribute.
 * T105.
 */
function resolveTypeExprAsTs(attr: Attribute, ctx: EmissionContext): string {
  const typeRef = attr.typeCall?.type?.ref;
  const refText = attr.typeCall?.type?.$refText;

  if (!typeRef) {
    if (refText) {
      const builtinTs = TS_TYPE_MAP[refText];
      if (builtinTs) return builtinTs;
      return refText; // data type / enum name
    }
    return 'unknown';
  }

  if (isRosettaBasicType(typeRef)) {
    return TS_TYPE_MAP[typeRef.name] ?? 'unknown';
  }
  if (isRosettaEnumeration(typeRef)) return typeRef.name;
  if (_isData(typeRef)) return typeRef.name;

  if (refText) {
    const builtinTs = TS_TYPE_MAP[refText];
    if (builtinTs) return builtinTs;
  }
  return 'unknown';
}

/**
 * Resolve the JS typeof string for an attribute's base type.
 * Returns undefined when the type is not a scalar (e.g., Data reference).
 * T108.
 */
function resolveTypeofStr(attr: Attribute, _ctx: EmissionContext): string | undefined {
  const typeRef = attr.typeCall?.type?.ref;
  const refText = attr.typeCall?.type?.$refText;

  if (!typeRef) {
    if (refText) return JS_TYPEOF_MAP[refText];
    return undefined;
  }
  if (isRosettaBasicType(typeRef)) {
    return JS_TYPEOF_MAP[typeRef.name];
  }
  // Data / Enum references → not a JS scalar typeof check
  return undefined;
}

/**
 * Apply cardinality to a TypeScript field declaration.
 * T105.
 */
function applyCardinalityTs(card: RosettaCardinality, baseType: string, fieldName: string): string {
  const lower = card.inf;
  const upper = card.unbounded ? null : (card.sup ?? lower);

  if (upper === null) {
    // (lower..*)
    if (lower === 0) return `${fieldName}?: ${baseType}[]`;
    return `${fieldName}: ${baseType}[]`;
  }

  if (upper === 1 && lower === 1) return `${fieldName}: ${baseType}`;
  if (upper === 1 && lower === 0) return `${fieldName}?: ${baseType}`;

  // Array forms (0..0, n..n, n..m)
  return `${fieldName}: ${baseType}[]`;
}

/**
 * Determine whether a cardinality describes an array field.
 */
function isArrayCardinality(card: RosettaCardinality): boolean {
  const lower = card.inf;
  const upper = card.unbounded ? null : (card.sup ?? lower);
  if (upper === null) return true; // (n..*)
  if (upper === 1 && lower === 1) return false; // (1..1) scalar
  if (upper === 1 && lower === 0) return false; // (0..1) optional scalar
  if (upper === 0 && lower === 0) return false; // (0..0) degenerate scalar
  return true; // everything else is array-like
}

/**
 * Determine whether a cardinality is optional (can be absent).
 */
function isOptionalCardinality(card: RosettaCardinality): boolean {
  const lower = card.inf;
  const upper = card.unbounded ? null : (card.sup ?? lower);
  if (upper === null && lower === 0) return true; // (0..*) — present but empty ok
  if (upper === 1 && lower === 0) return true;
  if (upper === 0 && lower === 0) return true;
  return false;
}

// ---------------------------------------------------------------------------
// T105: emitInterface
// ---------------------------------------------------------------------------

/**
 * Emit `export interface <TypeName>Shape { ... }`.
 * For types with a parent in the same namespace, emits `extends <Parent>Shape`.
 * T105.
 */
function emitInterface(data: Data, ctx: EmissionContext): string {
  const name = data.name;
  const interfaceName = `${name}Shape`;

  const parentRef = data.superType?.ref;
  const parentInNamespace =
    parentRef && isData(parentRef) && ctx.dataByName.has((parentRef as Data).name);
  const parentInterfaceName = parentInNamespace ? `${(parentRef as Data).name}Shape` : undefined;

  const header = parentInterfaceName
    ? `export interface ${interfaceName} extends ${parentInterfaceName}`
    : `export interface ${interfaceName}`;

  // Only OWN attributes (parent's are inherited via extends)
  const fields: string[] = [];
  for (const attr of data.attributes) {
    const baseType = resolveTypeExprAsTs(attr, ctx);
    const fieldDecl = applyCardinalityTs(attr.card, baseType, attr.name);
    fields.push(`  ${fieldDecl};`);
  }

  if (fields.length === 0) {
    return `${header} {}`;
  }

  return `${header} {\n${fields.join('\n')}\n}`;
}

// ---------------------------------------------------------------------------
// T106: emitClass
// ---------------------------------------------------------------------------

/**
 * Emit `export class <TypeName> implements <TypeName>Shape` (no parent)
 * or `export class <Child> extends <Parent> implements <Child>Shape` (with parent).
 * Includes instance field declarations and constructor.
 * T106.
 */
function emitClass(data: Data, ctx: EmissionContext): string {
  const name = data.name;
  const interfaceName = `${name}Shape`;
  const parentRef = data.superType?.ref;
  const parentInNamespace =
    parentRef && isData(parentRef) && ctx.dataByName.has((parentRef as Data).name);
  const parentName = parentInNamespace ? (parentRef as Data).name : undefined;

  // Class header
  const classHeader = parentName
    ? `export class ${name} extends ${parentName} implements ${interfaceName}`
    : `export class ${name} implements ${interfaceName}`;

  const lines: string[] = [`${classHeader} {`];

  // Own instance fields (only own — parent fields already declared in parent class)
  for (const attr of data.attributes) {
    const baseType = resolveTypeExprAsTs(attr, ctx);
    const fieldDecl = applyCardinalityTs(attr.card, baseType, attr.name);
    lines.push(`  ${fieldDecl};`);
  }

  // Constructor body lines
  const ctorBodyLines: string[] = [];
  if (parentName) {
    ctorBodyLines.push(`    super(data);`);
  }
  for (const attr of data.attributes) {
    ctorBodyLines.push(`    this.${attr.name} = data.${attr.name} as typeof this.${attr.name};`);
  }

  // Emit compact `constructor(...) {}` when body is empty (oxfmt style).
  // Only add a blank line separator if there are own fields above.
  const hasOwnFields = data.attributes.length > 0;
  if (hasOwnFields) {
    lines.push('');
  }
  if (ctorBodyLines.length === 0) {
    lines.push(`  constructor(data: ${interfaceName}) {}`);
  } else {
    lines.push(`  constructor(data: ${interfaceName}) {`);
    for (const bodyLine of ctorBodyLines) {
      lines.push(bodyLine);
    }
    lines.push('  }');
  }

  // static from factory (T107)
  lines.push('');
  lines.push(emitFromFactory(data, ctx));

  // validate methods (T110)
  const conditions = (data.conditions ?? []).filter((c) => c.expression != null);
  if (conditions.length > 0) {
    lines.push('');
    lines.push(emitValidateMethods(data, ctx));
  }

  lines.push('}');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// T107: emitFromFactory (emitted inline in the class body)
// ---------------------------------------------------------------------------

/**
 * Emit the `static from(json: unknown): <TypeName>` factory method.
 * T107.
 */
function emitFromFactory(data: Data, _ctx: EmissionContext): string {
  const name = data.name;
  return [
    `  static from(json: unknown): ${name} {`,
    `    if (!is${name}(json)) {`,
    `      throw new TypeError('not a ${name}: ' + JSON.stringify(json).slice(0, 100));`,
    `    }`,
    `    return new ${name}(json as ${name}Shape);`,
    `  }`
  ].join('\n');
}

// ---------------------------------------------------------------------------
// T108: emitTypeGuard
// ---------------------------------------------------------------------------

/**
 * Build the field-check lines for a type guard body.
 * Shared between emitTypeGuard and the overload implementation.
 */
function buildTypeGuardChecks(data: Data, ctx: EmissionContext): string[] {
  const lines: string[] = [];
  const obj = 'x';

  // Collect all fields to check including inherited ones (shallow walk — one level)
  const allAttrs: Attribute[] = [];
  const parentRef = data.superType?.ref;
  if (parentRef && isData(parentRef)) {
    const parent = parentRef as Data;
    for (const attr of parent.attributes) {
      allAttrs.push(attr);
    }
  }
  for (const attr of data.attributes) {
    allAttrs.push(attr);
  }

  for (const attr of allAttrs) {
    const card = attr.card;
    const typeofStr = resolveTypeofStr(attr, ctx);
    const isArray = isArrayCardinality(card);
    const isOpt = isOptionalCardinality(card);

    if (isArray) {
      const lower = card.inf;
      if (lower > 0) {
        lines.push(
          `  if (!Array.isArray((${obj} as Record<string, unknown>).${attr.name})) return false;`
        );
      } else {
        lines.push(
          `  if ((${obj} as Record<string, unknown>).${attr.name} !== undefined && !Array.isArray((${obj} as Record<string, unknown>).${attr.name})) return false;`
        );
      }
    } else if (isOpt) {
      if (typeofStr) {
        lines.push(
          `  if ((${obj} as Record<string, unknown>).${attr.name} !== undefined && typeof (${obj} as Record<string, unknown>).${attr.name} !== '${typeofStr}') return false;`
        );
      }
    } else {
      if (typeofStr) {
        lines.push(
          `  if (typeof (${obj} as Record<string, unknown>).${attr.name} !== '${typeofStr}') return false;`
        );
      } else {
        lines.push(
          `  if ((${obj} as Record<string, unknown>).${attr.name} === undefined) return false;`
        );
      }
    }
  }

  return lines;
}

/**
 * Emit `export function is<TypeName>(x: unknown): x is <TypeName>`.
 * When the type has a parent in the same namespace, also emit an overload
 * `export function is<TypeName>(x: <ParentName>): x is <TypeName>` so callers
 * can narrow from the parent type. Both signatures share one implementation body.
 * T108, T109.
 */
function emitTypeGuard(data: Data, ctx: EmissionContext): string {
  const name = data.name;
  const parentRef = data.superType?.ref;
  const parentInNamespace =
    parentRef && isData(parentRef) && ctx.dataByName.has((parentRef as Data).name);
  const parentName = parentInNamespace ? (parentRef as Data).name : undefined;

  const checkLines = buildTypeGuardChecks(data, ctx);

  if (parentName) {
    // Emit function with two overload signatures + one implementation
    const lines: string[] = [
      `export function is${name}(x: unknown): x is ${name};`,
      `export function is${name}(x: ${parentName}): x is ${name};`,
      `export function is${name}(x: unknown): x is ${name} {`,
      `  if (typeof x !== 'object' || x === null) return false;`,
      ...checkLines,
      `  return true;`,
      `}`
    ];
    return lines.join('\n');
  }

  // No parent — simple single-signature type guard
  const lines: string[] = [
    `export function is${name}(x: unknown): x is ${name} {`,
    `  if (typeof x !== 'object' || x === null) return false;`,
    ...checkLines,
    `  return true;`,
    `}`
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// T109: emitDiscriminatorPredicate
// ---------------------------------------------------------------------------

/**
 * Emit `export function is<Child>(x: <Parent>): x is <Child>` discriminator predicate.
 * T109.
 */
function emitDiscriminatorPredicate(child: Data, parent: Data, ctx: EmissionContext): string {
  const childName = child.name;
  const parentName = parent.name;

  // Child-specific fields only
  const childFields = child.attributes;

  if (childFields.length === 0) {
    // No child-specific fields — fall back to full is<Child> guard
    return [
      `export function is${childName}(x: ${parentName}): x is ${childName} {`,
      `  return is${childName}(x as unknown);`,
      `}`
    ].join('\n');
  }

  const checks: string[] = [];
  for (const attr of childFields) {
    const card = attr.card;
    const typeofStr = resolveTypeofStr(attr, ctx);
    const isArray = isArrayCardinality(card);
    const isOpt = isOptionalCardinality(card);
    const obj = '(x as Record<string, unknown>)';

    if (isArray) {
      checks.push(`Array.isArray(${obj}.${attr.name})`);
    } else if (isOpt) {
      if (typeofStr) {
        checks.push(
          `(${obj}.${attr.name} === undefined || typeof ${obj}.${attr.name} === '${typeofStr}')`
        );
      }
    } else {
      if (typeofStr) {
        checks.push(`typeof ${obj}.${attr.name} === '${typeofStr}'`);
      } else {
        checks.push(`${obj}.${attr.name} !== undefined`);
      }
    }
  }

  const condition = checks.length === 0 ? 'true' : checks.join(' && ');

  return [
    `export function is${childName}(x: ${parentName}): x is ${childName} {`,
    `  return ${condition};`,
    `}`
  ].join('\n');
}

// ---------------------------------------------------------------------------
// T110: emitValidateMethods
// ---------------------------------------------------------------------------

/**
 * Build an ExpressionTranspilerContext for ts-method emission.
 */
function buildTsTranspilerContext(
  data: Data,
  conditionName: string,
  ctx: EmissionContext
): ExpressionTranspilerContext {
  const attributeTypes = new Map<string, string>();
  for (const attr of data.attributes) {
    attributeTypes.set(attr.name, attr.typeCall?.type?.$refText ?? 'unknown');
  }
  if (data.superType?.ref) {
    const parent = data.superType.ref;
    if (isData(parent)) {
      for (const attr of (parent as Data).attributes) {
        if (!attributeTypes.has(attr.name)) {
          attributeTypes.set(attr.name, attr.typeCall?.type?.$refText ?? 'unknown');
        }
      }
    }
  }
  return {
    selfName: 'this',
    emitMode: 'ts-method',
    conditionName,
    typeName: data.name,
    attributeTypes,
    diagnostics: ctx.diagnostics
  };
}

/**
 * Emit validate methods for all conditions on a type.
 * T110.
 */
function emitValidateMethods(data: Data, ctx: EmissionContext): string {
  const conditions = (data.conditions ?? []).filter((c) => c.expression != null);
  if (conditions.length === 0) return '';

  const methodBlocks: string[] = [];

  for (const cond of conditions) {
    const condName = cond.name ?? 'Condition';
    const transpilerCtx = buildTsTranspilerContext(data, condName, ctx);
    const body = transpileCondition(cond, transpilerCtx);

    // Indent body lines by 4 spaces (inside class method body)
    const indentedBody = body
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n');

    const method = [
      `  validate${condName}(): { valid: boolean; errors: string[] } {`,
      `    const errors: string[] = [];`,
      indentedBody,
      `    return { valid: errors.length === 0, errors };`,
      `  }`
    ].join('\n');

    methodBlocks.push(method);
  }

  return methodBlocks.join('\n\n');
}

// ---------------------------------------------------------------------------
// T104: emitNamespace
// ---------------------------------------------------------------------------

/**
 * Convert a dot-separated Rune namespace to a file path.
 * e.g., "cdm.base.math" → "cdm/base/math.ts"
 */
function namespaceToPath(namespace: string): string {
  return namespace.replace(/\./g, '/') + '.ts';
}

/**
 * Build the EmissionContext for a set of documents sharing a namespace.
 */
function buildEmissionContext(docs: LangiumDocument[], namespace: string): EmissionContext {
  const dataByName = new Map<string, Data>();
  const enumByName = new Map<string, RosettaEnumeration>();

  for (const doc of docs) {
    const model = doc.parseResult?.value;
    if (!model || !isRosettaModel(model)) continue;

    for (const element of (model as RosettaModel).elements) {
      if (isData(element)) {
        dataByName.set(element.name, element);
      } else if (isRosettaEnumeration(element)) {
        enumByName.set(element.name, element);
      }
    }
  }

  const graph = buildTypeReferenceGraph(docs);
  const lazyTypes = findCyclicTypes(graph);
  const emitOrder = topoSort(graph, lazyTypes);

  return {
    target: 'typescript',
    emitOrder,
    lazyTypes,
    sourceMap: [],
    diagnostics: [],
    namespace,
    dataByName,
    enumByName
  };
}

/**
 * Emit the file header: SPDX, generated comment, inlined runtime helpers.
 * No `import { z } from 'zod'` — zero Zod dependency.
 * T104.
 */
function emitFileHeader(namespace: string, _ctx: EmissionContext): string {
  return [
    `// SPDX-License-Identifier: MIT`,
    `// Generated by @rune-langium/codegen — do not edit`,
    `// Source namespace: ${namespace}`,
    ``,
    RUNTIME_HELPER_SOURCE,
    ``
  ].join('\n');
}

/**
 * Emit the namespace as a single *.ts file.
 *
 * Entry point for the TypeScript class emitter.
 * T104, FR-020, US5B.
 *
 * @param docs    - Langium documents for this namespace.
 * @param namespace - The namespace string.
 * @param _options  - Generator options.
 * @param funcs     - Optional Phase 8b function declarations (defaults to []).
 */
export function emitNamespace(
  docs: LangiumDocument[],
  namespace: string,
  _options: GeneratorOptions,
  funcs: GeneratedFunc[] = []
): GeneratorOutput {
  const ctx = buildEmissionContext(docs, namespace);
  const sections: string[] = [];

  sections.push(emitFileHeader(namespace, ctx));

  // Emit enum types (no class — just a const object + type alias for union)
  const enumNames = Array.from(ctx.enumByName.keys()).sort();
  for (const name of enumNames) {
    const enumNode = ctx.enumByName.get(name)!;
    sections.push(emitEnumDeclaration(enumNode, ctx));
    sections.push('');
  }

  // Emit data types in topological order
  const emittedData = new Set<string>();

  function emitDataType(data: Data): void {
    emittedData.add(data.name);

    // 1. Interface (Shape)
    sections.push(emitInterface(data, ctx));
    sections.push('');

    // 2. Class
    sections.push(emitClass(data, ctx));
    sections.push('');

    // 3. Type guard (includes discriminator overload when there is a parent in namespace)
    sections.push(emitTypeGuard(data, ctx));
    sections.push('');
  }

  for (const typeName of ctx.emitOrder) {
    const data = ctx.dataByName.get(typeName);
    if (!data) continue;
    emitDataType(data);
  }

  // Emit any data types not captured in topo order (defensive)
  const remainingData = Array.from(ctx.dataByName.keys())
    .filter((n) => !emittedData.has(n))
    .sort();
  for (const typeName of remainingData) {
    const data = ctx.dataByName.get(typeName)!;
    emitDataType(data);
  }

  // Phase 8b marker: functions emitted below this line
  if (funcs.length > 0) {
    sections.push('// (functions emitted by Phase 8b appear below this line)');
    for (const func of funcs) {
      sections.push(func.fileContents);
      sections.push('');
    }
  } else {
    sections.push('// (functions emitted by Phase 8b appear below this line)');
  }

  // Remove trailing empty section
  while (sections.length > 0 && sections[sections.length - 1] === '') {
    sections.pop();
  }

  const content = sections.join('\n') + '\n';

  return {
    relativePath: namespaceToPath(namespace),
    content,
    sourceMap: ctx.sourceMap,
    diagnostics: ctx.diagnostics,
    funcs
  };
}

// ---------------------------------------------------------------------------
// Enum declaration for TS target
// ---------------------------------------------------------------------------

/**
 * Emit a TypeScript enum declaration (as a const string union + const object).
 * No Zod dependency.
 */
function emitEnumDeclaration(enumNode: RosettaEnumeration, _ctx: EmissionContext): string {
  const name = enumNode.name;
  const memberNames = enumNode.enumValues.map((v) => v.name);

  if (memberNames.length === 0) {
    return [`export type ${name} = never;`, `export const ${name}Values: ${name}[] = [];`].join(
      '\n'
    );
  }

  const memberLiterals = memberNames.map((m) => `'${m}'`).join(' | ');
  const valuesArr = memberNames.map((m) => `'${m}'`).join(', ');

  const lines: string[] = [
    `export type ${name} = ${memberLiterals};`,
    `export const ${name}Values: ${name}[] = [${valuesArr}];`
  ];

  // Display-name companion if any member has a display name
  const hasDisplayNames = enumNode.enumValues.some((v) => v.display != null);
  if (hasDisplayNames) {
    const displayEntries = enumNode.enumValues.map((v) => {
      const displayName = v.display != null ? v.display : v.name;
      const escaped = displayName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `  ${v.name}: '${escaped}'`;
    });
    lines.push('');
    lines.push(
      `export const ${name}DisplayNames: Record<${name}, string> = {\n${displayEntries.join(',\n')}\n};`
    );
  }

  return lines.join('\n');
}
