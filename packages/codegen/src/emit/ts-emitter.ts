// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * TypeScript class target emitter for the Rune code generator.
 *
 * Entry point: emitNamespace(model, options) → GeneratorOutput
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

import {
  isData,
  isRosettaEnumeration,
  isRosettaBasicType,
  isRosettaTypeAlias,
  isData as _isData,
  type Data,
  type Attribute,
  type RosettaEnumeration,
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
import { emitNamespaceWithContract, type NamespaceEmitter, type NamespaceEmitterOptions } from './namespace-emitter.js';
import { getTargetRelativePath, type NamespaceWalkResult } from './namespace-walker.js';
import { resolveImportPath } from './namespace-registry.js';
import { getElementNamespace } from '@rune-langium/core';
import { RUNTIME_HELPER_SOURCE } from '../helpers.js';
import { transpileCondition, transpileExpression, type ExpressionTranspilerContext } from '../expr/transpiler.js';
import { typescriptProfile } from './typescript-profile.js';
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
  emitOrder: readonly string[];
  lazyTypes: ReadonlySet<string>;
  sourceMap: SourceMapEntry[];
  diagnostics: GeneratorDiagnostic[];
  namespace: string;
  dataByName: ReadonlyMap<string, Data>;
  enumByName: ReadonlyMap<string, RosettaEnumeration>;
  typeAliasByName: ReadonlyMap<string, RosettaTypeAlias>;
  rulesByName: ReadonlyMap<string, RosettaRule>;
  reportsByName: ReadonlyMap<string, RosettaReport>;
  annotationsByName: ReadonlyMap<string, Annotation>;
  libraryFuncsByName: ReadonlyMap<string, RosettaExternalFunction>;
  registry: NamespaceRegistry;
  /** Merged builtin type map from the TS profile (basicTypeMap ∪ recordTypeMap ∪ typeAliasMap). */
  builtinTypeMap: Readonly<Record<string, string>>;
  /** JS typeof strings for scalar builtin types (for type-guard generation). */
  typeofMap: Readonly<Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Built-in type maps (derived from typescriptProfile at module load)
// ---------------------------------------------------------------------------

/**
 * Merged builtin type map from the TypeScript profile.
 * Combines basicTypeMap ∪ recordTypeMap ∪ typeAliasMap.
 * Populated once at module load; used as a default for buildEmissionContext.
 */
function buildTsBuiltinTypeMap(): Record<string, string> {
  return {
    ...typescriptProfile.basicTypeMap,
    ...typescriptProfile.recordTypeMap,
    ...typescriptProfile.typeAliasMap
  } as Record<string, string>;
}

const TS_BUILTIN_TYPE_MAP: Readonly<Record<string, string>> = buildTsBuiltinTypeMap();

/**
 * Derive a JS typeof string for each TS type expression.
 * - 'boolean' → 'boolean'
 * - 'number' → 'number'
 * - 'string' and string aliases → 'string'
 * - Temporal.* types → 'object'
 *
 * Used for type-guard checks. T108.
 */
function buildTsTypeofMap(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, tsType] of Object.entries(TS_BUILTIN_TYPE_MAP)) {
    if (tsType === 'boolean') result[key] = 'boolean';
    else if (tsType === 'number') result[key] = 'number';
    else if (typeof tsType === 'string' && tsType.startsWith('Temporal.')) result[key] = 'object';
    else result[key] = 'string';
  }
  return result;
}

const TS_TYPEOF_MAP: Readonly<Record<string, string>> = buildTsTypeofMap();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    } else if (typeRef && isRosettaTypeAlias(typeRef)) {
      trackRef(typeRef, typeRef.name);
    }
  }

  // Check rule input types
  for (const rule of ctx.rulesByName.values()) {
    const inputRef = rule.input?.type?.ref;
    if (inputRef && isData(inputRef)) {
      trackRef(inputRef, `${inputRef.name}Shape`);
      trackRef(inputRef, inputRef.name);
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
      const builtinTs = ctx.builtinTypeMap[refText];
      if (builtinTs) return builtinTs;
      return refText; // data type / enum name
    }
    return 'unknown';
  }

  if (isRosettaBasicType(typeRef)) {
    const mapped = ctx.builtinTypeMap[typeRef.name];
    if (mapped) return mapped;
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'unmapped-builtin',
      message: `Builtin type '${typeRef.name}' has no TypeScript mapping; emitting unknown`
    });
    return 'unknown';
  }
  if (isRosettaEnumeration(typeRef)) return typeRef.name;
  if (_isData(typeRef)) return typeRef.name;

  if (refText) {
    const builtinTs = ctx.builtinTypeMap[refText];
    if (builtinTs) return builtinTs;
  }
  return 'unknown';
}

/**
 * Build a positive type-guard expression for a scalar/object builtin field.
 *
 * Object-typed builtins are the `Temporal.*` record mappings (date/dateTime/
 * zonedDateTime/time). A bare `typeof x === 'object'` is unsound — `null`,
 * arrays, and any plain object pass it. When the field's TS type is a
 * `Temporal.*` class we have the class in hand, so guard with a precise
 * `x instanceof Temporal.PlainDate` (Codex review on PR #224 — validate
 * against the actual Temporal class). Scalar builtins keep `typeof x === '<t>'`.
 */
function posTypeofGuard(access: string, typeofStr: string, tsType?: string): string {
  if (typeofStr === 'object') {
    if (tsType && tsType.startsWith('Temporal.')) return `${access} instanceof ${tsType}`;
    // Fallback for any other object-typed builtin: non-null, non-array object.
    return `(typeof ${access} === 'object' && ${access} !== null && !Array.isArray(${access}))`;
  }
  return `typeof ${access} === '${typeofStr}'`;
}

/** Negated form of {@link posTypeofGuard} (true when the field does NOT match). */
function negTypeofGuard(access: string, typeofStr: string, tsType?: string): string {
  if (typeofStr === 'object') {
    if (tsType && tsType.startsWith('Temporal.')) return `!(${access} instanceof ${tsType})`;
    return `(typeof ${access} !== 'object' || ${access} === null || Array.isArray(${access}))`;
  }
  return `typeof ${access} !== '${typeofStr}'`;
}

/**
 * Resolve the JS typeof string for an attribute's base type.
 * Returns undefined when the type is not a scalar (e.g., Data reference).
 * T108.
 */
function resolveTypeofStr(attr: Attribute, ctx: EmissionContext): string | undefined {
  const typeRef = attr.typeCall?.type?.ref;
  const refText = attr.typeCall?.type?.$refText;

  if (!typeRef) {
    if (refText) return ctx.typeofMap[refText];
    return undefined;
  }
  if (isRosettaBasicType(typeRef)) {
    return ctx.typeofMap[typeRef.name];
  }
  // Data / Enum references → not a JS scalar typeof check
  return undefined;
}

/**
 * Resolve the emitted TS type for a builtin attribute (e.g. `Temporal.PlainDate`,
 * `string`). Used to make `instanceof` guards precise for the Temporal record
 * mappings. Returns undefined for non-builtin (Data/Enum) references.
 */
function resolveBuiltinTsType(attr: Attribute, ctx: EmissionContext): string | undefined {
  const typeRef = attr.typeCall?.type?.ref;
  const refText = attr.typeCall?.type?.$refText;
  if (!typeRef) return refText ? ctx.builtinTypeMap[refText] : undefined;
  if (isRosettaBasicType(typeRef)) return ctx.builtinTypeMap[typeRef.name];
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
  const parentInNamespace = parentRef && isData(parentRef) && ctx.dataByName.has((parentRef as Data).name);
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
  const parentInNamespace = parentRef && isData(parentRef) && ctx.dataByName.has((parentRef as Data).name);
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
        lines.push(`  if (!Array.isArray((${obj} as Record<string, unknown>).${attr.name})) return false;`);
      } else {
        lines.push(
          `  if ((${obj} as Record<string, unknown>).${attr.name} !== undefined && !Array.isArray((${obj} as Record<string, unknown>).${attr.name})) return false;`
        );
      }
    } else if (isOpt) {
      if (typeofStr) {
        const access = `(${obj} as Record<string, unknown>).${attr.name}`;
        const tsType = resolveBuiltinTsType(attr, ctx);
        lines.push(`  if (${access} !== undefined && ${negTypeofGuard(access, typeofStr, tsType)}) return false;`);
      }
    } else {
      if (typeofStr) {
        const access = `(${obj} as Record<string, unknown>).${attr.name}`;
        const tsType = resolveBuiltinTsType(attr, ctx);
        lines.push(`  if (${negTypeofGuard(access, typeofStr, tsType)}) return false;`);
      } else {
        lines.push(`  if ((${obj} as Record<string, unknown>).${attr.name} === undefined) return false;`);
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
  const parentInNamespace = parentRef && isData(parentRef) && ctx.dataByName.has((parentRef as Data).name);
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        const tsType = resolveBuiltinTsType(attr, ctx);
        checks.push(`(${obj}.${attr.name} === undefined || ${posTypeofGuard(`${obj}.${attr.name}`, typeofStr, tsType)})`);
      }
    } else {
      if (typeofStr) {
        const tsType = resolveBuiltinTsType(attr, ctx);
        checks.push(posTypeofGuard(`${obj}.${attr.name}`, typeofStr, tsType));
      } else {
        checks.push(`${obj}.${attr.name} !== undefined`);
      }
    }
  }

  const condition = checks.length === 0 ? 'true' : checks.join(' && ');

  return [`export function is${childName}(x: ${parentName}): x is ${childName} {`, `  return ${condition};`, `}`].join(
    '\n'
  );
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
  const paramName = inputTypeName ? inputTypeName.charAt(0).toLowerCase() + inputTypeName.slice(1) : 'input';

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
      typeName = ctx.builtinTypeMap[typeRef.name] ?? 'unknown';
    } else if (refText) {
      typeName = ctx.builtinTypeMap[refText] ?? refText;
    }

    const arraySuffix = p.isArray ? '[]' : '';
    return `${p.name}: ${typeName}${arraySuffix}`;
  });

  const returnTypeRef = func.typeCall?.type?.ref;
  const returnRefText = func.typeCall?.type?.$refText;
  let returnType = 'unknown';
  if (returnTypeRef && isRosettaBasicType(returnTypeRef)) {
    returnType = ctx.builtinTypeMap[returnTypeRef.name] ?? 'unknown';
  } else if (returnRefText) {
    returnType = ctx.builtinTypeMap[returnRefText] ?? returnRefText;
  }

  return `export type ${name} = (${params.join(', ')}) => ${returnType};`;
}

// ---------------------------------------------------------------------------
// T104: emitNamespace
// ---------------------------------------------------------------------------

function buildEmissionContext(model: NamespaceWalkResult, registry: NamespaceRegistry): EmissionContext {
  return {
    target: 'typescript',
    emitOrder: model.emitOrder,
    lazyTypes: model.cyclicTypes,
    sourceMap: [],
    diagnostics: [],
    namespace: model.namespace,
    dataByName: model.dataByName,
    enumByName: model.enumByName,
    typeAliasByName: model.typeAliasByName,
    rulesByName: model.rulesByName,
    reportsByName: model.reportsByName,
    annotationsByName: model.annotationsByName,
    libraryFuncsByName: model.libraryFuncsByName,
    registry,
    builtinTypeMap: TS_BUILTIN_TYPE_MAP,
    typeofMap: TS_TYPEOF_MAP
  };
}

/**
 * Emit the file header: SPDX, generated comment, inlined runtime helpers.
 * No `import { z } from 'zod'` — zero Zod dependency.
 * T104.
 */
function emitFileHeader(namespace: string, _ctx: EmissionContext, suppressBoilerplate: boolean): string {
  // 019 Phase 0.5.3: when wrapped in a whole-model layout, replace the
  // inline RUNTIME_HELPER_SOURCE block with an import line — the TS
  // LanguageProfile's makeSharedArtifacts emits the `runtime.ts`
  // sidecar once for the whole bundle.
  return [
    `// SPDX-License-Identifier: MIT`,
    `// Generated by @rune-langium/codegen — do not edit`,
    `// Source namespace: ${namespace}`,
    ``,
    ...(suppressBoilerplate
      ? [`import { runeCheckOneOf, runeCount, runeAttrExists } from './runtime.js';`, ``]
      : [RUNTIME_HELPER_SOURCE, ''])
  ].join('\n');
}

/**
 * Emit the namespace as a single *.ts file.
 *
 * Entry point for the TypeScript class emitter.
 * T104, FR-020, US5B, T126 (func emission).
 *
 * @param model    - Shared walker output for this namespace.
 * @param _options - Generator options.
 */
export function emitNamespace(
  model: NamespaceWalkResult,
  options: GeneratorOptions,
  registry: NamespaceRegistry = { namespaces: new Map() }
): GeneratorOutput {
  return emitNamespaceWithContract(model, options, registry, TsNamespaceEmitter);
}

export class TsNamespaceEmitter implements NamespaceEmitter {
  private readonly ctx: EmissionContext;
  private readonly sections: string[] = [];
  private readonly relativePath: string;
  private readonly generatedFuncs: GeneratedFunc[] = [];
  private readonly suppressBoilerplate: boolean;

  constructor(
    private readonly model: NamespaceWalkResult,
    options: NamespaceEmitterOptions,
    registry: NamespaceRegistry = { namespaces: new Map() }
  ) {
    this.ctx = buildEmissionContext(model, registry);
    this.relativePath = getTargetRelativePath(model.namespace, 'typescript');
    this.suppressBoilerplate = options.suppressBoilerplate ?? false;
  }

  emitHeader(): void {
    this.sections.push(emitFileHeader(this.model.namespace, this.ctx, this.suppressBoilerplate));
  }

  emitCrossNamespaceImports(): void {
    const crossNsImports = collectCrossNamespaceImports(this.ctx);
    for (const importLine of crossNsImports) {
      this.sections.push(importLine);
    }
    if (crossNsImports.length > 0) {
      this.sections.push('');
    }
  }

  emitAnnotation(annotation: Annotation): void {
    this.sections.push('');
    this.sections.push(emitAnnotationDeclaration(annotation, this.ctx));
  }

  emitAfterAnnotations(): void {
    this.sections.push('');
  }

  emitEnumeration(enumNode: RosettaEnumeration): void {
    this.sections.push(emitEnumDeclaration(enumNode, this.ctx));
    this.sections.push('');
  }

  emitTypeAlias(typeAlias: RosettaTypeAlias): void {
    this.sections.push('');
    this.sections.push(emitTypeAlias(typeAlias, this.ctx));
  }

  emitData(data: Data): void {
    this.sections.push(emitInterface(data, this.ctx));
    this.sections.push('');
    this.sections.push(emitClass(data, this.ctx));
    this.sections.push('');
    this.sections.push(emitTypeGuard(data, this.ctx));
    this.sections.push('');
  }

  emitRule(rule: RosettaRule): void {
    this.sections.push('');
    this.sections.push(emitRule(rule, this.ctx));
  }

  emitReportMetadata(): void {
    const reportMeta = emitReportMetadata(this.ctx);
    if (reportMeta !== '') {
      this.sections.push('');
      this.sections.push(reportMeta);
    }
  }

  emitExternalFunction(func: RosettaExternalFunction): void {
    this.sections.push('');
    this.sections.push(emitLibraryFunc(func, this.ctx));
  }

  emitFunctions(): void {
    const runeFuncs = extractFuncs(Array.from(this.model.docs), this.model.namespace, this.ctx.diagnostics);
    const callGraph = buildFuncCallGraph(runeFuncs);
    const cyclicNames = findCyclicFuncs(callGraph);
    const sortedFuncs = topoSortFuncs(runeFuncs, callGraph);

    this.sections.push('// (functions emitted by Phase 8b appear below this line)');

    for (const func of sortedFuncs) {
      const isHoisted = cyclicNames.has(func.name);
      const funcCtx = buildFuncBodyContext(func, callGraph, this.ctx.diagnostics);
      const funcText = emitFunc(func, funcCtx, isHoisted);

      this.sections.push('');
      this.sections.push(funcText);

      this.generatedFuncs.push({
        name: func.name,
        relativePath: this.relativePath,
        fileContents: funcText,
        sourceMap: []
      });
    }
  }

  finalize(): GeneratorOutput {
    while (this.sections.length > 0 && this.sections[this.sections.length - 1] === '') {
      this.sections.pop();
    }
    return {
      relativePath: this.relativePath,
      content: this.sections.join('\n') + '\n',
      sourceMap: this.ctx.sourceMap,
      diagnostics: this.ctx.diagnostics,
      funcs: this.generatedFuncs
    };
  }
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
    return [`export type ${name} = never;`, `export const ${name}Values: ${name}[] = [];`].join('\n');
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
    lines.push(`export const ${name}DisplayNames: Record<${name}, string> = {\n${displayEntries.join(',\n')}\n};`);
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
function emitTypeAlias(alias: RosettaTypeAlias, _ctx: EmissionContext): string {
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
