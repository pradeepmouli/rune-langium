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
import { emitNamespaceWithContract, type NamespaceEmitterOptions } from './namespace-emitter.js';
import { BaseNamespaceEmitter } from './base-namespace-emitter.js';
import { getTargetRelativePath, type NamespaceWalkResult } from './namespace-walker.js';
import { getElementNamespace } from '@rune-langium/core';
import { RUNTIME_HELPER_SOURCE } from '../helpers.js';
import {
  decodeCardinality,
  buildAttributeTypesMap,
  activeConditions,
  mergeProfileTypeMaps,
  buildReportRulesLines,
  buildCrossNsImportLines
} from './base-namespace-emitter.js';
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

const TS_BUILTIN_TYPE_MAP: Readonly<Record<string, string>> = mergeProfileTypeMaps(typescriptProfile) as Record<
  string,
  string
>;

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
// Emission context constructor helper
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

// ---------------------------------------------------------------------------
// T104: emitNamespace entry point
// ---------------------------------------------------------------------------

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

export class TsNamespaceEmitter extends BaseNamespaceEmitter {
  private readonly ctx: EmissionContext;
  private readonly sections: string[] = [];
  private readonly relativePath: string;
  private readonly generatedFuncs: GeneratedFunc[] = [];

  constructor(
    model: NamespaceWalkResult,
    options: NamespaceEmitterOptions,
    registry: NamespaceRegistry = { namespaces: new Map() }
  ) {
    super(model, options, registry);
    this.ctx = buildEmissionContext(model, registry);
    this.relativePath = getTargetRelativePath(model.namespace, 'typescript');
  }

  emitHeader(): void {
    this.sections.push(this.buildFileHeader());
  }

  emitCrossNamespaceImports(): void {
    const crossNsImports = this.collectCrossNamespaceImports();
    for (const importLine of crossNsImports) {
      this.sections.push(importLine);
    }
    if (crossNsImports.length > 0) {
      this.sections.push('');
    }
  }

  emitAnnotation(annotation: Annotation): void {
    this.sections.push('');
    this.sections.push(this.emitAnnotationDeclaration(annotation));
  }

  emitAfterAnnotations(): void {
    this.sections.push('');
  }

  emitEnumeration(enumNode: RosettaEnumeration): void {
    this.sections.push(this.emitEnumDeclaration(enumNode));
    this.sections.push('');
  }

  emitTypeAlias(typeAlias: RosettaTypeAlias): void {
    this.sections.push('');
    this.sections.push(this.emitTypeAliasDeclaration(typeAlias));
  }

  emitData(data: Data): void {
    this.sections.push(this.emitInterface(data));
    this.sections.push('');
    this.sections.push(this.emitClass(data));
    this.sections.push('');
    this.sections.push(this.emitTypeGuard(data));
    this.sections.push('');
  }

  emitRule(rule: RosettaRule): void {
    this.sections.push('');
    this.sections.push(this.emitRuleDeclaration(rule));
  }

  emitReportMetadata(): void {
    const reportMeta = this.buildReportMetadataText();
    if (reportMeta !== '') {
      this.sections.push('');
      this.sections.push(reportMeta);
    }
  }

  emitExternalFunction(func: RosettaExternalFunction): void {
    this.sections.push('');
    this.sections.push(this.emitLibraryFunc(func));
  }

  emitFunctions(): void {
    const runeFuncs = extractFuncs(Array.from(this.model.docs), this.model.namespace, this.ctx.diagnostics);
    const callGraph = buildFuncCallGraph(runeFuncs);
    const cyclicNames = findCyclicFuncs(callGraph);
    const sortedFuncs = topoSortFuncs(runeFuncs, callGraph);

    this.sections.push('// (functions emitted by Phase 8b appear below this line)');

    for (const func of sortedFuncs) {
      const isHoisted = cyclicNames.has(func.name);
      const funcCtx = TsNamespaceEmitter.buildFuncBodyContext(func, callGraph, this.ctx.diagnostics);
      const funcText = TsNamespaceEmitter.emitFunc(func, funcCtx, isHoisted);

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

  // ---------------------------------------------------------------------------
  // Private instance methods (ctx-taking helpers)
  // ---------------------------------------------------------------------------

  /**
   * Collect cross-namespace import statements needed for the types and aliases
   * defined in this emission context.
   */
  private collectCrossNamespaceImports(): string[] {
    const imports = new Map<string, Set<string>>(); // namespace -> symbol names

    const trackRef = (typeRef: unknown, symbolName: string): void => {
      if (!typeRef || typeof typeRef !== 'object') return;
      const ns = getElementNamespace(typeRef as { $container?: unknown });
      if (!ns || ns === this.ctx.namespace) return;

      let symbols = imports.get(ns);
      if (!symbols) {
        symbols = new Set();
        imports.set(ns, symbols);
      }
      symbols.add(symbolName);
    };

    // Check data type inheritance and attribute references
    for (const data of this.ctx.dataByName.values()) {
      const parentRef = data.superType?.ref;
      if (parentRef) {
        trackRef(parentRef, `${parentRef.name}Shape`);
        trackRef(parentRef, parentRef.name);
      }
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
    for (const alias of this.ctx.typeAliasByName.values()) {
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
    for (const rule of this.ctx.rulesByName.values()) {
      const inputRef = rule.input?.type?.ref;
      if (inputRef && isData(inputRef)) {
        trackRef(inputRef, `${inputRef.name}Shape`);
        trackRef(inputRef, inputRef.name);
      }
    }

    return buildCrossNsImportLines(imports, this.ctx.namespace, this.ctx.registry, '.js');
  }

  /**
   * Resolve the TypeScript type expression for an attribute.
   * T105.
   */
  private resolveTypeExprAsTs(attr: Attribute): string {
    const typeRef = attr.typeCall?.type?.ref;
    const refText = attr.typeCall?.type?.$refText;

    if (!typeRef) {
      if (refText) {
        const builtinTs = this.ctx.builtinTypeMap[refText];
        if (builtinTs) return builtinTs;
        return refText; // data type / enum name
      }
      return 'unknown';
    }

    if (isRosettaBasicType(typeRef)) {
      const mapped = this.ctx.builtinTypeMap[typeRef.name];
      if (mapped) return mapped;
      this.ctx.diagnostics.push({
        severity: 'warning',
        code: 'unmapped-builtin',
        message: `Builtin type '${typeRef.name}' has no TypeScript mapping; emitting unknown`
      });
      return 'unknown';
    }
    if (isRosettaEnumeration(typeRef)) return typeRef.name;
    if (_isData(typeRef)) return typeRef.name;

    if (refText) {
      const builtinTs = this.ctx.builtinTypeMap[refText];
      if (builtinTs) return builtinTs;
    }
    return 'unknown';
  }

  /**
   * Resolve the JS typeof string for an attribute's base type.
   * Returns undefined when the type is not a scalar (e.g., Data reference).
   * T108.
   */
  private resolveTypeofStr(attr: Attribute): string | undefined {
    const typeRef = attr.typeCall?.type?.ref;
    const refText = attr.typeCall?.type?.$refText;

    if (!typeRef) {
      if (refText) return this.ctx.typeofMap[refText];
      return undefined;
    }
    if (isRosettaBasicType(typeRef)) {
      return this.ctx.typeofMap[typeRef.name];
    }
    return undefined;
  }

  /**
   * Resolve the emitted TS type for a builtin attribute (e.g. `Temporal.PlainDate`,
   * `string`). Used to make `instanceof` guards precise for the Temporal record
   * mappings. Returns undefined for non-builtin (Data/Enum) references.
   */
  private resolveBuiltinTsType(attr: Attribute): string | undefined {
    const typeRef = attr.typeCall?.type?.ref;
    const refText = attr.typeCall?.type?.$refText;
    if (!typeRef) return refText ? this.ctx.builtinTypeMap[refText] : undefined;
    if (isRosettaBasicType(typeRef)) return this.ctx.builtinTypeMap[typeRef.name];
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // T105: emitInterface
  // ---------------------------------------------------------------------------

  /**
   * Emit `export interface <TypeName>Shape { ... }`.
   * For types with a parent in the same namespace, emits `extends <Parent>Shape`.
   * T105.
   */
  private emitInterface(data: Data): string {
    const name = data.name;
    const interfaceName = `${name}Shape`;

    const parentRef = data.superType?.ref;
    const parentInNamespace = parentRef && isData(parentRef) && this.ctx.dataByName.has((parentRef as Data).name);
    const parentInterfaceName = parentInNamespace ? `${(parentRef as Data).name}Shape` : undefined;

    const header = parentInterfaceName
      ? `export interface ${interfaceName} extends ${parentInterfaceName}`
      : `export interface ${interfaceName}`;

    // Only OWN attributes (parent's are inherited via extends)
    const fields: string[] = [];
    for (const attr of data.attributes) {
      const baseType = this.resolveTypeExprAsTs(attr);
      const fieldDecl = TsNamespaceEmitter.applyCardinalityTs(attr.card, baseType, attr.name);
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
  private emitClass(data: Data): string {
    const name = data.name;
    const interfaceName = `${name}Shape`;
    const parentRef = data.superType?.ref;
    const parentInNamespace = parentRef && isData(parentRef) && this.ctx.dataByName.has((parentRef as Data).name);
    const parentName = parentInNamespace ? (parentRef as Data).name : undefined;

    const classHeader = parentName
      ? `export class ${name} extends ${parentName} implements ${interfaceName}`
      : `export class ${name} implements ${interfaceName}`;

    const lines: string[] = [`${classHeader} {`];

    // Own instance fields
    for (const attr of data.attributes) {
      const baseType = this.resolveTypeExprAsTs(attr);
      const fieldDecl = TsNamespaceEmitter.applyCardinalityTs(attr.card, baseType, attr.name);
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
    lines.push(TsNamespaceEmitter.emitFromFactory(data));

    // validate methods (T110)
    if (activeConditions(data).length > 0) {
      lines.push('');
      lines.push(this.emitValidateMethods(data));
    }

    lines.push('}');
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // T108: emitTypeGuard
  // ---------------------------------------------------------------------------

  /**
   * Build the field-check lines for a type guard body.
   */
  private buildTypeGuardChecks(data: Data): string[] {
    const lines: string[] = [];
    const obj = 'x';

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
      const typeofStr = this.resolveTypeofStr(attr);
      const isArray = TsNamespaceEmitter.isArrayCardinality(card);
      const isOpt = TsNamespaceEmitter.isOptionalCardinality(card);

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
          const tsType = this.resolveBuiltinTsType(attr);
          lines.push(
            `  if (${access} !== undefined && ${TsNamespaceEmitter.negTypeofGuard(access, typeofStr, tsType)}) return false;`
          );
        }
      } else {
        if (typeofStr) {
          const access = `(${obj} as Record<string, unknown>).${attr.name}`;
          const tsType = this.resolveBuiltinTsType(attr);
          lines.push(`  if (${TsNamespaceEmitter.negTypeofGuard(access, typeofStr, tsType)}) return false;`);
        } else {
          lines.push(`  if ((${obj} as Record<string, unknown>).${attr.name} === undefined) return false;`);
        }
      }
    }

    return lines;
  }

  /**
   * Emit `export function is<TypeName>(x: unknown): x is <TypeName>`.
   * T108, T109.
   */
  private emitTypeGuard(data: Data): string {
    const name = data.name;
    const parentRef = data.superType?.ref;
    const parentInNamespace = parentRef && isData(parentRef) && this.ctx.dataByName.has((parentRef as Data).name);
    const parentName = parentInNamespace ? (parentRef as Data).name : undefined;

    const checkLines = this.buildTypeGuardChecks(data);

    if (parentName) {
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
  // T110: emitValidateMethods
  // ---------------------------------------------------------------------------

  /**
   * Build an ExpressionTranspilerContext for ts-method emission.
   */
  private buildTsTranspilerContext(data: Data, conditionName: string): ExpressionTranspilerContext {
    const attributeTypes = buildAttributeTypesMap(data);
    return {
      selfName: 'this',
      emitMode: 'ts-method',
      conditionName,
      typeName: data.name,
      attributeTypes,
      diagnostics: this.ctx.diagnostics
    };
  }

  /**
   * Emit validate methods for all conditions on a type.
   * T110.
   */
  private emitValidateMethods(data: Data): string {
    const conditions = activeConditions(data);
    if (conditions.length === 0) return '';

    const methodBlocks: string[] = [];

    for (const cond of conditions) {
      const condName = cond.name ?? 'Condition';
      const transpilerCtx = this.buildTsTranspilerContext(data, condName);
      const body = transpileCondition(cond, transpilerCtx);

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
  // Report metadata / rule / library func / file header / enum / annotation / type alias
  // ---------------------------------------------------------------------------

  /**
   * Build the runeReportRules const string.
   * Renamed from emitReportMetadata to avoid collision with the public interface method.
   */
  private buildReportMetadataText(): string {
    const lines = buildReportRulesLines(this.ctx.rulesByName);
    return lines.length === 0 ? '' : lines.join('\n');
  }

  /**
   * Emit a standalone rule function.
   * Renamed from emitRule to avoid collision with the public interface method.
   */
  private emitRuleDeclaration(rule: RosettaRule): string {
    const name = rule.name;
    const inputTypeRef = rule.input?.type?.ref;
    const inputTypeName = inputTypeRef ? inputTypeRef.name : undefined;
    const paramType = inputTypeName ? `${inputTypeName}Shape` : 'Record<string, unknown>';
    const paramName = inputTypeName ? inputTypeName.charAt(0).toLowerCase() + inputTypeName.slice(1) : 'input';

    const attributeTypes = new Map<string, string>();
    if (inputTypeRef && isData(inputTypeRef)) {
      for (const attr of inputTypeRef.attributes) {
        const attrType = this.resolveTypeExprAsTs(attr);
        attributeTypes.set(attr.name, attrType);
      }
    }

    const transpilerCtx: ExpressionTranspilerContext = {
      selfName: paramName,
      emitMode: 'ts-method',
      conditionName: name,
      typeName: inputTypeName ?? name,
      attributeTypes,
      diagnostics: this.ctx.diagnostics
    };

    const exprStr = transpileExpression(rule.expression as any, transpilerCtx);

    if (rule.eligibility) {
      return `export function validate${name}(${paramName}: ${paramType}): boolean {\n  return ${exprStr};\n}`;
    } else {
      return `export function extract${name}(${paramName}: ${paramType}): unknown {\n  return ${exprStr};\n}`;
    }
  }

  /**
   * Emit a TypeScript callable-type alias for a Rune library function declaration.
   */
  private emitLibraryFunc(func: RosettaExternalFunction): string {
    const name = func.name;

    const params = (func.parameters ?? []).map((p) => {
      const typeRef = p.typeCall?.type?.ref;
      const refText = p.typeCall?.type?.$refText;

      let typeName = 'unknown';
      if (typeRef && isRosettaBasicType(typeRef)) {
        typeName = this.ctx.builtinTypeMap[typeRef.name] ?? 'unknown';
      } else if (refText) {
        typeName = this.ctx.builtinTypeMap[refText] ?? refText;
      }

      const arraySuffix = p.isArray ? '[]' : '';
      return `${p.name}: ${typeName}${arraySuffix}`;
    });

    const returnTypeRef = func.typeCall?.type?.ref;
    const returnRefText = func.typeCall?.type?.$refText;
    let returnType = 'unknown';
    if (returnTypeRef && isRosettaBasicType(returnTypeRef)) {
      returnType = this.ctx.builtinTypeMap[returnTypeRef.name] ?? 'unknown';
    } else if (returnRefText) {
      returnType = this.ctx.builtinTypeMap[returnRefText] ?? returnRefText;
    }

    return `export type ${name} = (${params.join(', ')}) => ${returnType};`;
  }

  /**
   * Emit the file header: SPDX, generated comment, inlined runtime helpers.
   * No `import { z } from 'zod'` — zero Zod dependency.
   * T104.
   */
  private buildFileHeader(): string {
    return [
      `// SPDX-License-Identifier: MIT`,
      `// Generated by @rune-langium/codegen — do not edit`,
      `// Source namespace: ${this.model.namespace}`,
      ``,
      ...(this.suppressBoilerplate
        ? [`import { runeCheckOneOf, runeCount, runeAttrExists } from './runtime.js';`, ``]
        : [RUNTIME_HELPER_SOURCE, ''])
    ].join('\n');
  }

  /**
   * Emit a TypeScript enum declaration (as a const string union + const object).
   * No Zod dependency. Renamed from emitEnumDeclaration.
   */
  private emitEnumDeclaration(enumNode: RosettaEnumeration): string {
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

  /**
   * Emit a typed decorator factory for an annotation declaration.
   * T065, US11.
   */
  private emitAnnotationDeclaration(annotation: Annotation): string {
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
        const typeName = this.resolveTypeExprAsTs(attr);
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

  /**
   * Emit a TypeScript type alias declaration.
   * Maps a Rune typeAlias to `export type <Name> = <TsType>;`.
   * Renamed from emitTypeAlias to avoid collision with the public interface method.
   */
  private emitTypeAliasDeclaration(alias: RosettaTypeAlias): string {
    const name = alias.name;
    const typeRef = alias.typeCall?.type?.ref;
    const refText = alias.typeCall?.type?.$refText;

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

  // ---------------------------------------------------------------------------
  // Private static helpers (pure utilities, no ctx)
  // ---------------------------------------------------------------------------

  /**
   * Apply cardinality to a TypeScript field declaration.
   * T105.
   */
  private static applyCardinalityTs(card: RosettaCardinality, baseType: string, fieldName: string): string {
    const { lower, upper } = decodeCardinality(card);

    if (upper === null) {
      if (lower === 0) return `${fieldName}?: ${baseType}[]`;
      return `${fieldName}: ${baseType}[]`;
    }

    if (upper === 1 && lower === 1) return `${fieldName}: ${baseType}`;
    if (upper === 1 && lower === 0) return `${fieldName}?: ${baseType}`;

    return `${fieldName}: ${baseType}[]`;
  }

  /**
   * Determine whether a cardinality describes an array field.
   */
  private static isArrayCardinality(card: RosettaCardinality): boolean {
    const { lower, upper } = decodeCardinality(card);
    if (upper === null) return true;
    if (upper === 1 && lower === 1) return false;
    if (upper === 1 && lower === 0) return false;
    if (upper === 0 && lower === 0) return false;
    return true;
  }

  /**
   * Determine whether a cardinality is optional (can be absent).
   */
  private static isOptionalCardinality(card: RosettaCardinality): boolean {
    const { lower, upper } = decodeCardinality(card);
    if (upper === null && lower === 0) return true;
    if (upper === 1 && lower === 0) return true;
    if (upper === 0 && lower === 0) return true;
    return false;
  }

  /**
   * Build a positive type-guard expression for a scalar/object builtin field.
   */
  private static posTypeofGuard(access: string, typeofStr: string, tsType?: string): string {
    if (typeofStr === 'object') {
      if (tsType && tsType.startsWith('Temporal.')) return `${access} instanceof ${tsType}`;
      return `(typeof ${access} === 'object' && ${access} !== null && !Array.isArray(${access}))`;
    }
    return `typeof ${access} === '${typeofStr}'`;
  }

  /** Negated form of posTypeofGuard (true when the field does NOT match). */
  private static negTypeofGuard(access: string, typeofStr: string, tsType?: string): string {
    if (typeofStr === 'object') {
      if (tsType && tsType.startsWith('Temporal.')) return `!(${access} instanceof ${tsType})`;
      return `(typeof ${access} !== 'object' || ${access} === null || Array.isArray(${access}))`;
    }
    return `typeof ${access} !== '${typeofStr}'`;
  }

  // ---------------------------------------------------------------------------
  // T109: emitDiscriminatorPredicate
  // ---------------------------------------------------------------------------

  /**
   * Emit `export function is<Child>(x: <Parent>): x is <Child>` discriminator predicate.
   * T109.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private emitDiscriminatorPredicate(child: Data, parent: Data): string {
    const childName = child.name;
    const parentName = parent.name;

    const childFields = child.attributes;

    if (childFields.length === 0) {
      return [
        `export function is${childName}(x: ${parentName}): x is ${childName} {`,
        `  return is${childName}(x as unknown);`,
        `}`
      ].join('\n');
    }

    const checks: string[] = [];
    for (const attr of childFields) {
      const card = attr.card;
      const typeofStr = this.resolveTypeofStr(attr);
      const isArray = TsNamespaceEmitter.isArrayCardinality(card);
      const isOpt = TsNamespaceEmitter.isOptionalCardinality(card);
      const obj = '(x as Record<string, unknown>)';

      if (isArray) {
        checks.push(`Array.isArray(${obj}.${attr.name})`);
      } else if (isOpt) {
        if (typeofStr) {
          const tsType = this.resolveBuiltinTsType(attr);
          checks.push(
            `(${obj}.${attr.name} === undefined || ${TsNamespaceEmitter.posTypeofGuard(`${obj}.${attr.name}`, typeofStr, tsType)})`
          );
        }
      } else {
        if (typeofStr) {
          const tsType = this.resolveBuiltinTsType(attr);
          checks.push(TsNamespaceEmitter.posTypeofGuard(`${obj}.${attr.name}`, typeofStr, tsType));
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
  // T107: emitFromFactory (static — no ctx needed)
  // ---------------------------------------------------------------------------

  /**
   * Emit the `static from(json: unknown): <TypeName>` factory method.
   * T107.
   */
  private static emitFromFactory(data: Data): string {
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
  // Phase 8b: Func emission helpers (T120–T126) — static (FuncBodyContext, not EmissionContext)
  // ---------------------------------------------------------------------------

  /**
   * Build the TypeScript input object type for a func's input parameters.
   * T120, FR-028.
   */
  private static buildFuncInputType(func: RuneFunc): string {
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
  private static buildFuncOutputType(func: RuneFunc): string {
    const tsType = resolveFuncTypeTs(func.output.typeName);
    const isArray = func.output.cardinality.upper === null || func.output.cardinality.upper > 1;
    return isArray ? `${tsType}[]` : tsType;
  }

  /**
   * Build a FuncBodyContext for the given func.
   * T120–T124.
   */
  private static buildFuncBodyContext(
    func: RuneFunc,
    callGraph: Map<string, Set<string>>,
    diagnostics: GeneratorDiagnostic[]
  ): FuncBodyContext {
    const isArray = func.output.cardinality.upper === null || func.output.cardinality.upper > 1;

    const inputNames = new Set(func.inputs.map((p) => p.name));
    const aliasBindings = new Map<string, string>();
    for (const alias of func.aliases) {
      const localName = inputNames.has(alias.name) ? `${alias.name}_alias` : alias.name;
      aliasBindings.set(alias.name, localName);
    }

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
   */
  private static emitFuncSet(assignment: RuneFuncAssignment, ctx: FuncBodyContext): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exprStr = transpileExpression(assignment.exprNode as any, ctx);
    if (assignment.kind === 'add') {
      return `  result.push(${exprStr});`;
    }
    return `  result = ${exprStr};`;
  }

  /**
   * T121: Emit a single alias (shortcut) binding.
   */
  private static emitFuncAlias(alias: RuneFuncAlias, ctx: FuncBodyContext): string {
    const localName = ctx.aliasBindings.get(alias.name) ?? alias.name;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exprStr = transpileExpression(alias.exprNode as any, ctx);
    return `  const ${localName} = ${exprStr};`;
  }

  /**
   * T122: Emit pre-condition validation checks at function entry.
   */
  private static emitFuncPreConditions(func: RuneFunc, ctx: FuncBodyContext): string[] {
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
   */
  private static emitFuncPostConditions(func: RuneFunc, ctx: FuncBodyContext): string[] {
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
   */
  private static emitFuncBody(func: RuneFunc, ctx: FuncBodyContext): string[] {
    const bodyLines: string[] = [];

    if (func.isAbstract) {
      const preConds = TsNamespaceEmitter.emitFuncPreConditions(func, ctx);
      for (const block of preConds) {
        bodyLines.push(block);
      }
      bodyLines.push(`  throw new Error('Diagnostic: ${func.name} — not_implemented');`);
      ctx.diagnostics.push({
        severity: 'info',
        code: 'abstract-func',
        message: `Func '${func.name}' is abstract (no body). Add a set/add body to implement it.`
      });
      return bodyLines;
    }

    const outputTs = resolveFuncTypeTs(func.output.typeName);
    if (ctx.outputAccumulator === 'array') {
      bodyLines.push(`  const result: ${outputTs}[] = [];`);
    } else {
      bodyLines.push(`  let result: ${outputTs};`);
    }

    const preConds = TsNamespaceEmitter.emitFuncPreConditions(func, ctx);
    for (const block of preConds) {
      bodyLines.push(block);
    }

    for (const alias of func.aliases) {
      bodyLines.push(TsNamespaceEmitter.emitFuncAlias(alias, ctx));
    }

    for (const assignment of func.assignments) {
      bodyLines.push(TsNamespaceEmitter.emitFuncSet(assignment, ctx));
    }

    const postConds = TsNamespaceEmitter.emitFuncPostConditions(func, ctx);
    for (const block of postConds) {
      bodyLines.push(block);
    }

    bodyLines.push(`  return result;`);

    return bodyLines;
  }

  /**
   * Emit a single func as a TypeScript function declaration.
   * T124, T126, FR-028, FR-030.
   */
  private static emitFunc(func: RuneFunc, ctx: FuncBodyContext, _isHoisted: boolean): string {
    const inputType = TsNamespaceEmitter.buildFuncInputType(func);
    const outputType = TsNamespaceEmitter.buildFuncOutputType(func);
    const signature = `export function ${func.name}(input: ${inputType}): ${outputType}`;

    const bodyLines = TsNamespaceEmitter.emitFuncBody(func, ctx);
    const body = bodyLines.join('\n');

    return `${signature} {\n${body}\n}`;
  }
}
