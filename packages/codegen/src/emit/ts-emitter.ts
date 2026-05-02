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
  isRosettaTypeAlias,
  isRosettaRule,
  isRosettaReport,
  isAnnotation,
  isRosettaExternalFunction,
  type Data,
  type Attribute,
  type Condition,
  type RosettaEnumeration,
  type RosettaModel,
  type RosettaCardinality,
  type RosettaTypeAlias,
  type RosettaRule,
  type RosettaReport,
  type Annotation,
  type RosettaExternalFunction
} from '@rune-langium/core';
import type {
  GeneratorOptions,
  GeneratorOutput,
  SourceMapEntry,
  GeneratorDiagnostic,
  GeneratedFunc
} from '../types.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import { resolveImportPath } from './namespace-registry.js';
import { buildTypeReferenceGraph, findCyclicTypes } from '../cycle-detector.js';
import { topoSort } from '../topo-sort.js';
import { RUNTIME_HELPER_SOURCE } from '../helpers.js';
import {
  transpileCondition,
  transpileExpression,
  type ExpressionTranspilerContext
} from '../expr/transpiler.js';
import {
  extractFuncs,
  buildFuncCallGraph,
  findCyclicFuncs,
  topoSortFuncs,
  resolveFuncTypeTs,
  type RuneFunc,
  type RuneFuncAssignment,
  type RuneFuncAlias,
  type FuncBodyContext
} from '../types/func.js';

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
  typeAliasByName: Map<string, RosettaTypeAlias>;
  rulesByName: Map<string, RosettaRule>;
  reportsByName: Map<string, RosettaReport>;
  annotationsByName: Map<string, Annotation>;
  libraryFuncsByName: Map<string, RosettaExternalFunction>;
  registry: NamespaceRegistry;
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
 * Get the namespace string for an AST element by inspecting its $container.
 * Returns undefined when the element is not directly inside a RosettaModel.
 */
function getElementNamespace(element: { $container?: unknown }): string | undefined {
  const container = element.$container;
  if (!container || typeof container !== 'object') return undefined;
  const model = container as { name?: unknown; $type?: string };
  if (model.$type !== 'RosettaModel') return undefined;
  const name = model.name;
  if (typeof name === 'string') return name.replace(/^"|"$/g, '');
  if (name && typeof name === 'object' && 'segments' in name) {
    return (name as { segments: string[] }).segments.join('.');
  }
  return String(name ?? '');
}

/**
 * Collect cross-namespace import statements needed for the types and aliases
 * defined in this emission context.
 *
 * Walks all Data superType references and attribute type references, plus
 * TypeAlias type references. Any resolved reference whose namespace differs
 * from `ctx.namespace` is recorded and emitted as an ES import statement.
 */
function collectCrossNamespaceImports(ctx: EmissionContext): string[] {
  const imports = new Map<string, Set<string>>(); // namespace -> symbol names

  function trackRef(typeRef: unknown, symbolName: string): void {
    if (!typeRef || typeof typeRef !== 'object') return;
    const ns = getElementNamespace(typeRef as { $container?: unknown });
    if (!ns || ns === ctx.namespace) return;

    let symbols = imports.get(ns);
    if (!symbols) {
      symbols = new Set();
      imports.set(ns, symbols);
    }
    symbols.add(symbolName);
  }

  // Check data type inheritance and attribute references
  for (const data of ctx.dataByName.values()) {
    // Check superType
    const parentRef = data.superType?.ref;
    if (parentRef) {
      trackRef(parentRef, `${parentRef.name}Shape`);
      trackRef(parentRef, parentRef.name);
    }
    // Check attribute types
    for (const attr of data.attributes) {
      const attrTypeRef = attr.typeCall?.type?.ref;
      if (attrTypeRef && isData(attrTypeRef)) {
        trackRef(attrTypeRef, attrTypeRef.name);
      } else if (attrTypeRef && isRosettaEnumeration(attrTypeRef)) {
        trackRef(attrTypeRef, attrTypeRef.name);
      }
    }
  }

  // Check type alias references
  for (const alias of ctx.typeAliasByName.values()) {
    const typeRef = alias.typeCall?.type?.ref;
    if (typeRef && isData(typeRef)) {
      trackRef(typeRef, `${typeRef.name}Shape`);
    } else if (typeRef && isRosettaEnumeration(typeRef)) {
      trackRef(typeRef, typeRef.name);
    }
  }

  // Build import statements
  const lines: string[] = [];
  const sortedNamespaces = Array.from(imports.keys()).sort();
  for (const ns of sortedNamespaces) {
    const symbols = Array.from(imports.get(ns)!).sort();
    const importPath = resolveImportPath(ctx.namespace, ns, ctx.registry);
    lines.push(`import { ${symbols.join(', ')} } from '${importPath}.js';`);
  }

  return lines;
}

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
// Report metadata emission (Phase 9, US5)
// ---------------------------------------------------------------------------

/**
 * Emit a `runeReportRules` const object summarising all rules in this namespace.
 * Since Rune report declarations require full regulatory-body infrastructure that
 * may not be present in isolated fixtures, this simplified form aggregates the
 * rules themselves and annotates them with kind + input type so downstream
 * tooling can identify eligibility vs. reporting rules and the type they operate
 * on.  A namespace with no rules produces an empty string.
 */
function emitReportMetadata(ctx: EmissionContext): string {
  const ruleNames = Array.from(ctx.rulesByName.keys()).sort();
  if (ruleNames.length === 0) return '';

  const lines: string[] = [];
  lines.push('export const runeReportRules = {');
  for (const name of ruleNames) {
    const rule = ctx.rulesByName.get(name)!;
    const kind = rule.eligibility ? 'eligibility' : 'reporting';
    const inputRef = rule.input?.type?.ref;
    const inputName = inputRef ? inputRef.name : 'unknown';
    lines.push(`  '${name}': { kind: '${kind}' as const, inputType: '${inputName}' },`);
  }
  lines.push('} as const;');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Rule emission
// ---------------------------------------------------------------------------

/**
 * Emit a standalone rule function for a RosettaRule.
 *
 * Eligibility rules → `export function validate<Name>(...): boolean`
 * Extraction rules → `export function extract<Name>(...): unknown`
 */
function emitRule(rule: RosettaRule, ctx: EmissionContext): string {
  const name = rule.name;
  const inputTypeRef = rule.input?.type?.ref;
  const inputTypeName = inputTypeRef ? inputTypeRef.name : undefined;
  const paramType = inputTypeName ? `${inputTypeName}Shape` : 'Record<string, unknown>';
  const paramName = inputTypeName
    ? inputTypeName.charAt(0).toLowerCase() + inputTypeName.slice(1)
    : 'input';

  const attributeTypes = new Map<string, string>();
  if (inputTypeRef && isData(inputTypeRef)) {
    for (const attr of inputTypeRef.attributes) {
      const attrType = resolveTypeExprAsTs(attr, ctx);
      attributeTypes.set(attr.name, attrType);
    }
  }

  const transpilerCtx: ExpressionTranspilerContext = {
    selfName: paramName,
    emitMode: 'ts-method',
    conditionName: name,
    typeName: inputTypeName ?? name,
    attributeTypes,
    diagnostics: ctx.diagnostics
  };

  const exprStr = transpileExpression(rule.expression as any, transpilerCtx);

  if (rule.eligibility) {
    return `export function validate${name}(${paramName}: ${paramType}): boolean {\n  return ${exprStr};\n}`;
  } else {
    return `export function extract${name}(${paramName}: ${paramType}): unknown {\n  return ${exprStr};\n}`;
  }
}

// ---------------------------------------------------------------------------
// Phase 8b: Func emission helpers (T120–T126)
// ---------------------------------------------------------------------------

/**
 * Build the TypeScript input object type for a func's input parameters.
 * e.g., { a: number; b: number } for two int inputs.
 * T120, FR-028.
 */
function buildFuncInputType(func: RuneFunc): string {
  if (func.inputs.length === 0) return 'Record<string, never>';
  const fields = func.inputs
    .map((p) => {
      const tsType = resolveFuncTypeTs(p.typeName);
      const isArray = p.cardinality.upper === null || p.cardinality.upper > 1;
      const isOpt = p.cardinality.lower === 0;
      if (isArray) {
        return isOpt ? `${p.name}?: ${tsType}[]` : `${p.name}: ${tsType}[]`;
      }
      return isOpt ? `${p.name}?: ${tsType}` : `${p.name}: ${tsType}`;
    })
    .join('; ');
  return `{ ${fields} }`;
}

/**
 * Build the TypeScript return type for a func's output parameter.
 * T120, FR-028.
 */
function buildFuncOutputType(func: RuneFunc): string {
  const tsType = resolveFuncTypeTs(func.output.typeName);
  const isArray = func.output.cardinality.upper === null || func.output.cardinality.upper > 1;
  return isArray ? `${tsType}[]` : tsType;
}

/**
 * Build a FuncBodyContext for the given func.
 * selfName = 'input' so that RosettaSymbolReference to input attrs emits as `input.<attr>`.
 * T120–T124.
 */
function buildFuncBodyContext(
  func: RuneFunc,
  callGraph: Map<string, Set<string>>,
  diagnostics: GeneratorDiagnostic[]
): FuncBodyContext {
  const isArray = func.output.cardinality.upper === null || func.output.cardinality.upper > 1;

  // Build alias bindings: alias name → emitted local variable name
  const inputNames = new Set(func.inputs.map((p) => p.name));
  const aliasBindings = new Map<string, string>();
  for (const alias of func.aliases) {
    const localName = inputNames.has(alias.name) ? `${alias.name}_alias` : alias.name;
    aliasBindings.set(alias.name, localName);
  }

  // Build attributeTypes for condition validation (inputs + output)
  const attributeTypes = new Map<string, string>();
  for (const p of func.inputs) {
    attributeTypes.set(p.name, p.typeName);
  }
  attributeTypes.set(func.output.name, func.output.typeName);

  return {
    selfName: 'input',
    emitMode: 'ts-method',
    conditionName: func.name,
    typeName: func.name,
    attributeTypes,
    diagnostics,
    localBindings: aliasBindings,
    currentFunc: func,
    outputAccumulator: isArray ? 'array' : 'scalar',
    aliasBindings,
    callGraph
  };
}

/**
 * T120: Emit a single set or add assignment statement.
 *
 * set → `result = <expr>;`
 * add → `result.push(<expr>);`
 */
function emitFuncSet(assignment: RuneFuncAssignment, ctx: FuncBodyContext): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exprStr = transpileExpression(assignment.exprNode as any, ctx);
  if (assignment.kind === 'add') {
    return `  result.push(${exprStr});`;
  }
  return `  result = ${exprStr};`;
}

/**
 * T121: Emit a single alias (shortcut) binding.
 *
 * `const <localName> = <expr>;`
 */
function emitFuncAlias(alias: RuneFuncAlias, ctx: FuncBodyContext): string {
  const localName = ctx.aliasBindings.get(alias.name) ?? alias.name;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exprStr = transpileExpression(alias.exprNode as any, ctx);
  return `  const ${localName} = ${exprStr};`;
}

/**
 * T122: Emit pre-condition validation checks at function entry.
 *
 * Each condition: `if (!(<predicate>)) throw new Error('Diagnostic: <condName> failed');`
 */
function emitFuncPreConditions(func: RuneFunc, ctx: FuncBodyContext): string[] {
  const lines: string[] = [];
  for (const cond of func.preConditions) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const condNode = cond as any;
    const condName = condNode.name ?? func.name;
    const condCtx: ExpressionTranspilerContext = {
      ...ctx,
      conditionName: condName,
      typeName: func.name,
      emitMode: 'ts-method'
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = transpileCondition(cond as any, condCtx);
    // transpileCondition in ts-method mode returns if(!…) { errors.push(…); }
    // We need to convert this to a throw form.
    // Replace `errors.push('...')` with `throw new Error('Diagnostic: ...')`
    const throwForm = body
      .replace(/errors\.push\('(.+?)'\);/g, `throw new Error('Diagnostic: $1');`)
      .replace(/if \(!/g, 'if (!')
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    lines.push(throwForm);
  }
  return lines;
}

/**
 * T123: Emit post-condition validation checks before return.
 * Same shape as pre-conditions.
 */
function emitFuncPostConditions(func: RuneFunc, ctx: FuncBodyContext): string[] {
  const lines: string[] = [];
  for (const cond of func.postConditions) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const condNode = cond as any;
    const condName = condNode.name ?? func.name;
    const condCtx: ExpressionTranspilerContext = {
      ...ctx,
      conditionName: condName,
      typeName: func.name,
      emitMode: 'ts-method'
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = transpileCondition(cond as any, condCtx);
    const throwForm = body
      .replace(/errors\.push\('(.+?)'\);/g, `throw new Error('Diagnostic: $1');`)
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    lines.push(throwForm);
  }
  return lines;
}

/**
 * T124: Compose the complete function body.
 *
 * For concrete funcs:
 *   let result: T;    (scalar) | const result: T[] = [];  (array)
 *   <preConditions>
 *   <aliases>
 *   <assignments>
 *   <postConditions>
 *   return result;
 *
 * For abstract funcs (isAbstract: true):
 *   <preConditions>
 *   throw new Error('Diagnostic: <name> — not_implemented');
 */
function emitFuncBody(func: RuneFunc, ctx: FuncBodyContext): string[] {
  const bodyLines: string[] = [];

  if (func.isAbstract) {
    // Pre-conditions still run before the throw
    const preConds = emitFuncPreConditions(func, ctx);
    for (const block of preConds) {
      bodyLines.push(block);
    }
    bodyLines.push(`  throw new Error('Diagnostic: ${func.name} — not_implemented');`);
    // Emit info diagnostic for abstract func (FR-032)
    ctx.diagnostics.push({
      severity: 'info',
      code: 'abstract-func',
      message: `Func '${func.name}' is abstract (no body). Add a set/add body to implement it.`
    });
    return bodyLines;
  }

  // Result variable declaration
  const outputTs = resolveFuncTypeTs(func.output.typeName);
  if (ctx.outputAccumulator === 'array') {
    bodyLines.push(`  const result: ${outputTs}[] = [];`);
  } else {
    bodyLines.push(`  let result: ${outputTs};`);
  }

  // Pre-conditions at entry
  const preConds = emitFuncPreConditions(func, ctx);
  for (const block of preConds) {
    bodyLines.push(block);
  }

  // Aliases
  for (const alias of func.aliases) {
    bodyLines.push(emitFuncAlias(alias, ctx));
  }

  // Assignments
  for (const assignment of func.assignments) {
    bodyLines.push(emitFuncSet(assignment, ctx));
  }

  // Post-conditions before return
  const postConds = emitFuncPostConditions(func, ctx);
  for (const block of postConds) {
    bodyLines.push(block);
  }

  bodyLines.push(`  return result;`);

  return bodyLines;
}

/**
 * Emit a single func as a TypeScript function declaration.
 *
 * For non-cyclic funcs: `export function F(input: {...}): T { ... }`
 * For cyclic funcs (hoisted): same syntax — `function` declarations are
 * hoisted by JS runtime, satisfying FR-030 for cyclic call groups.
 *
 * T124, T126, FR-028, FR-030.
 */
function emitFunc(func: RuneFunc, ctx: FuncBodyContext, _isHoisted: boolean): string {
  const inputType = buildFuncInputType(func);
  const outputType = buildFuncOutputType(func);
  const signature = `export function ${func.name}(input: ${inputType}): ${outputType}`;

  const bodyLines = emitFuncBody(func, ctx);
  const body = bodyLines.join('\n');

  return `${signature} {\n${body}\n}`;
}

// ---------------------------------------------------------------------------
// Library function emission (Phase 10, US6)
// ---------------------------------------------------------------------------

/**
 * Emit a TypeScript callable-type alias for a Rune library function declaration.
 *
 * Library functions are external (native) implementations — we emit a *type*
 * rather than a function body so consumers can type-check call sites without
 * requiring an implementation stub at codegen time.
 *
 * e.g.:
 *   library function Sum(values number[]) number
 * becomes:
 *   export type Sum = (values: number[]) => number;
 */
function emitLibraryFunc(func: RosettaExternalFunction, ctx: EmissionContext): string {
  const name = func.name;

  const params = (func.parameters ?? []).map((p) => {
    const typeRef = p.typeCall?.type?.ref;
    const refText = p.typeCall?.type?.$refText;

    let typeName = 'unknown';
    if (typeRef && isRosettaBasicType(typeRef)) {
      typeName = TS_TYPE_MAP[typeRef.name] ?? 'unknown';
    } else if (refText) {
      typeName = TS_TYPE_MAP[refText] ?? refText;
    }

    const arraySuffix = p.isArray ? '[]' : '';
    return `${p.name}: ${typeName}${arraySuffix}`;
  });

  const returnTypeRef = func.typeCall?.type?.ref;
  const returnRefText = func.typeCall?.type?.$refText;
  let returnType = 'unknown';
  if (returnTypeRef && isRosettaBasicType(returnTypeRef)) {
    returnType = TS_TYPE_MAP[returnTypeRef.name] ?? 'unknown';
  } else if (returnRefText) {
    returnType = TS_TYPE_MAP[returnRefText] ?? returnRefText;
  }

  // Suppress unused-variable warning: ctx is kept for future cross-namespace
  // type resolution parity with other emitters.
  void ctx;

  return `export type ${name} = (${params.join(', ')}) => ${returnType};`;
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
function buildEmissionContext(
  docs: LangiumDocument[],
  namespace: string,
  registry: NamespaceRegistry
): EmissionContext {
  const dataByName = new Map<string, Data>();
  const enumByName = new Map<string, RosettaEnumeration>();
  const typeAliasByName = new Map<string, RosettaTypeAlias>();
  const rulesByName = new Map<string, RosettaRule>();
  const reportsByName = new Map<string, RosettaReport>();
  const annotationsByName = new Map<string, Annotation>();
  const libraryFuncsByName = new Map<string, RosettaExternalFunction>();

  for (const doc of docs) {
    const model = doc.parseResult?.value;
    if (!model || !isRosettaModel(model)) continue;

    for (const element of (model as RosettaModel).elements) {
      if (isData(element)) {
        dataByName.set(element.name, element);
      } else if (isRosettaEnumeration(element)) {
        enumByName.set(element.name, element);
      } else if (isRosettaTypeAlias(element)) {
        typeAliasByName.set(element.name, element);
      } else if (isRosettaRule(element)) {
        rulesByName.set(element.name, element);
      } else if (isRosettaReport(element)) {
        // Reports don't have simple names — skip for now
      } else if (isAnnotation(element)) {
        annotationsByName.set(element.name, element);
      } else if (isRosettaExternalFunction(element)) {
        libraryFuncsByName.set(element.name, element);
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
    enumByName,
    typeAliasByName,
    rulesByName,
    reportsByName,
    annotationsByName,
    libraryFuncsByName,
    registry
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
 * T104, FR-020, US5B, T126 (func emission).
 *
 * @param docs      - Langium documents for this namespace.
 * @param namespace - The namespace string.
 * @param _options  - Generator options.
 * @param _funcs    - Unused (Phase 8b populates funcs internally from docs).
 */
export function emitNamespace(
  docs: LangiumDocument[],
  namespace: string,
  _options: GeneratorOptions,
  _funcs: GeneratedFunc[] = [],
  registry: NamespaceRegistry = { namespaces: new Map() }
): GeneratorOutput {
  const ctx = buildEmissionContext(docs, namespace, registry);
  const sections: string[] = [];

  sections.push(emitFileHeader(namespace, ctx));

  // Collect and emit cross-namespace import statements at the top of the file
  const crossNsImports = collectCrossNamespaceImports(ctx);
  for (const importLine of crossNsImports) {
    sections.push(importLine);
  }
  if (crossNsImports.length > 0) {
    sections.push('');
  }

  // Emit annotation decorator factories (before enums and data types)
  const annotationNames = Array.from(ctx.annotationsByName.keys()).sort();
  for (const name of annotationNames) {
    const ann = ctx.annotationsByName.get(name)!;
    sections.push('');
    sections.push(emitAnnotationDeclaration(ann, ctx));
  }
  if (annotationNames.length > 0) {
    sections.push('');
  }

  // Emit enum types (no class — just a const object + type alias for union)
  const enumNames = Array.from(ctx.enumByName.keys()).sort();
  for (const name of enumNames) {
    const enumNode = ctx.enumByName.get(name)!;
    sections.push(emitEnumDeclaration(enumNode, ctx));
    sections.push('');
  }

  // Emit type aliases (after enums, before data types)
  const typeAliasNames = Array.from(ctx.typeAliasByName.keys()).sort();
  for (const name of typeAliasNames) {
    const alias = ctx.typeAliasByName.get(name)!;
    sections.push('');
    sections.push(emitTypeAlias(alias, ctx));
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

  // Emit rules (after types, before Phase 8b funcs)
  const ruleNames = Array.from(ctx.rulesByName.keys()).sort();
  for (const name of ruleNames) {
    const rule = ctx.rulesByName.get(name)!;
    sections.push('');
    sections.push(emitRule(rule, ctx));
  }

  // Emit report metadata (Phase 9, US5) — one const object summarising all rules
  const reportMeta = emitReportMetadata(ctx);
  if (reportMeta !== '') {
    sections.push('');
    sections.push(reportMeta);
  }

  // Emit library function type aliases (Phase 10, US6)
  const libraryFuncNames = Array.from(ctx.libraryFuncsByName.keys()).sort();
  for (const name of libraryFuncNames) {
    const func = ctx.libraryFuncsByName.get(name)!;
    sections.push('');
    sections.push(emitLibraryFunc(func, ctx));
  }

  // ---------------------------------------------------------------------------
  // T126: Phase 8b func emission (TypeScript target only)
  // ---------------------------------------------------------------------------

  // Extract funcs from the documents
  const runeFuncs = extractFuncs(docs, namespace, ctx.diagnostics);

  // Build call graph and determine topological order
  const callGraph = buildFuncCallGraph(runeFuncs);
  const cyclicNames = findCyclicFuncs(callGraph);
  const sortedFuncs = topoSortFuncs(runeFuncs, callGraph);

  // Emit the Phase 8b marker
  sections.push('// (functions emitted by Phase 8b appear below this line)');

  // Track GeneratedFunc metadata for the output
  const generatedFuncs: GeneratedFunc[] = [];

  for (const func of sortedFuncs) {
    const isHoisted = cyclicNames.has(func.name);
    const funcCtx = buildFuncBodyContext(func, callGraph, ctx.diagnostics);
    const funcText = emitFunc(func, funcCtx, isHoisted);

    sections.push('');
    sections.push(funcText);

    generatedFuncs.push({
      name: func.name,
      relativePath: namespaceToPath(namespace),
      fileContents: funcText,
      sourceMap: []
    });
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
    funcs: generatedFuncs
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

// ---------------------------------------------------------------------------
// T065: Annotation declaration emitter
// ---------------------------------------------------------------------------

/**
 * Emit a typed decorator factory for an annotation declaration.
 *
 * Annotations with no attributes emit a zero-argument decorator factory.
 * Annotations with attributes emit an `Args` interface and a factory that
 * accepts it. Both return `ClassDecorator & PropertyDecorator` so they can
 * be applied to either a class or a property.
 *
 * T065, US11.
 */
function emitAnnotationDeclaration(annotation: Annotation, ctx: EmissionContext): string {
  const name = annotation.name;
  const attrs = annotation.attributes ?? [];

  if (attrs.length === 0) {
    return [
      `export function ${name}(): ClassDecorator & PropertyDecorator {`,
      `  return (target: any, propertyKey?: any) => {};`,
      `}`
    ].join('\n');
  }

  const paramFields = attrs
    .map((attr) => {
      const typeName = resolveTypeExprAsTs(attr, ctx);
      const optional = attr.card && attr.card.inf === 0 ? '?' : '';
      return `  ${attr.name}${optional}: ${typeName};`;
    })
    .join('\n');

  return [
    `export interface ${name}Args {`,
    paramFields,
    `}`,
    ``,
    `export function ${name}(args: ${name}Args): ClassDecorator & PropertyDecorator {`,
    `  return (target: any, propertyKey?: any) => {};`,
    `}`
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Type alias declaration for TS target
// ---------------------------------------------------------------------------

/**
 * Emit a TypeScript type alias declaration.
 * Maps a Rune typeAlias to `export type <Name> = <TsType>;`.
 */
function emitTypeAlias(alias: RosettaTypeAlias, ctx: EmissionContext): string {
  const name = alias.name;
  const typeRef = alias.typeCall?.type?.ref;
  const refText = alias.typeCall?.type?.$refText;

  // Resolve the target type to a TypeScript type name
  let tsType = 'unknown';
  if (typeRef && isRosettaBasicType(typeRef)) {
    const builtinMap: Record<string, string> = {
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
    tsType = builtinMap[typeRef.name] ?? 'unknown';
  } else if (typeRef && isData(typeRef)) {
    tsType = `${typeRef.name}Shape`;
  } else if (typeRef && isRosettaEnumeration(typeRef)) {
    tsType = typeRef.name;
  } else if (refText) {
    // Try builtin by refText
    const builtinMap: Record<string, string> = {
      string: 'string',
      int: 'number',
      number: 'number',
      boolean: 'boolean',
      date: 'string',
      dateTime: 'string',
      zonedDateTime: 'string',
      time: 'string'
    };
    tsType = builtinMap[refText] ?? refText;
  }

  return `export type ${name} = ${tsType};`;
}
