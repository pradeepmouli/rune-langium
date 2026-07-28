// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Zod target emitter for the Rune code generator.
 *
 * Entry point: emitNamespace(model, options) → GeneratorOutput
 *
 * FR-002–FR-009, FR-021 (inline helpers), FR-022 (deterministic output).
 */

import type { NamespaceRegistry } from './namespace-registry.js';
import { emitNamespaceWithContract, type NamespaceEmitterOptions } from './namespace-emitter.js';
import { BaseNamespaceEmitter } from './base-namespace-emitter.js';
import { getTargetRelativePath, type NamespaceWalkResult } from './namespace-walker.js';
import { zodProfile } from './zod-profile.js';
import { typescriptProfile } from './typescript-profile.js';
import { getElementNamespace } from '@rune-langium/core';
import {
  isChoice,
  isData,
  isRosettaEnumeration,
  isRosettaBasicType,
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
import type { GeneratorOptions, GeneratorOutput, SourceMapEntry, GeneratorDiagnostic } from '../types.js';
import { RUNTIME_HELPER_SOURCE, buildRuntimeHelperImportLine } from '../helpers.js';
import { RUNE_EXTEND_CHOICE_HELPER_SOURCE } from './zod-runtime-helpers.js';
import {
  decodeCardinality,
  buildConditionTranspilerContext,
  activeConditions,
  mergeProfileTypeMaps,
  buildReportRulesLines,
  buildCrossNsImportLines,
  choiceOptionFieldName
} from './base-namespace-emitter.js';
import {
  transpileCondition,
  transpileExpression,
  buildConditionMessage,
  type ExpressionTranspilerContext
} from '../expr/transpiler.js';

/**
 * Internal emission context threaded through the emitter for one namespace.
 * FR-006 (lazy types), FR-007 (topo order), FR-009 (reserved word quoting).
 */
interface EmissionContext {
  /** The target being emitted (always 'zod' for this emitter). */
  target: 'zod';
  /** Sorted emit order for types in this namespace (topo-sorted). */
  emitOrder: readonly string[];
  /** Type names that require z.lazy() wrapping due to cycles. */
  lazyTypes: ReadonlySet<string>;
  /** Source-map entries collected during emission. */
  sourceMap: SourceMapEntry[];
  /** Generator-time diagnostics accumulated during emission. */
  diagnostics: GeneratorDiagnostic[];
  /** The namespace string (e.g., "cdm.base.math"). */
  namespace: string;
  /** All Data nodes keyed by name for lookup. */
  dataByName: ReadonlyMap<string, Data>;
  /** All Choice nodes keyed by name for lookup (W2). */
  choiceByName: ReadonlyMap<string, Choice>;
  /** All Enumeration nodes keyed by name for lookup. */
  enumByName: ReadonlyMap<string, RosettaEnumeration>;
  /** All RosettaTypeAlias nodes keyed by name for lookup. */
  typeAliasByName: ReadonlyMap<string, RosettaTypeAlias>;
  /** All RosettaRule nodes keyed by name for lookup. */
  rulesByName: ReadonlyMap<string, RosettaRule>;
  /** All RosettaReport nodes keyed by name for lookup. */
  reportsByName: ReadonlyMap<string, RosettaReport>;
  /** All Annotation nodes keyed by name for lookup. */
  annotationsByName: ReadonlyMap<string, Annotation>;
  /** All RosettaExternalFunction nodes keyed by name for lookup. */
  libraryFuncsByName: ReadonlyMap<string, RosettaExternalFunction>;
  /** Namespace registry for cross-namespace lookups. */
  registry: NamespaceRegistry;
  /** Merged builtin type map from the profile (basicTypeMap ∪ recordTypeMap ∪ typeAliasMap). */
  builtinTypeMap: Readonly<Record<string, string>>;
}

/**
 * TypeScript/JavaScript reserved words that must be quoted when used as property keys.
 * FR-009.
 */
const _RESERVED_WORDS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield'
]);

const ZOD_BUILTIN_TYPE_MAP: Readonly<Record<string, string>> = mergeProfileTypeMaps(zodProfile) as Record<
  string,
  string
>;

/**
 * Builtin → TypeScript type map for the interface declarations the Zod
 * emitter emits ALONGSIDE each schema. These must match what the companion
 * Zod schema *infers*, not the pure-TS target's representation.
 *
 * Critical for the temporal builtins: the Zod schemas use `z.iso.date()` /
 * `z.iso.time()` / `z.iso.datetime()`, all of which infer `string`. The
 * pure-TS target (ts-emitter / typescriptProfile) maps those to `Temporal.*`
 * because it has no schema to stay consistent with — but if the Zod emitter
 * used `Temporal.*` here, the emitted `interface` would diverge from
 * `z.infer<typeof Schema>` (and break cyclic `z.lazy()` interface types that
 * annotate the schema). So override the four temporal builtins to `string`.
 * Codex P1 on PR #224.
 */
const ZOD_TS_TYPE_MAP: Readonly<Record<string, string>> = {
  ...typescriptProfile.basicTypeMap,
  ...typescriptProfile.recordTypeMap,
  ...typescriptProfile.typeAliasMap,
  time: 'string',
  date: 'string',
  dateTime: 'string',
  zonedDateTime: 'string'
} as Record<string, string>;

function buildEmissionContext(model: NamespaceWalkResult, registry: NamespaceRegistry): EmissionContext {
  return {
    target: 'zod',
    emitOrder: model.emitOrder,
    lazyTypes: model.cyclicTypes,
    sourceMap: [],
    diagnostics: [],
    namespace: model.namespace,
    dataByName: model.dataByName,
    choiceByName: model.choiceByName,
    enumByName: model.enumByName,
    typeAliasByName: model.typeAliasByName,
    rulesByName: model.rulesByName,
    reportsByName: model.reportsByName,
    annotationsByName: model.annotationsByName,
    libraryFuncsByName: model.libraryFuncsByName,
    registry,
    builtinTypeMap: ZOD_BUILTIN_TYPE_MAP
  };
}

/**
 * Emit one namespace as a single .zod.ts file.
 *
 * Entry point for the Zod emitter.
 * FR-001 (one file per namespace), FR-022 (deterministic output).
 */
export function emitNamespace(
  model: NamespaceWalkResult,
  options: GeneratorOptions,
  registry: NamespaceRegistry = { namespaces: new Map() }
): GeneratorOutput {
  return emitNamespaceWithContract(model, options, registry, ZodNamespaceEmitter);
}

export class ZodNamespaceEmitter extends BaseNamespaceEmitter {
  private readonly ctx: EmissionContext;
  private readonly sections: string[] = [];

  constructor(
    model: NamespaceWalkResult,
    options: NamespaceEmitterOptions,
    registry: NamespaceRegistry = { namespaces: new Map() }
  ) {
    super(model, options, registry);
    this.ctx = buildEmissionContext(model, registry);
  }

  emitHeader(): void {
    this.sections.push(this.buildFileHeader());
  }

  emitCrossNamespaceImports(): void {
    const crossNsImports = this.collectCrossNamespaceImports();
    if (crossNsImports.length > 0) {
      this.sections.push(crossNsImports.join('\n'));
      this.sections.push('');
    }
  }

  emitEnumeration(enumNode: RosettaEnumeration): void {
    this.sections.push(this.emitEnum(enumNode));
    this.sections.push('');
  }

  emitTypeAlias(typeAlias: RosettaTypeAlias): void {
    this.sections.push('');
    this.sections.push(this.emitTypeAliasSchema(typeAlias));
  }

  emitDataPrelude(): void {
    const cyclicDataNames = Array.from(this.ctx.lazyTypes)
      .filter((name) => this.ctx.dataByName.has(name))
      .sort();
    if (cyclicDataNames.length === 0) return;
    for (const typeName of cyclicDataNames) {
      this.sections.push(this.emitCyclicInterface(this.ctx.dataByName.get(typeName)!));
    }
    this.sections.push('');
  }

  emitData(data: Data): void {
    this.sections.push(this.emitTypeSchema(data));
    const alias = this.emitInferAlias(data);
    if (alias) this.sections.push(alias);
    this.sections.push('');
  }

  /**
   * W2: emit a `choice` declaration as `z.union([...])` of per-option
   * `z.object` shapes (key-presence discrimination — `z.discriminatedUnion`
   * doesn't apply, there is no literal tag field), mirroring emitData's
   * schema + z.infer-alias pairing.
   */
  emitChoice(choice: Choice): void {
    this.sections.push(this.emitChoiceSchema(choice));
    this.sections.push(`export type ${choice.name} = z.infer<typeof ${choice.name}Schema>;`);
    this.sections.push('');
  }

  emitRule(rule: RosettaRule): void {
    const result = this.emitRuleValidator(rule);
    if (result) {
      this.sections.push('');
      this.sections.push(result);
    }
  }

  emitReportMetadata(): void {
    const reportMeta = this.buildReportMetadataText();
    if (reportMeta !== '') {
      this.sections.push('');
      this.sections.push(reportMeta);
    }
  }

  finalize(): GeneratorOutput {
    while (this.sections.length > 0 && this.sections[this.sections.length - 1] === '') {
      this.sections.pop();
    }
    return {
      relativePath: getTargetRelativePath(this.model.namespace, 'zod'),
      content: this.sections.join('\n') + '\n',
      sourceMap: this.ctx.sourceMap,
      diagnostics: this.ctx.diagnostics,
      funcs: []
    };
  }

  // ---------------------------------------------------------------------------
  // Private instance methods (ctx-taking helpers moved in)
  // ---------------------------------------------------------------------------

  /**
   * Collect cross-namespace import statements needed for the schemas and type aliases
   * defined in this emission context.
   *
   * Walks all Data superType references and attribute type references, plus
   * TypeAlias type references. Any resolved reference whose namespace differs
   * from `ctx.namespace` is recorded and emitted as an ES import statement
   * importing Schema names (e.g. FooSchema) from the corresponding .zod.js file.
   */
  private collectCrossNamespaceImports(): string[] {
    const imports = new Map<string, Set<string>>(); // namespace -> schema symbol names

    const trackRef = (typeRef: unknown, schemaName: string): void => {
      if (!typeRef || typeof typeRef !== 'object') return;
      const ns = getElementNamespace(typeRef as { $container?: unknown });
      if (!ns || ns === this.ctx.namespace) return;

      let symbols = imports.get(ns);
      if (!symbols) {
        symbols = new Set();
        imports.set(ns, symbols);
      }
      symbols.add(schemaName);
    };

    // Check data type inheritance and attribute references
    for (const data of this.ctx.dataByName.values()) {
      // Check superType
      const parentRef = data.superType?.ref;
      if (parentRef) {
        trackRef(parentRef, `${parentRef.name}Schema`);
      }
      // Multi-level Data-extends-Choice (buildSuperTypeSchemaExpr's
      // choice-ancestor branch): the emitted schema is ONE
      // `runeExtendChoice(<ChoiceAncestor>Schema, {...})` call that (a)
      // references the Choice ANCESTOR's schema — which sits 2+ links up
      // the chain, possibly in a namespace the immediate-parent tracking
      // above never sees — and (b) folds the own attributes of the
      // immediate Data parent and every further intermediate INLINE into
      // THIS file (buildRuneExtendChoiceExpr's `[data, superRef,
      // ...intermediates]` fold), so those attributes' schema refs are
      // emitted here too and must be imported relative to THIS namespace,
      // even though the attribute-tracking loop below only ever iterates
      // this namespace's own data. (The DIRECT Data-extends-Choice case
      // needs neither: the immediate parentRef IS the Choice, covered by
      // the unconditional trackRef above, and no foreign attributes are
      // folded.) Reuses findChoiceAncestor — same walk, same cycle guard.
      if (parentRef && isData(parentRef)) {
        const choiceAncestor = ZodNamespaceEmitter.findChoiceAncestor(parentRef);
        if (choiceAncestor) {
          trackRef(choiceAncestor.choice, `${choiceAncestor.choice.name}Schema`);
          for (const link of [parentRef, ...choiceAncestor.intermediates]) {
            for (const attr of link.attributes) {
              const attrTypeRef = attr.typeCall?.type?.ref;
              if (attrTypeRef && (isData(attrTypeRef) || isRosettaEnumeration(attrTypeRef))) {
                trackRef(attrTypeRef, `${attrTypeRef.name}Schema`);
              }
            }
          }
        }
      }
      // Check attribute types
      for (const attr of data.attributes) {
        const attrTypeRef = attr.typeCall?.type?.ref;
        if (attrTypeRef && isData(attrTypeRef)) {
          trackRef(attrTypeRef, `${attrTypeRef.name}Schema`);
        } else if (attrTypeRef && isRosettaEnumeration(attrTypeRef)) {
          trackRef(attrTypeRef, `${attrTypeRef.name}Schema`);
        } else if (attrTypeRef && isChoice(attrTypeRef)) {
          // Item 3 (docs/superpowers/specs/2026-07-02-emitter-crossns-
          // hardening-design.md): a Choice-typed attribute resolves to
          // `<Choice>Schema` via resolveTypeExpr (isChoice branch, W2) —
          // same $import convention as Data/Enum attribute types, was
          // previously untracked.
          trackRef(attrTypeRef, `${attrTypeRef.name}Schema`);
        }
      }
    }

    // Check type alias references
    for (const alias of this.ctx.typeAliasByName.values()) {
      const typeRef = alias.typeCall?.type?.ref;
      if (typeRef && isData(typeRef)) {
        trackRef(typeRef, `${typeRef.name}Schema`);
      } else if (typeRef && isRosettaEnumeration(typeRef)) {
        trackRef(typeRef, `${typeRef.name}Schema`);
      }
    }

    return buildCrossNsImportLines(imports, this.ctx.namespace, this.ctx.registry, '.zod.js');
  }

  /**
   * Resolve the Zod type expression for an attribute's type reference.
   * Handles built-ins (RosettaBasicType), Data (object refs), Enumerations.
   *
   * Falls back to $refText-based lookup for unresolved references (e.g., when
   * only a single file is parsed without the full workspace — common for fixtures).
   */
  private resolveTypeExpr(attr: Attribute): string {
    const typeRef = attr.typeCall?.type?.ref;
    const refText = attr.typeCall?.type?.$refText;

    if (!typeRef) {
      // Unresolved reference — try to recover using $refText
      if (refText) {
        // Check if it's a known built-in type name
        const builtinZod = this.ctx.builtinTypeMap[refText];
        if (builtinZod) {
          return builtinZod;
        }
        // Check if it's an enum in the current namespace
        if (this.ctx.enumByName.has(refText)) {
          return `${refText}Schema`;
        }
        // Check if it's a data type in the current namespace
        if (this.ctx.dataByName.has(refText)) {
          return `${refText}Schema`;
        }
        // Check if it's a choice in the current namespace (W2)
        if (this.ctx.choiceByName.has(refText)) {
          return `${refText}Schema`;
        }
        // Unknown but named — emit schema reference optimistically
        this.ctx.diagnostics.push({
          severity: 'warning',
          code: 'unresolved-ref',
          message: `Attribute '${attr.name}': type '${refText}' is not resolved; emitting optimistic schema reference`
        });
        return `${refText}Schema`;
      }
      // Truly anonymous unresolved reference
      this.ctx.diagnostics.push({
        severity: 'warning',
        code: 'unresolved-ref',
        message: `Attribute '${attr.name}' has an unresolved type reference; emitting z.unknown()`
      });
      return 'z.unknown()';
    }

    if (isRosettaBasicType(typeRef)) {
      const typeName = typeRef.name;
      const mapped = this.ctx.builtinTypeMap[typeName];
      if (mapped) return mapped;
      this.ctx.diagnostics.push({
        severity: 'warning',
        code: 'unmapped-builtin',
        message: `Builtin type '${typeName}' has no Zod mapping; emitting z.unknown()`
      });
      return 'z.unknown()';
    }

    if (isRosettaEnumeration(typeRef)) {
      // Reference to an enum → use the enum schema name
      return `${typeRef.name}Schema`;
    }

    if (isData(typeRef)) {
      // Reference to a data type → use the schema name
      return `${typeRef.name}Schema`;
    }

    if (isChoice(typeRef)) {
      // W2: reference to a choice → use the choice union schema name
      // (was falling to z.unknown() — isChoice was never consulted here).
      return `${typeRef.name}Schema`;
    }

    // Unknown reference type — try $refText fallback
    if (refText) {
      const builtinZod = this.ctx.builtinTypeMap[refText];
      if (builtinZod) return builtinZod;
    }

    this.ctx.diagnostics.push({
      severity: 'warning',
      code: 'unresolved-ref',
      message: `Unknown type reference kind for attribute '${attr.name}'; emitting z.unknown()`
    });
    return 'z.unknown()';
  }

  // ---------------------------------------------------------------------------
  // W2: Choice emission
  // ---------------------------------------------------------------------------

  /**
   * Emit `export const <ChoiceName>Schema = z.union([z.object({ opt: OptSchema }), ...]);`
   * — key-presence discrimination via z.union of single-key object shapes,
   * mirroring emitObjectBody's per-attribute z.object conventions.
   */
  private emitChoiceSchema(choice: Choice): string {
    const name = choice.name;
    const schemaName = `${name}Schema`;

    const optionSchemas = choice.attributes.map((option) => {
      const optionTypeRef = option.typeCall?.type;
      const optionTypeName = optionTypeRef?.ref?.name ?? optionTypeRef?.$refText ?? 'unknown';
      const fieldName = choiceOptionFieldName(optionTypeName);
      const optionSchemaExpr = this.ctx.builtinTypeMap[optionTypeName] ?? `${optionTypeName}Schema`;
      // .strict(): non-strict objects allow unknown keys, so {cash, commodity}
      // would satisfy the first arm — strict arms make multi-option objects
      // fail every arm, enforcing the exactly-one-of Choice semantics.
      return `z.strictObject({ ${fieldName}: ${optionSchemaExpr} })`;
    });

    if (optionSchemas.length === 0) {
      return `export const ${schemaName} = z.never();`;
    }

    return `export const ${schemaName} = z.union([${optionSchemas.join(', ')}]);`;
  }

  /**
   * Emit a single attribute as a Zod object property entry.
   * FR-003 (cardinality), FR-009 (reserved-word quoting).
   */
  private emitAttribute(attr: Attribute): string {
    const baseTypeExpr = this.resolveTypeExpr(attr);
    const card = attr.card;
    const zodExpr = ZodNamespaceEmitter.applyCardinality(card, baseTypeExpr);
    const key = ZodNamespaceEmitter.quoteKey(attr.name);
    return `  ${key}: ${zodExpr}`;
  }

  /**
   * Emit a z.object({...}) body for a data type's own attributes (not inherited).
   * Returns the Zod expression for the body (without the schema name assignment).
   */
  private emitObjectBody(data: Data): string {
    if (data.attributes.length === 0) {
      return 'z.object({})'; // FR-008
    }
    const attrs = data.attributes.map((attr) => this.emitAttribute(attr));
    // Join with comma+newline between entries; no trailing comma (linter rule: trailingComma: "none")
    return `z.object({\n${attrs.join(',\n')}\n})`;
  }

  /**
   * Walk UP a Data's `extends` chain (NOT including `data` itself) and
   * report whether it bottoms out at a Choice, and if so which Data nodes
   * sit between `data` and that Choice (nearest-first).
   *
   * Needed because a Data parent that is ITSELF Choice-derived emits as
   * `runeExtendChoice(...)`, whose result is a `z.union(...)` — like the
   * Choice itself, a union has no `.extend()` method. So `${parentSchema}
   * .extend({...})` is only safe when the immediate parent's OWN schema is
   * a plain `z.object`/`.extend()` chain, i.e. when the parent's chain does
   * NOT reach a Choice. Multi-level `Data extends Data extends Choice`
   * (spec's Semantics: "extras accumulate down to the Choice ancestor")
   * must instead emit ONE `runeExtendChoice(<ChoiceAncestor>Schema, {...})`
   * call at the point where the chain first reaches the Choice, folding in
   * every intermediate Data's own attributes — not a chain of `.extend()`
   * calls on top of a union result.
   *
   * A visited-set guards a malformed cyclic `extends` chain, mirroring
   * `buildAttributeTypesMap`'s cycle guard (base-namespace-emitter.ts).
   */
  private static findChoiceAncestor(data: Data): { choice: Choice; intermediates: Data[] } | undefined {
    const intermediates: Data[] = [];
    const visited = new Set<string>([data.name]);
    let current: unknown = data.superType?.ref;
    while (current) {
      if (isChoice(current)) {
        return { choice: current, intermediates };
      }
      if (!isData(current) || visited.has(current.name)) {
        return undefined;
      }
      visited.add(current.name);
      intermediates.push(current);
      current = current.superType?.ref;
    }
    return undefined;
  }

  /**
   * Build the base (pre-condition, pre-lazy) schema expression for a Data
   * type's superType chain, at a given attribute-line indentation.
   *
   * Cases, in order:
   *  - The `extends` chain (from `data`, inclusive of `data`'s own
   *    superType) reaches a Choice ancestor (Data-extends-Choice, possibly
   *    through intermediate Data links — see docs/superpowers/specs/
   *    2026-07-02-data-extends-choice-design.md): emit ONE
   *    `runeExtendChoice(<ChoiceAncestor>Schema, {...})` call whose shape
   *    is the UNION of every intermediate Data's own attributes plus
   *    `data`'s own attributes (nearest-declared wins on a name collision,
   *    matching `buildAttributeTypesMap`'s own "nearest wins" rule) — NOT a
   *    chain of `.extend()` calls on top of a `runeExtendChoice(...)`
   *    result (a `z.union(...)`  has no `.extend()`; `.extend()` is only
   *    defined on `z.object`/`z.strictObject`, and calling it on a union
   *    throws at MODULE-INIT time — this was the real, previously-
   *    unguarded bug for BOTH the single-level and multi-level cases).
   *  - No Choice ancestor, but `data.superType?.ref` is a Data:
   *    `${ParentSchema}.extend({...})` — the ordinary FR-005 path,
   *    unchanged.
   *  - No superType: a plain `z.object({...})` body (emitObjectBody).
   *
   * `attrIndent` controls the object-body indentation for own attributes,
   * matching the two call sites' existing formatting conventions (2-space
   * for the non-conditions path via emitAttribute's own 2-space prefix,
   * 4-space reindented for the chained conditions path).
   */
  private buildSuperTypeSchemaExpr(data: Data, attrIndent: '' | '  '): string {
    const superRef = data.superType?.ref;

    if (superRef && isChoice(superRef)) {
      return this.buildRuneExtendChoiceExpr(superRef, [data], attrIndent);
    }

    if (superRef && isData(superRef)) {
      // `findChoiceAncestor(superRef)`'s `intermediates` starts its walk
      // from `superRef.superType.ref` — it never includes `superRef` ITSELF
      // (findChoiceAncestor's own contract: "NOT including `data` [here,
      // `superRef`] itself"). `superRef`'s own attributes (e.g.
      // ObservableItem's `identifier`) must still be folded in — prepend
      // `superRef` explicitly alongside `data`.
      const choiceAncestor = ZodNamespaceEmitter.findChoiceAncestor(superRef);
      if (choiceAncestor) {
        // Multi-level: fold `data`'s own attrs on top of every intermediate
        // Data's own attrs (superRef, then each further intermediate up to
        // — but not including — the Choice), nearest-first, and derive
        // ONCE from the Choice ancestor's schema.
        return this.buildRuneExtendChoiceExpr(
          choiceAncestor.choice,
          [data, superRef, ...choiceAncestor.intermediates],
          attrIndent
        );
      }

      const parentSchema = `${superRef.name}Schema`;
      if (data.attributes.length === 0) {
        return `${parentSchema}.extend({})`;
      }
      const attrs = data.attributes.map((attr) => this.emitAttribute(attr));
      const reindented = attrIndent === '' ? attrs.join(',\n') : attrs.map((a) => `${attrIndent}${a}`).join(',\n');
      return `${parentSchema}.extend({\n${reindented}\n})`;
    }

    return this.emitObjectBody(data);
  }

  /**
   * Build a `runeExtendChoice(<ChoiceName>Schema, {...})` call, folding the
   * own attributes of every Data in `dataChain` (nearest-declared-wins on a
   * name collision) into the shape object.
   */
  private buildRuneExtendChoiceExpr(choice: Choice, dataChain: Data[], attrIndent: '' | '  '): string {
    const choiceSchema = `${choice.name}Schema`;

    const seen = new Set<string>();
    const attrLines: string[] = [];
    for (const link of dataChain) {
      for (const attr of link.attributes) {
        if (seen.has(attr.name)) continue;
        seen.add(attr.name);
        attrLines.push(this.emitAttribute(attr));
      }
    }

    if (attrLines.length === 0) {
      return `runeExtendChoice(${choiceSchema}, {})`;
    }
    const reindented =
      attrIndent === '' ? attrLines.join(',\n') : attrLines.map((a) => `${attrIndent}${a}`).join(',\n');
    return `runeExtendChoice(${choiceSchema}, {\n${reindented}\n})`;
  }

  /**
   * Emit a full schema declaration for a Data type.
   * Handles: plain object, extends, lazy wrapping for cycles, condition blocks.
   * FR-002 (exports), FR-005 (extends), FR-006 (lazy), FR-008 (empty).
   * FR-010, FR-011 (conditions via emitConditionBlock). T056.
   */
  private emitTypeSchema(data: Data): string {
    const name = data.name;
    const schemaName = `${name}Schema`;
    const isLazy = this.ctx.lazyTypes.has(name);
    const hasConditions = activeConditions(data).length > 0;

    const schemaExpr = this.buildSuperTypeSchemaExpr(data, '');

    if (isLazy) {
      // For cyclic types: add explicit ZodType annotation so TS can infer recursive schemas.
      // Conditions inside lazy: wrap the condition inside the lazy callback.
      if (hasConditions) {
        const condBlock = this.emitConditionBlock(data);
        const innerExpr = `${schemaExpr}\n${condBlock}`;
        const indented = innerExpr
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n');
        return `export const ${schemaName}: z.ZodType<${name}> = z.lazy(() =>\n${indented}\n);`;
      }
      const indented = schemaExpr
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n');
      return `export const ${schemaName}: z.ZodType<${name}> = z.lazy(() =>\n${indented}\n);`;
    }

    if (hasConditions) {
      const condBlock = this.emitConditionBlock(data);
      // Format as oxfmt-style method chain:
      //   export const Schema = z
      //     .object({
      //       a: z.string().optional(),
      //       ...
      //     })
      //     .refine(...)
      //
      // Strategy: rebuild the object body with 4-space attr indentation, then chain.
      if (data.superType?.ref) {
        // extend/runeExtendChoice chain: For simplicity, emit as
        // non-chained since .extend()/runeExtendChoice() reads on a schema
        // ref (or the helper call), not the bare `z` namespace.
        const chainedObjectExpr = this.buildSuperTypeSchemaExpr(data, '  ');
        const condIndented = condBlock
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n');
        return `export const ${schemaName} = ${chainedObjectExpr}\n${condIndented};`;
      } else {
        // z.object chain: build chain as `z\n  .object({...})\n  .refine(...)`
        const attrLines = data.attributes.length === 0 ? [] : data.attributes.map((attr) => this.emitAttribute(attr));
        // Build object body with 4-space attribute indentation.
        // emitAttribute returns '  key: val' (2-space prefix), so add 2 more for 4 total.
        const objectBody =
          attrLines.length === 0 ? `.object({})` : `.object({\n${attrLines.map((a) => `  ${a}`).join(',\n')}\n  })`;
        // Condition block indented 2 spaces
        const condIndented = condBlock
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n');
        return `export const ${schemaName} = z\n  ${objectBody}\n${condIndented};`;
      }
    }

    // Append .meta() for type-level annotations (T068, T069).
    // Only supported for non-lazy, non-condition schemas (the common case).
    const metaSuffix = ZodNamespaceEmitter.buildMetaSuffix(data);
    if (metaSuffix) {
      return `export const ${schemaName} = ${schemaExpr}${metaSuffix};`;
    }

    return `export const ${schemaName} = ${schemaExpr};`;
  }

  /**
   * Emit the TypeScript interface for a cyclic type.
   * For cyclic types, we need the interface declared BEFORE the schema
   * because `z.ZodType<NodeA>` references the TS type `NodeA`.
   */
  private emitCyclicInterface(data: Data): string {
    const name = data.name;
    const fields: string[] = [];

    for (const attr of data.attributes) {
      const baseTypeExpr = this.resolveTypeExprAsTs(attr);
      const card = attr.card;
      const tsField = ZodNamespaceEmitter.applyCardinalityTs(card, baseTypeExpr, attr.name);
      fields.push(`  ${tsField};`);
    }

    if (fields.length === 0) {
      return `export interface ${name} {}`;
    }

    return `export interface ${name} {\n${fields.join('\n')}\n}`;
  }

  /**
   * Resolve the TypeScript type expression for an attribute (for interface declarations).
   */
  private resolveTypeExprAsTs(attr: Attribute): string {
    const typeRef = attr.typeCall?.type?.ref;
    const refText = attr.typeCall?.type?.$refText;

    if (!typeRef) {
      if (refText) {
        const builtinTs = ZOD_TS_TYPE_MAP[refText];
        if (builtinTs) return builtinTs;
        return refText; // data type name
      }
      return 'unknown';
    }

    if (isRosettaBasicType(typeRef)) {
      const mapped = ZOD_TS_TYPE_MAP[typeRef.name];
      if (mapped) return mapped;
      this.ctx.diagnostics.push({
        severity: 'warning',
        code: 'unmapped-builtin',
        message: `Builtin type '${typeRef.name}' has no TypeScript mapping in interface for '${attr.name}'; emitting unknown`
      });
      return 'unknown';
    }

    if (isRosettaEnumeration(typeRef)) return typeRef.name;
    if (_isData(typeRef)) return typeRef.name;

    if (refText) {
      const builtinTs = ZOD_TS_TYPE_MAP[refText];
      if (builtinTs) return builtinTs;
    }
    return 'unknown';
  }

  /**
   * Emit the type alias (z.infer<typeof Schema>).
   * For cyclic types the interface is emitted separately (pre-declaration).
   * FR-002 (z.infer alias for every type).
   * Renamed from emitTypeAlias to avoid collision with the public interface method.
   */
  private emitInferAlias(data: Data): string {
    const name = data.name;
    const schemaName = `${name}Schema`;
    // Cyclic types already have an interface declaration; skip z.infer alias
    // (the schema already uses the declared interface as z.ZodType<TypeName>)
    if (this.ctx.lazyTypes.has(name)) {
      return ''; // interface was already declared; no additional alias needed
    }
    return `export type ${name} = z.infer<typeof ${schemaName}>;`;
  }

  /**
   * Build an ExpressionTranspilerContext for a given Data node and emit mode.
   * T055.
   */
  private buildTranspilerContext(
    data: Data,
    emitMode: 'zod-refine' | 'zod-superRefine',
    conditionName: string
  ): ExpressionTranspilerContext {
    return buildConditionTranspilerContext(data, emitMode, conditionName, this.ctx.diagnostics);
  }

  /**
   * Emit the condition block for a Data type.
   * FR-010 (refine vs superRefine), FR-011 (single superRefine for multi-condition).
   * T055.
   *
   * Returns a string like `.refine(...)` or `.superRefine(...)` to be appended
   * to the schema expression. Returns empty string if no conditions.
   */
  private emitConditionBlock(data: Data): string {
    // Filter out conditions that have no expression or are unsupported
    const activeConds = activeConditions(data);
    if (activeConds.length === 0) return '';

    if (activeConds.length === 1) {
      const cond = activeConds[0]!;
      const condName = cond.name ?? 'Condition';
      const transpilerCtx = this.buildTranspilerContext(data, 'zod-refine', condName);
      const predicate = transpileCondition(cond, transpilerCtx);
      const message = buildConditionMessage(cond, transpilerCtx);
      // Use inline form when the full chained line fits within 100 chars (oxfmt printWidth).
      // The chain is indented 2 spaces in emitTypeSchema, so the full line is:
      //   "  .refine((data) => <pred>, '<msg>');"
      // = 2 + ".refine((data) => ".length + pred.length + ", '".length + msg.length + "');" = ?
      const inlineLine = `  .refine((data) => ${predicate}, '${message}');`;
      if (!predicate.includes('\n') && inlineLine.length <= 100) {
        return `.refine((data) => ${predicate}, '${message}')`;
      }
      return [`.refine(`, `  (data) => ${predicate},`, `  '${message}'`, `)`].join('\n');
    }

    // ≥ 2 conditions → single .superRefine() per FR-011
    const lines: string[] = ['.superRefine((data, ctx) => {'];
    for (const cond of activeConds) {
      const condName = cond.name ?? 'Condition';
      const transpilerCtx = this.buildTranspilerContext(data, 'zod-superRefine', condName);
      const body = transpileCondition(cond, transpilerCtx);
      // Indent each line of the body by 2 spaces.
      // emitTypeSchema will then add 2 more via condIndented = total 4 spaces.
      const indented = body
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n');
      lines.push(indented);
    }
    lines.push('})');
    return lines.join('\n');
  }

  /**
   * Emit a Zod enum schema for a RosettaEnumeration.
   * FR-004 (z.enum + display-name Record).
   */
  private emitEnum(enumNode: RosettaEnumeration): string {
    const name = enumNode.name;
    const schemaName = `${name}Schema`;

    const memberNames = enumNode.enumValues.map((v) => v.name);

    if (memberNames.length === 0) {
      this.ctx.diagnostics.push({
        severity: 'warning',
        code: 'empty-enum',
        message: `Enum '${name}' has no values; emitting z.enum([]) which is not valid Zod — treating as z.never()`
      });
      return [`export const ${schemaName} = z.never();`, `export type ${name} = z.infer<typeof ${schemaName}>;`].join(
        '\n'
      );
    }

    const memberLiterals = memberNames.map((m) => `'${m}'`).join(', ');
    const lines: string[] = [
      `export const ${schemaName} = z.enum([${memberLiterals}]);`,
      `export type ${name} = z.infer<typeof ${schemaName}>;`
    ];

    // Emit display-name companion if any member has a display name
    const hasDisplayNames = enumNode.enumValues.some((v) => v.display != null);
    if (hasDisplayNames) {
      const displayEntries = enumNode.enumValues.map((v) => {
        // Use single-quoted value (oxfmt singleQuote: true); key unquoted (valid ES5+ property key)
        const displayName =
          v.display != null
            ? ZodNamespaceEmitter.escapeDisplayName(v.display)
            : ZodNamespaceEmitter.escapeDisplayName(v.name);
        return `  ${v.name}: '${displayName}'`;
      });
      lines.push('');
      lines.push(`export const ${name}DisplayNames: Record<${name}, string> = {\n${displayEntries.join(',\n')}\n};`);
    }

    return lines.join('\n');
  }

  /**
   * Emit a Zod schema and type alias for a RosettaTypeAlias node.
   * NOTE: not named `emitTypeAlias` — that name is taken by the public interface method.
   */
  private emitTypeAliasSchema(alias: RosettaTypeAlias): string {
    const name = alias.name;
    const schemaName = `${name}Schema`;
    const typeRef = alias.typeCall?.type?.ref;
    const refText = alias.typeCall?.type?.$refText;

    // Resolve to a Zod schema expression
    let zodExpr = 'z.unknown()';

    if (typeRef && isRosettaBasicType(typeRef)) {
      const mapped = this.ctx.builtinTypeMap[typeRef.name];
      if (mapped) {
        zodExpr = mapped;
      } else {
        this.ctx.diagnostics.push({
          severity: 'warning',
          code: 'unmapped-builtin',
          message: `Builtin type '${typeRef.name}' has no Zod mapping in type alias '${alias.name}'; emitting z.unknown()`
        });
      }
    } else if (typeRef && isRosettaEnumeration(typeRef)) {
      zodExpr = `${typeRef.name}Schema`;
    } else if (typeRef && isData(typeRef)) {
      zodExpr = `${typeRef.name}Schema`;
    } else if (refText) {
      const builtinZod = this.ctx.builtinTypeMap[refText];
      if (builtinZod) zodExpr = builtinZod;
      else if (this.ctx.enumByName.has(refText)) zodExpr = `${refText}Schema`;
      else if (this.ctx.dataByName.has(refText)) zodExpr = `${refText}Schema`;
      else zodExpr = 'z.unknown()';
    }

    const lines: string[] = [
      `export const ${schemaName} = ${zodExpr};`,
      `export type ${name} = z.infer<typeof ${schemaName}>;`
    ];

    return lines.join('\n');
  }

  /**
   * Build the `runeReportRules` const string for all rules in this namespace.
   * Renamed from emitReportMetadata to avoid collision with the public interface method.
   * Returns an empty string when there are no rules in the namespace.
   */
  private buildReportMetadataText(): string {
    const lines = buildReportRulesLines(this.ctx.rulesByName);
    return lines.length === 0 ? '' : lines.join('\n');
  }

  /**
   * Emit a Zod refine validator for a RosettaRule.
   * Only emitted when the rule has a resolvable input type with a known schema.
   */
  private emitRuleValidator(rule: RosettaRule): string {
    const name = rule.name;
    const inputTypeRef = rule.input?.type?.ref;
    const inputTypeName = inputTypeRef ? inputTypeRef.name : undefined;

    if (!inputTypeName) {
      this.ctx.diagnostics.push({
        severity: 'warning',
        code: 'rule-no-input-type',
        message: `Rule '${name}' has no resolvable input type; skipping Zod validator`
      });
      return '';
    }

    const isLocal = this.ctx.dataByName.has(inputTypeName);
    const isCrossNs = !isLocal && inputTypeRef && getElementNamespace(inputTypeRef) !== this.ctx.namespace;
    if (!isLocal && !isCrossNs) {
      this.ctx.diagnostics.push({
        severity: 'warning',
        code: 'rule-no-input-type',
        message: `Rule '${name}': input type '${inputTypeName}' not found; skipping Zod validator`
      });
      return '';
    }

    const schemaName = `${inputTypeName}Schema`;
    const attributeTypes = new Map<string, string>();
    const inputData =
      this.ctx.dataByName.get(inputTypeName) ?? (inputTypeRef && isData(inputTypeRef) ? inputTypeRef : undefined);
    if (inputData && 'attributes' in inputData) {
      for (const attr of (
        inputData as {
          attributes: Array<{ name: string; typeCall?: { type?: { $refText?: string } } }>;
        }
      ).attributes) {
        attributeTypes.set(attr.name, attr.typeCall?.type?.$refText ?? 'unknown');
      }
    }

    const transpilerCtx: ExpressionTranspilerContext = {
      selfName: 'data',
      emitMode: 'zod-refine',
      conditionName: name,
      typeName: inputTypeName,
      attributeTypes,
      diagnostics: this.ctx.diagnostics
    };

    const exprStr = transpileExpression(rule.expression as any, transpilerCtx);

    return `export const validate${name} = ${schemaName}.refine(\n  (data) => ${exprStr},\n  '${name}'\n);`;
  }

  /**
   * Emit the file header: SPDX, generated comment, imports, runtime helpers.
   * FR-021 (inlined helpers), T038.
   *
   * 019 Phase 0.5.2: when `suppressBoilerplate: true` is set on the
   * options (set by `GenericModelEmitter` when wrapping this emitter in
   * a whole-model layout), the inline `RUNTIME_HELPER_SOURCE` block is
   * replaced by an `import { runeCheckOneOf, runeCount, runeAttrExists }
   * from './runtime.zod.js'` statement. The Zod LanguageProfile's
   * `makeSharedArtifacts` then emits the `runtime.zod.ts` sidecar once
   * for the whole bundle.
   */
  private buildFileHeader(): string {
    return [
      `// SPDX-License-Identifier: MIT`,
      `// Generated by @rune-langium/codegen — do not edit`,
      `// Source namespace: ${this.model.namespace}`,
      ``,
      `import { z } from 'zod';`,
      ...(this.suppressBoilerplate
        ? [buildRuntimeHelperImportLine('./runtime.zod.js', ['runeExtendChoice']), ``]
        : ['', RUNTIME_HELPER_SOURCE, '', RUNE_EXTEND_CHOICE_HELPER_SOURCE, ''])
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Private static helpers (pure utilities, no ctx)
  // ---------------------------------------------------------------------------

  /**
   * Return a property key expression for a Zod object literal.
   *
   * In ES5+ / TypeScript, reserved words are valid unquoted property keys
   * (e.g. `{ class: z.string() }` is legal). The oxfmt linter removes quotes
   * from reserved-word keys, so we emit them unquoted to keep byte-identical
   * output after formatting. FR-009.
   */
  private static quoteKey(key: string): string {
    // All valid identifiers (including JS reserved words) can be used unquoted
    // as property keys in object literals per ES5+. Return key as-is.
    return key;
  }

  /**
   * Escape a display-name string for use in a single-quoted TypeScript string literal.
   * Spec edge case: display names may contain `'` or backslashes.
   * We use single quotes to match the oxfmt singleQuote: true style.
   */
  private static escapeDisplayName(name: string): string {
    return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  /**
   * Map a Rune cardinality to a Zod expression suffix applied to a base type schema.
   * FR-003.
   *
   * @param card - The RosettaCardinality AST node.
   * @param baseZodExpr - The base Zod expression (e.g., 'z.string()').
   * @returns The full Zod expression with cardinality encoding.
   */
  private static applyCardinality(card: RosettaCardinality, baseZodExpr: string): string {
    const { lower, upper } = decodeCardinality(card);

    if (upper === null) {
      // (lower..*)
      if (lower === 0) {
        return `z.array(${baseZodExpr})`; // (0..*)
      }
      if (lower === 1) {
        return `z.array(${baseZodExpr}).min(1)`; // (1..*)
      }
      return `z.array(${baseZodExpr}).min(${lower})`; // (n..*)
    }

    if (upper === 1 && lower === 1) {
      return baseZodExpr; // (1..1) — required scalar
    }

    if (upper === 0 && lower === 0) {
      // Degenerate: (0..0) — treat as optional
      return `${baseZodExpr}.optional()`;
    }

    if (upper === 1 && lower === 0) {
      return `${baseZodExpr}.optional()`; // (0..1)
    }

    // Array forms
    if (upper === lower && upper > 1) {
      return `z.array(${baseZodExpr}).length(${upper})`; // (n..n) n>1
    }

    if (lower === 0 && upper > 1) {
      return `z.array(${baseZodExpr}).max(${upper})`; // (0..m)
    }

    // (n..m) general
    return `z.array(${baseZodExpr}).min(${lower}).max(${upper})`;
  }

  /**
   * Apply cardinality to a TypeScript type expression for interface fields.
   */
  private static applyCardinalityTs(card: RosettaCardinality, baseType: string, name: string): string {
    const { lower, upper } = decodeCardinality(card);
    const key = ZodNamespaceEmitter.quoteKey(name);

    if (upper === null) {
      if (lower === 0) return `${key}?: ${baseType}[]`;
      return `${key}: ${baseType}[]`;
    }

    if (upper === 1 && lower === 1) return `${key}: ${baseType}`;
    if (upper === 1 && lower === 0) return `${key}?: ${baseType}`;

    // Array forms
    return `${key}: ${baseType}[]`;
  }

  /**
   * Build a `.meta(...)` suffix for a Data node's type-level annotations.
   *
   * Each AnnotationRef contributes one key to the meta object whose value is an
   * object with:
   *   - `attribute`: the referenced attribute name (if any)
   *   - one entry per qualifier: qualName → qualValue
   *
   * Returns an empty string when the data node has no type-level annotations.
   * T068, T069, US11.
   */
  private static buildMetaSuffix(data: Data): string {
    const annotations = data.annotations ?? [];
    if (annotations.length === 0) return '';

    const metaEntries = annotations.map((annRef) => {
      const annName = annRef.annotation?.$refText ?? annRef.annotation?.ref?.name ?? 'unknown';
      const parts: string[] = [];
      const attrName = annRef.attribute?.$refText ?? annRef.attribute?.ref?.name;
      if (attrName) {
        parts.push(`attribute: '${attrName}'`);
      }
      for (const q of annRef.qualifiers ?? []) {
        if (q.qualName && q.qualValue !== undefined) {
          const escapedValue = q.qualValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          parts.push(`${q.qualName}: '${escapedValue}'`);
        }
      }
      const body = parts.length > 0 ? `{ ${parts.join(', ')} }` : '{}';
      return `    ${annName}: ${body}`;
    });

    return `.meta({\n${metaEntries.join(',\n')}\n  })`;
  }
}
