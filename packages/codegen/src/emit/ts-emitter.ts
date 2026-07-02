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
  isChoice,
  isData,
  isRosettaEnumeration,
  isRosettaBasicType,
  isRosettaTypeAlias,
  isData as _isData,
  type Choice,
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
  buildAttrAccessorNamesMap,
  activeConditions,
  mergeProfileTypeMaps,
  buildReportRulesLines,
  buildCrossNsImportLines,
  choiceOptionFieldName
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

  /**
   * W2: emit a `choice` declaration as a key-presence discriminated union
   * type (no class — a Choice is a type-only union, not an instantiable
   * shape like Data) plus an exactly-one-of type guard.
   *
   * Data-extends-Choice (user-directed correction, supersedes the spec
   * snippet where they differ): ALSO emit a SHAPE-level union
   * (`<Name>Shape = { cash: CashShape } | ...`) alongside the class-armed
   * one — see emitChoiceShapeTypeDeclaration's doc comment. The original
   * `export type <Name> = { cash: Cash } | ...` union is unchanged (W2
   * surface, non-goal).
   */
  emitChoice(choice: Choice): void {
    this.sections.push(this.emitChoiceTypeDeclaration(choice));
    this.sections.push('');
    this.sections.push(this.emitChoiceShapeTypeDeclaration(choice));
    this.sections.push('');
    this.sections.push(this.emitChoiceTypeGuard(choice));
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
        // Deliberately NOT gated on isData: a Choice supertype in another
        // namespace needs BOTH symbols too — `<Choice>Shape` (the generic
        // constraint/default on the child's Shape alias and class, per
        // emitChoiceShapeTypeDeclaration) and the bare `<Choice>` union.
        // Before Choices emitted a Shape-level union this ungated tracking
        // emitted a broken `import { AssetShape }` (TS2305, real corpus:
        // TransferableProduct/SpecificAsset extends Asset cross-namespace);
        // now the symbol exists and the same tracking is simply correct.
        trackRef(parentRef, `${parentRef.name}Shape`);
        trackRef(parentRef, parentRef.name);
      }
      // Multi-level Data-extends-Choice: the child's generic Shape alias
      // constraint references the Choice ANCESTOR's `<Choice>Shape` even
      // when the immediate parent is a Data — the ancestor may live in a
      // third namespace the immediate-parent tracking above never sees.
      if (parentRef && isData(parentRef)) {
        const choiceAncestor = TsNamespaceEmitter.findChoiceAncestor(parentRef as Data);
        if (choiceAncestor) {
          trackRef(choiceAncestor, `${choiceAncestor.name}Shape`);
        }
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
    // W2: a Choice-typed attribute resolves to the emitted Choice union
    // type name — was previously falling to 'unknown' (isChoice was never
    // consulted in this mapping).
    if (isChoice(typeRef)) return typeRef.name;

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
   * Walk UP a Data's `extends` chain (NOT including `data` itself, mirroring
   * zod-emitter.ts's `findChoiceAncestor` cycle-guard contract) and report
   * the Choice it bottoms out at, if any. Needed because `interface X
   * extends AliasWithUnionDefault` does not typecheck (TS2312: "An
   * interface can only extend an object type or intersection of object
   * types with statically known members") — a GENERIC alias whose default
   * type argument resolves to a union is exactly that shape. So once ANY
   * ancestor's Shape becomes the generic intersection alias (T105's
   * Data-extends-Choice case), every DESCENDANT's Shape must also become a
   * generic alias threading the same `T`, chaining `<Parent>Shape<T>`
   * rather than `extends <Parent>Shape` — unlike zod's runtime
   * `runeExtendChoice` (which must flatten to ONE call because a `z.union`
   * has no `.extend()`), TS type aliases chain naturally
   * (`type CShape<T> = BShape<T> & {...}` typechecks and still narrows
   * correctly at any depth — verified empirically), so no flattening is
   * needed here.
   */
  private static findChoiceAncestor(data: Data): Choice | undefined {
    const visited = new Set<string>([data.name]);
    let current: unknown = data.superType?.ref;
    while (current) {
      if (isChoice(current)) return current;
      if (!isData(current) || visited.has(current.name)) return undefined;
      visited.add(current.name);
      current = current.superType?.ref;
    }
    return undefined;
  }

  /**
   * Emit the `<TypeName>Shape` TYPE-level artifact.
   *
   * Ordinary case (no supertype, and no Choice ancestor anywhere up the
   * `extends` chain): `export interface <TypeName>Shape { ... }`, extending
   * `<Parent>Shape` when the parent is a Data in this namespace — own
   * attributes only, parent's are inherited via `extends`. UNCHANGED for
   * this feature.
   *
   * Data-extends-Choice (per docs/superpowers/specs/2026-07-02-
   * data-extends-choice-design.md "TS type — generic intersection", plus
   * the user-directed Shape-constraint correction): when
   * `data.superType.ref` is a `Choice` directly, an `interface … extends`
   * is not expressible (interfaces cannot extend a union) — the spec's own
   * type surface is `T & { ...extras }`, generic over the Choice arm.
   * Since the CLASS is already named `<TypeName>` (T106), the type alias is
   * emitted as `<TypeName>Shape` instead (collision-free naming, recorded
   * in the spec doc). The constraint/default is the Choice's SHAPE-level
   * union (`<Choice>Shape`, per emitChoiceShapeTypeDeclaration), NOT the
   * bare Choice union — the bare union's arms are the CLASS types, which
   * would world-mix a plain-data construction payload with class-armed
   * types: `export type <TypeName>Shape<T extends <Choice>Shape =
   * <Choice>Shape> = T & { ...own attrs };`. Bare `<TypeName>Shape` (no
   * type argument) still typechecks at every existing reference site
   * because the default type param is the full Shape-level union.
   *
   * Multi-level (`Data extends Data extends Choice`): when the IMMEDIATE
   * parent is a Data whose own chain reaches a Choice ancestor further up
   * (`findChoiceAncestor`), this Data's Shape must ALSO become a generic
   * alias threading the same `T` through the parent's generic Shape:
   * `export type <TypeName>Shape<T extends <ChoiceAncestor>Shape =
   * <ChoiceAncestor>Shape> = <Parent>Shape<T> & { ...own attrs };` — plain
   * `interface … extends <Parent>Shape` would fail to compile once
   * `<Parent>Shape` is itself the generic alias (its default resolves to a
   * union).
   * T105.
   */
  private emitInterface(data: Data): string {
    const name = data.name;
    const interfaceName = `${name}Shape`;

    const parentRef = data.superType?.ref;
    const choiceParent = parentRef && isChoice(parentRef) ? (parentRef as Choice) : undefined;
    const parentInNamespace = parentRef && isData(parentRef) && this.ctx.dataByName.has((parentRef as Data).name);
    const parentData = parentInNamespace ? (parentRef as Data) : undefined;
    const inheritedChoiceAncestor = parentData ? TsNamespaceEmitter.findChoiceAncestor(parentData) : undefined;

    // Own attribute field declarations — identical across all branches.
    const fields: string[] = [];
    for (const attr of data.attributes) {
      const baseType = this.resolveTypeExprAsTs(attr);
      const fieldDecl = TsNamespaceEmitter.applyCardinalityTs(attr.card, baseType, attr.name);
      fields.push(`  ${fieldDecl};`);
    }
    const body = fields.length === 0 ? '{}' : `{\n${fields.join('\n')}\n}`;

    if (choiceParent) {
      const constraint = `${choiceParent.name}Shape`;
      return `export type ${interfaceName}<T extends ${constraint} = ${constraint}> = T & ${body};`;
    }

    if (parentData && inheritedChoiceAncestor) {
      const constraint = `${inheritedChoiceAncestor.name}Shape`;
      return `export type ${interfaceName}<T extends ${constraint} = ${constraint}> = ${parentData.name}Shape<T> & ${body};`;
    }

    const parentInterfaceName = parentData ? `${parentData.name}Shape` : undefined;

    const header = parentInterfaceName
      ? `export interface ${interfaceName} extends ${parentInterfaceName}`
      : `export interface ${interfaceName}`;

    return `${header} ${body}`;
  }

  // ---------------------------------------------------------------------------
  // T106: emitClass
  // ---------------------------------------------------------------------------

  /**
   * Emit `export class <TypeName> implements <TypeName>Shape` (no parent)
   * or `export class <Child> extends <Parent> implements <Child>Shape` (with parent).
   * Includes instance field declarations and constructor.
   *
   * Data-extends-Choice (AMENDED per docs/superpowers/specs/2026-07-02-
   * data-extends-choice-design.md "TS class — generic child class"): when
   * `data.superType.ref` is a `Choice` (not a `Data`), there is no parent
   * CLASS to `extends` (a Choice is a type-only union, never emitted as a
   * class — see emitChoice's doc comment) — instead the child class itself
   * becomes generic over the Choice arm: `class <Name><T extends
   * <Choice>Shape = <Choice>Shape>` (constrained on the SHAPE-level Choice
   * union, per the user-directed correction — see
   * emitChoiceShapeTypeDeclaration's world-mixing rationale). `<Name>Shape`
   * is now the generic intersection type alias (T105, "TS type — generic
   * intersection") — its DEFAULT instantiation (`<Name>Shape` with no type
   * argument) is `<Choice>Shape & {...own attrs}`, a
   * union-rooted intersection, which a class cannot `implements` (classes
   * may only implement object types, not unions). So the class omits
   * `implements` for the Choice-parent case; `<Name>Shape<T>` remains the
   * single construction-time type used by the constructor parameter and
   * `static from`'s cast — the class/alias pairing is still verified by
   * the emitted-runtime behavior tests (real `tsc` + real execution), just
   * not via a structural `implements` clause. The constructor threads `T`
   * through its parameter (`data: <Name>Shape<T>`) and
   * `Object.assign(this, data)` copies the T-surface onto the instance,
   * while own attributes are still assigned explicitly afterward (unchanged
   * convention) so `typeof this.<attr>` narrowing keeps working. `static
   * from`/`new <Name>(...)` remain the only construction paths (no
   * competing `of<T>()` factory).
   * T106.
   */
  private emitClass(data: Data): string {
    const name = data.name;
    const interfaceName = `${name}Shape`;
    const parentRef = data.superType?.ref;
    const parentInNamespace = parentRef && isData(parentRef) && this.ctx.dataByName.has((parentRef as Data).name);
    const parentData = parentInNamespace ? (parentRef as Data) : undefined;
    const parentName = parentData?.name;
    const choiceParent = parentRef && isChoice(parentRef) ? (parentRef as Choice) : undefined;
    // Multi-level (Data extends Data extends Choice, per T105's
    // emitInterface): once the PARENT's own Shape is itself the generic
    // intersection alias, THIS Data's Shape (bare, default `T`) is also
    // union-rooted — `implements <Name>Shape` fails the same way it does
    // for a direct Choice parent (TS2422: a class can only implement an
    // object type, not a union). The class stays ordinary (`extends
    // <Parent>` only, no `<T>` on the class itself — the leaf Data doesn't
    // need its own generic param, `super(data)` structurally accepts the
    // wider bare Shape), it just drops `implements`.
    const inheritedChoiceAncestor = parentData ? TsNamespaceEmitter.findChoiceAncestor(parentData) : undefined;
    const shapeIsGeneric = choiceParent !== undefined || inheritedChoiceAncestor !== undefined;

    const classHeader = choiceParent
      ? `export class ${name}<T extends ${choiceParent.name}Shape = ${choiceParent.name}Shape>`
      : parentName
        ? shapeIsGeneric
          ? `export class ${name} extends ${parentName}`
          : `export class ${name} extends ${parentName} implements ${interfaceName}`
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
    if (choiceParent) {
      ctorBodyLines.push(`    Object.assign(this, data);`);
    } else if (parentName) {
      ctorBodyLines.push(`    super(data);`);
    }
    for (const attr of data.attributes) {
      ctorBodyLines.push(`    this.${attr.name} = data.${attr.name} as typeof this.${attr.name};`);
    }

    const hasOwnFields = data.attributes.length > 0;
    if (hasOwnFields) {
      lines.push('');
    }
    const ctorParamType = choiceParent ? `${interfaceName}<T>` : interfaceName;
    if (ctorBodyLines.length === 0) {
      lines.push(`  constructor(data: ${ctorParamType}) {}`);
    } else {
      lines.push(`  constructor(data: ${ctorParamType}) {`);
      for (const bodyLine of ctorBodyLines) {
        lines.push(bodyLine);
      }
      lines.push('  }');
    }

    // static from factory (T107)
    lines.push('');
    lines.push(TsNamespaceEmitter.emitFromFactory(data, shapeIsGeneric));

    // Data-extends-Choice: exactly-one-of validator over the inherited
    // Choice's option names, mirroring emitOneOf's ts-method emission
    // convention (runeCheckOneOf + errors.push), read off `this` since the
    // option keys were copied on via Object.assign in the constructor.
    if (choiceParent) {
      lines.push('');
      lines.push(this.emitChoiceParentValidateMethod(choiceParent, name));
    }

    // validate methods (T110)
    if (activeConditions(data).length > 0) {
      lines.push('');
      lines.push(this.emitValidateMethods(data));
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Data-extends-Choice: emit an exactly-one-of validate method for a
   * child's inherited Choice supertype — mirrors `emitOneOf`'s ts-method
   * body shape (`runeCheckOneOf` + `errors.push`) exactly, since this IS
   * the same exactly-one-of semantics as a `OneOfOperation`/
   * `ChoiceOperation` condition, just synthesized from the Choice's option
   * list instead of an authored `Condition` node.
   *
   * Reads `this.<choiceOptionFieldName>` — the REAL emitted field key
   * (camelCase, e.g. `cash`), populated by `Object.assign(this, data)` in
   * the constructor from the union member key (`{ cash: Cash }`, per
   * emitChoiceTypeDeclaration) — NOT `this.<OptionTypeName>` (`Cash`,
   * capitalized). The error MESSAGE still uses the bare option type names
   * (`optionNames`, matching the DSL-facing option list a reader expects to
   * see), but the RUNTIME CHECK must read the accessor names — the same
   * DSL-text-vs-real-field-key distinction the transpiler's
   * `attrAccessorNames` remap fixes for authored conditions
   * (base-namespace-emitter.ts's `buildAttrAccessorNamesMap` doc comment
   * has the full rationale).
   *
   * The read is cast via `(this as unknown as Record<string, unknown>)`
   * (matching `buildTypeGuardChecks`'s existing convention elsewhere in
   * this file): the class does NOT statically declare the option keys as
   * members (they only exist on `this` at runtime, via `Object.assign` in
   * the constructor) — a direct `this.cash` fails real `tsc --strict`
   * (TS2339, "Property 'cash' does not exist"), since TypeScript classes
   * cannot declare members from a type parameter (the same documented
   * limitation the spec's amended TS-class section calls out).
   */
  private emitChoiceParentValidateMethod(choice: Choice, childName: string): string {
    const optionNames = choice.attributes.map((option) => {
      const optionTypeRef = option.typeCall?.type;
      return optionTypeRef?.ref?.name ?? optionTypeRef?.$refText ?? '?';
    });
    const accessors = optionNames
      .map((n) => `(this as unknown as Record<string, unknown>).${choiceOptionFieldName(n)}`)
      .join(', ');
    const message = `${choice.name}: exactly one of [${optionNames.join(', ')}] must be present in ${childName}`;

    return [
      `  validate${choice.name}(): { valid: boolean; errors: string[] } {`,
      `    const errors: string[] = [];`,
      `    if (!runeCheckOneOf([${accessors}])) {`,
      `      errors.push('${message}');`,
      `    }`,
      `    return { valid: errors.length === 0, errors };`,
      `  }`
    ].join('\n');
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
  // W2: Choice emission
  // ---------------------------------------------------------------------------

  /**
   * Emit `export type <ChoiceName> = { option1: Type1 } | { option2: Type2 } | ...;`
   * — a key-presence discriminated union (not `z.discriminatedUnion`-style
   * literal-tag discrimination; CDM Choice instances are encoded as an
   * object with exactly ONE option key present, not a `$type` tag).
   */
  private emitChoiceTypeDeclaration(choice: Choice): string {
    const name = choice.name;
    const options = choice.attributes
      .map((option) => {
        const optionTypeRef = option.typeCall?.type;
        const optionTypeName = optionTypeRef?.ref?.name ?? optionTypeRef?.$refText ?? '?';
        const fieldName = choiceOptionFieldName(optionTypeName);
        return `{ ${fieldName}: ${optionTypeName} }`;
      })
      .join(' | ');
    if (options === '') {
      return `export type ${name} = never;`;
    }
    return `export type ${name} = ${options};`;
  }

  /**
   * Emit the SHAPE-level Choice union:
   * `export type <ChoiceName>Shape = { cash: CashShape } | { commodity: CommodityShape } | ...;`
   *
   * Data-extends-Choice (user-directed correction): the generic
   * intersection Shape alias and the generic child class must constrain
   * `T` on the Choice's SHAPE-level union, not the bare Choice union —
   * `emitChoiceTypeDeclaration`'s arms reference bare names, which for
   * Data options are the CLASS types, so `T extends <Choice>` would
   * intersect the plain-data (Shape) world with a class-armed union
   * (world-mixing: a `{ cash: { amount: 5 } }` construction payload is
   * not a `Cash` class instance). Each arm's value type here is the
   * option's `<Name>Shape` when the option resolves to a Data (the type
   * a construction payload actually carries at that key), and the bare
   * name otherwise (enums/builtins have no Shape form — same convention
   * as every other Shape-suffix site in this emitter).
   */
  private emitChoiceShapeTypeDeclaration(choice: Choice): string {
    const name = choice.name;
    const options = choice.attributes
      .map((option) => {
        const optionTypeRef = option.typeCall?.type;
        const optionTypeName = optionTypeRef?.ref?.name ?? optionTypeRef?.$refText ?? '?';
        const fieldName = choiceOptionFieldName(optionTypeName);
        const valueType = optionTypeRef?.ref && isData(optionTypeRef.ref) ? `${optionTypeName}Shape` : optionTypeName;
        return `{ ${fieldName}: ${valueType} }`;
      })
      .join(' | ');
    if (options === '') {
      return `export type ${name}Shape = never;`;
    }
    return `export type ${name}Shape = ${options};`;
  }

  /**
   * Emit `export function is<ChoiceName>(x: unknown): x is <ChoiceName>` —
   * an "exactly one of the option keys is present" validator, mirroring
   * runeCheckOneOf's one-of semantics (same as the ChoiceOperation condition
   * validator) but as a standalone type guard for the emitted union type.
   */
  private emitChoiceTypeGuard(choice: Choice): string {
    const name = choice.name;
    const fieldNames = choice.attributes.map((option) => {
      const optionTypeRef = option.typeCall?.type;
      const optionTypeName = optionTypeRef?.ref?.name ?? optionTypeRef?.$refText ?? '?';
      return choiceOptionFieldName(optionTypeName);
    });

    const accessors = fieldNames.map((f) => `(x as Record<string, unknown>).${f}`).join(', ');

    const lines: string[] = [
      `export function is${name}(x: unknown): x is ${name} {`,
      `  if (typeof x !== 'object' || x === null) return false;`,
      `  return runeCheckOneOf([${accessors}]);`,
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
    const attrAccessorNames = buildAttrAccessorNamesMap(data);
    return {
      selfName: 'this',
      emitMode: 'ts-method',
      conditionName,
      typeName: data.name,
      attributeTypes,
      diagnostics: this.ctx.diagnostics,
      attrAccessorNames
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
        ? [
            `import { runeCheckOneOf, runeCount, runeAttrExists, runeToDate, runeToTime, runeToDateTime, runeToZonedDateTime } from './runtime.js';`,
            ``
          ]
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
   *
   * @param castThroughUnknown - Data-extends-Choice (direct or inherited via
   *   a Data parent, per T105's `findChoiceAncestor`): bare `<Name>Shape`
   *   is `<Choice> & {...}`, a union-rooted intersection. `json` (typed
   *   `unknown` at this point, after the `is<Name>` guard) does not
   *   structurally overlap with that union closely enough for a single
   *   `as` — real `tsc --strict` reports TS2352 ("neither type sufficiently
   *   overlaps with the other") on a direct `json as <Name>Shape`. An
   *   `unknown` intermediate cast is the standard, narrower escape hatch
   *   (still a real assertion, not a semantic change — `is<Name>` already
   *   validated the runtime shape immediately above). Plain Data-extends-
   *   Data keeps the direct cast (unchanged, non-goal).
   */
  private static emitFromFactory(data: Data, castThroughUnknown: boolean): string {
    const name = data.name;
    const castExpr = castThroughUnknown ? `json as unknown as ${name}Shape` : `json as ${name}Shape`;
    return [
      `  static from(json: unknown): ${name} {`,
      `    if (!is${name}(json)) {`,
      `      throw new TypeError('not a ${name}: ' + JSON.stringify(json).slice(0, 100));`,
      `    }`,
      `    return new ${name}(${castExpr});`,
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
