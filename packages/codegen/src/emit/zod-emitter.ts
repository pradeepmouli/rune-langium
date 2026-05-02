// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Zod target emitter for the Rune code generator.
 *
 * Entry point: emitNamespace(docs, options) → GeneratorOutput
 *
 * FR-002–FR-009, FR-021 (inline helpers), FR-022 (deterministic output).
 */

import type { LangiumDocument } from 'langium';
import type { NamespaceRegistry } from './namespace-registry.js';
import { resolveImportPath } from './namespace-registry.js';
import {
  isData,
  isRosettaModel,
  isRosettaEnumeration,
  isRosettaBasicType,
  isRosettaTypeAlias,
  isRosettaRule,
  isRosettaReport,
  isAnnotation,
  isRosettaExternalFunction,
  isData as _isData,
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
  GeneratorDiagnostic
} from '../types.js';
import { buildTypeReferenceGraph, findCyclicTypes } from '../cycle-detector.js';
import { topoSort } from '../topo-sort.js';
import { RUNTIME_HELPER_SOURCE } from '../helpers.js';
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
  emitOrder: string[];
  /** Type names that require z.lazy() wrapping due to cycles. */
  lazyTypes: Set<string>;
  /** Source-map entries collected during emission. */
  sourceMap: SourceMapEntry[];
  /** Generator-time diagnostics accumulated during emission. */
  diagnostics: GeneratorDiagnostic[];
  /** The namespace string (e.g., "cdm.base.math"). */
  namespace: string;
  /** All Data nodes keyed by name for lookup. */
  dataByName: Map<string, Data>;
  /** All Enumeration nodes keyed by name for lookup. */
  enumByName: Map<string, RosettaEnumeration>;
  /** All RosettaTypeAlias nodes keyed by name for lookup. */
  typeAliasByName: Map<string, RosettaTypeAlias>;
  /** All RosettaRule nodes keyed by name for lookup. */
  rulesByName: Map<string, RosettaRule>;
  /** All RosettaReport nodes keyed by name for lookup. */
  reportsByName: Map<string, RosettaReport>;
  /** All Annotation nodes keyed by name for lookup. */
  annotationsByName: Map<string, Annotation>;
  /** All RosettaExternalFunction nodes keyed by name for lookup. */
  libraryFuncsByName: Map<string, RosettaExternalFunction>;
  /** Namespace registry for cross-namespace lookups. */
  registry: NamespaceRegistry;
}

/**
 * TypeScript/JavaScript reserved words that must be quoted when used as property keys.
 * FR-009.
 */
const RESERVED_WORDS = new Set([
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

/**
 * Maps Rune built-in type names to their Zod primitives.
 */
const BUILTIN_TYPE_MAP: Record<string, string> = {
  string: 'z.string()',
  int: 'z.number().int()',
  number: 'z.number()',
  boolean: 'z.boolean()',
  date: 'z.string()', // ISO date string
  dateTime: 'z.string()', // ISO datetime string
  zonedDateTime: 'z.string()',
  time: 'z.string()',
  productType: 'z.string()',
  eventType: 'z.string()'
};

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
 * Collect cross-namespace import statements needed for the schemas and type aliases
 * defined in this emission context.
 *
 * Walks all Data superType references and attribute type references, plus
 * TypeAlias type references. Any resolved reference whose namespace differs
 * from `ctx.namespace` is recorded and emitted as an ES import statement
 * importing Schema names (e.g. FooSchema) from the corresponding .zod.js file.
 */
function collectCrossNamespaceImports(ctx: EmissionContext): string[] {
  const imports = new Map<string, Set<string>>(); // namespace -> schema symbol names

  function trackRef(typeRef: unknown, schemaName: string): void {
    if (!typeRef || typeof typeRef !== 'object') return;
    const ns = getElementNamespace(typeRef as { $container?: unknown });
    if (!ns || ns === ctx.namespace) return;

    let symbols = imports.get(ns);
    if (!symbols) {
      symbols = new Set();
      imports.set(ns, symbols);
    }
    symbols.add(schemaName);
  }

  // Check data type inheritance and attribute references
  for (const data of ctx.dataByName.values()) {
    // Check superType
    const parentRef = data.superType?.ref;
    if (parentRef) {
      trackRef(parentRef, `${parentRef.name}Schema`);
    }
    // Check attribute types
    for (const attr of data.attributes) {
      const attrTypeRef = attr.typeCall?.type?.ref;
      if (attrTypeRef && isData(attrTypeRef)) {
        trackRef(attrTypeRef, `${attrTypeRef.name}Schema`);
      } else if (attrTypeRef && isRosettaEnumeration(attrTypeRef)) {
        trackRef(attrTypeRef, `${attrTypeRef.name}Schema`);
      }
    }
  }

  // Check type alias references
  for (const alias of ctx.typeAliasByName.values()) {
    const typeRef = alias.typeCall?.type?.ref;
    if (typeRef && isData(typeRef)) {
      trackRef(typeRef, `${typeRef.name}Schema`);
    } else if (typeRef && isRosettaEnumeration(typeRef)) {
      trackRef(typeRef, `${typeRef.name}Schema`);
    }
  }

  // Build import statements
  const lines: string[] = [];
  const sortedNamespaces = Array.from(imports.keys()).sort();
  for (const ns of sortedNamespaces) {
    const symbols = Array.from(imports.get(ns)!).sort();
    const importPath = resolveImportPath(ctx.namespace, ns, ctx.registry);
    lines.push(`import { ${symbols.join(', ')} } from '${importPath}.zod.js';`);
  }

  return lines;
}

/**
 * Return a property key expression for a Zod object literal.
 *
 * In ES5+ / TypeScript, reserved words are valid unquoted property keys
 * (e.g. `{ class: z.string() }` is legal). The oxfmt linter removes quotes
 * from reserved-word keys, so we emit them unquoted to keep byte-identical
 * output after formatting. FR-009.
 */
function quoteKey(key: string): string {
  // All valid identifiers (including JS reserved words) can be used unquoted
  // as property keys in object literals per ES5+. Return key as-is.
  return key;
}

/**
 * Escape a display-name string for use in a single-quoted TypeScript string literal.
 * Spec edge case: display names may contain `'` or backslashes.
 * We use single quotes to match the oxfmt singleQuote: true style.
 */
function escapeDisplayName(name: string): string {
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
function applyCardinality(card: RosettaCardinality, baseZodExpr: string): string {
  const lower = card.inf;
  const upper = card.unbounded ? null : (card.sup ?? lower);

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
 * Resolve the Zod type expression for an attribute's type reference.
 * Handles built-ins (RosettaBasicType), Data (object refs), Enumerations.
 *
 * Falls back to $refText-based lookup for unresolved references (e.g., when
 * only a single file is parsed without the full workspace — common for fixtures).
 */
function resolveTypeExpr(attr: Attribute, ctx: EmissionContext): string {
  const typeRef = attr.typeCall?.type?.ref;
  const refText = attr.typeCall?.type?.$refText;

  if (!typeRef) {
    // Unresolved reference — try to recover using $refText
    if (refText) {
      // Check if it's a known built-in type name
      const builtinZod = BUILTIN_TYPE_MAP[refText];
      if (builtinZod) {
        return builtinZod;
      }
      // Check if it's an enum in the current namespace
      if (ctx.enumByName.has(refText)) {
        return `${refText}Schema`;
      }
      // Check if it's a data type in the current namespace
      if (ctx.dataByName.has(refText)) {
        return `${refText}Schema`;
      }
      // Unknown but named — emit schema reference optimistically
      ctx.diagnostics.push({
        severity: 'warning',
        code: 'unresolved-ref',
        message: `Attribute '${attr.name}': type '${refText}' is not resolved; emitting optimistic schema reference`
      });
      return `${refText}Schema`;
    }
    // Truly anonymous unresolved reference
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'unresolved-ref',
      message: `Attribute '${attr.name}' has an unresolved type reference; emitting z.unknown()`
    });
    return 'z.unknown()';
  }

  if (isRosettaBasicType(typeRef)) {
    const typeName = typeRef.name;
    return BUILTIN_TYPE_MAP[typeName] ?? 'z.unknown()';
  }

  if (isRosettaEnumeration(typeRef)) {
    // Reference to an enum → use the enum schema name
    return `${typeRef.name}Schema`;
  }

  if (isData(typeRef)) {
    // Reference to a data type → use the schema name
    return `${typeRef.name}Schema`;
  }

  // Unknown reference type — try $refText fallback
  if (refText) {
    const builtinZod = BUILTIN_TYPE_MAP[refText];
    if (builtinZod) return builtinZod;
  }

  ctx.diagnostics.push({
    severity: 'warning',
    code: 'unresolved-ref',
    message: `Unknown type reference kind for attribute '${attr.name}'; emitting z.unknown()`
  });
  return 'z.unknown()';
}

/**
 * Emit a single attribute as a Zod object property entry.
 * FR-003 (cardinality), FR-009 (reserved-word quoting).
 */
function emitAttribute(attr: Attribute, ctx: EmissionContext): string {
  const baseTypeExpr = resolveTypeExpr(attr, ctx);
  const card = attr.card;
  const zodExpr = applyCardinality(card, baseTypeExpr);
  const key = quoteKey(attr.name);
  return `  ${key}: ${zodExpr}`;
}

/**
 * Emit a z.object({...}) body for a data type's own attributes (not inherited).
 * Returns the Zod expression for the body (without the schema name assignment).
 */
function emitObjectBody(data: Data, ctx: EmissionContext): string {
  if (data.attributes.length === 0) {
    return 'z.object({})'; // FR-008
  }
  const attrs = data.attributes.map((attr) => emitAttribute(attr, ctx));
  // Join with comma+newline between entries; no trailing comma (linter rule: trailingComma: "none")
  return `z.object({\n${attrs.join(',\n')}\n})`;
}

/**
 * Emit a full schema declaration for a Data type.
 * Handles: plain object, extends, lazy wrapping for cycles, condition blocks.
 * FR-002 (exports), FR-005 (extends), FR-006 (lazy), FR-008 (empty).
 * FR-010, FR-011 (conditions via emitConditionBlock). T056.
 */
function emitTypeSchema(data: Data, ctx: EmissionContext): string {
  const name = data.name;
  const schemaName = `${name}Schema`;
  const isLazy = ctx.lazyTypes.has(name);
  const conditions = data.conditions ?? [];
  const hasConditions = conditions.some((c) => c.expression != null);

  let schemaExpr: string;

  if (data.superType?.ref) {
    const parentName = data.superType.ref.name;
    const parentSchema = `${parentName}Schema`;

    if (data.attributes.length === 0) {
      // Empty child: just re-export parent schema shape
      schemaExpr = `${parentSchema}.extend({})`;
    } else {
      const attrs = data.attributes.map((attr) => emitAttribute(attr, ctx));
      schemaExpr = `${parentSchema}.extend({\n${attrs.join(',\n')}\n})`;
    }
  } else {
    schemaExpr = emitObjectBody(data, ctx);
  }

  if (isLazy) {
    // For cyclic types: add explicit ZodType annotation so TS can infer recursive schemas.
    // Conditions inside lazy: wrap the condition inside the lazy callback.
    if (hasConditions) {
      const condBlock = emitConditionBlock(conditions, data, ctx);
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
    const condBlock = emitConditionBlock(conditions, data, ctx);
    // Format as oxfmt-style method chain:
    //   export const Schema = z
    //     .object({
    //       a: z.string().optional(),
    //       ...
    //     })
    //     .refine(...)
    //
    // Strategy: rebuild the object body with 4-space attr indentation, then chain.
    let chainedObjectExpr: string;
    if (data.superType?.ref) {
      // extend chain: ParentSchema.extend({...})
      // For simplicity, emit as non-chained since extend is on a schema ref, not z
      const parentName = data.superType.ref.name;
      const parentSchema = `${parentName}Schema`;
      if (data.attributes.length === 0) {
        chainedObjectExpr = `${parentSchema}.extend({})`;
      } else {
        const attrs = data.attributes.map((attr) => emitAttribute(attr, ctx));
        // Reindent attrs to 4 spaces
        const reindented = attrs.map((a) => `  ${a}`).join(',\n');
        chainedObjectExpr = `${parentSchema}.extend({\n${reindented}\n})`;
      }
      const condIndented = condBlock
        .split('\n')
        .map((line) => `  ${line}`)
        .join('\n');
      return `export const ${schemaName} = ${chainedObjectExpr}\n${condIndented};`;
    } else {
      // z.object chain: build chain as `z\n  .object({...})\n  .refine(...)`
      const attrLines =
        data.attributes.length === 0 ? [] : data.attributes.map((attr) => emitAttribute(attr, ctx));
      // Build object body with 4-space attribute indentation.
      // emitAttribute returns '  key: val' (2-space prefix), so add 2 more for 4 total.
      const objectBody =
        attrLines.length === 0
          ? `.object({})`
          : `.object({\n${attrLines.map((a) => `  ${a}`).join(',\n')}\n  })`;
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
  const metaSuffix = buildMetaSuffix(data);
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
function emitCyclicInterface(data: Data, ctx: EmissionContext): string {
  const name = data.name;
  const fields: string[] = [];

  for (const attr of data.attributes) {
    const baseTypeExpr = resolveTypeExprAsTs(attr, ctx);
    const card = attr.card;
    const tsField = applyCardinalityTs(card, baseTypeExpr, attr.name);
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
function resolveTypeExprAsTs(attr: Attribute, ctx: EmissionContext): string {
  const typeRef = attr.typeCall?.type?.ref;
  const refText = attr.typeCall?.type?.$refText;

  if (!typeRef) {
    if (refText) {
      const builtinTs = TS_TYPE_MAP[refText];
      if (builtinTs) return builtinTs;
      return refText; // data type name
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
 * Maps Rune built-in type names to TypeScript type names (for interface declarations).
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
 * Apply cardinality to a TypeScript type expression for interface fields.
 */
function applyCardinalityTs(card: RosettaCardinality, baseType: string, name: string): string {
  const lower = card.inf;
  const upper = card.unbounded ? null : (card.sup ?? lower);
  const key = quoteKey(name);

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
 * Emit the type alias (z.infer<typeof Schema>).
 * For cyclic types the interface is emitted separately (pre-declaration).
 * FR-002 (z.infer alias for every type).
 */
function emitTypeAlias(data: Data, ctx: EmissionContext): string {
  const name = data.name;
  const schemaName = `${name}Schema`;
  // Cyclic types already have an interface declaration; skip z.infer alias
  // (the schema already uses the declared interface as z.ZodType<TypeName>)
  if (ctx.lazyTypes.has(name)) {
    return ''; // interface was already declared; no additional alias needed
  }
  return `export type ${name} = z.infer<typeof ${schemaName}>;`;
}

/**
 * Build an ExpressionTranspilerContext for a given Data node and emit mode.
 * T055.
 */
function buildTranspilerContext(
  data: Data,
  emitMode: 'zod-refine' | 'zod-superRefine',
  conditionName: string,
  ctx: EmissionContext
): ExpressionTranspilerContext {
  const attributeTypes = new Map<string, string>();
  for (const attr of data.attributes) {
    attributeTypes.set(attr.name, attr.typeCall?.type?.$refText ?? 'unknown');
  }
  // Also include inherited attributes if the type extends a parent
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
    selfName: 'data',
    emitMode,
    conditionName,
    typeName: data.name,
    attributeTypes,
    diagnostics: ctx.diagnostics
  };
}

/**
 * Emit the condition block for a Data type.
 * FR-010 (refine vs superRefine), FR-011 (single superRefine for multi-condition).
 * T055.
 *
 * Returns a string like `.refine(...)` or `.superRefine(...)` to be appended
 * to the schema expression. Returns empty string if no conditions.
 */
function emitConditionBlock(conditions: Condition[], data: Data, ctx: EmissionContext): string {
  // Filter out conditions that have no expression or are unsupported
  const activeConds = conditions.filter((c) => c.expression != null);
  if (activeConds.length === 0) return '';

  if (activeConds.length === 1) {
    const cond = activeConds[0]!;
    const condName = cond.name ?? 'Condition';
    const transpilerCtx = buildTranspilerContext(data, 'zod-refine', condName, ctx);
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
    const transpilerCtx = buildTranspilerContext(data, 'zod-superRefine', condName, ctx);
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
function emitEnum(enumNode: RosettaEnumeration, ctx: EmissionContext): string {
  const name = enumNode.name;
  const schemaName = `${name}Schema`;

  const memberNames = enumNode.enumValues.map((v) => v.name);

  if (memberNames.length === 0) {
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'empty-enum',
      message: `Enum '${name}' has no values; emitting z.enum([]) which is not valid Zod — treating as z.never()`
    });
    return [
      `export const ${schemaName} = z.never();`,
      `export type ${name} = z.infer<typeof ${schemaName}>;`
    ].join('\n');
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
        v.display != null ? escapeDisplayName(v.display) : escapeDisplayName(v.name);
      return `  ${v.name}: '${displayName}'`;
    });
    lines.push('');
    lines.push(
      `export const ${name}DisplayNames: Record<${name}, string> = {\n${displayEntries.join(',\n')}\n};`
    );
  }

  return lines.join('\n');
}

/**
 * Emit a Zod schema and type alias for a RosettaTypeAlias node.
 * NOTE: not named `emitTypeAlias` — that name is taken by the z.infer helper for Data types.
 */
function emitTypeAliasSchema(alias: RosettaTypeAlias, ctx: EmissionContext): string {
  const name = alias.name;
  const schemaName = `${name}Schema`;
  const typeRef = alias.typeCall?.type?.ref;
  const refText = alias.typeCall?.type?.$refText;

  // Resolve to a Zod schema expression
  let zodExpr = 'z.unknown()';

  if (typeRef && isRosettaBasicType(typeRef)) {
    zodExpr = BUILTIN_TYPE_MAP[typeRef.name] ?? 'z.unknown()';
  } else if (typeRef && isRosettaEnumeration(typeRef)) {
    zodExpr = `${typeRef.name}Schema`;
  } else if (typeRef && isData(typeRef)) {
    zodExpr = `${typeRef.name}Schema`;
  } else if (refText) {
    const builtinZod = BUILTIN_TYPE_MAP[refText];
    if (builtinZod) zodExpr = builtinZod;
    else if (ctx.enumByName.has(refText)) zodExpr = `${refText}Schema`;
    else if (ctx.dataByName.has(refText)) zodExpr = `${refText}Schema`;
    else zodExpr = 'z.unknown()';
  }

  const lines: string[] = [
    `export const ${schemaName} = ${zodExpr};`,
    `export type ${name} = z.infer<typeof ${schemaName}>;`
  ];

  return lines.join('\n');
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
function buildMetaSuffix(data: Data): string {
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

/**
 * Emit a `runeReportRules` const object summarising all rules in this namespace.
 * Mirrors the equivalent in the TS emitter (T074b).
 *
 * Returns an empty string when there are no rules in the namespace.
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

/**
 * Emit a Zod refine validator for a RosettaRule.
 * Only emitted when the rule has a resolvable input type with a known schema.
 */
function emitRuleValidator(rule: RosettaRule, ctx: EmissionContext): string {
  const name = rule.name;
  const inputTypeRef = rule.input?.type?.ref;
  const inputTypeName = inputTypeRef ? inputTypeRef.name : undefined;

  if (!inputTypeName) {
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'rule-no-input-type',
      message: `Rule '${name}' has no resolvable input type; skipping Zod validator`
    });
    return '';
  }

  const isLocal = ctx.dataByName.has(inputTypeName);
  const isCrossNs = !isLocal && inputTypeRef && getElementNamespace(inputTypeRef) !== ctx.namespace;
  if (!isLocal && !isCrossNs) {
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'rule-no-input-type',
      message: `Rule '${name}': input type '${inputTypeName}' not found; skipping Zod validator`
    });
    return '';
  }

  const schemaName = `${inputTypeName}Schema`;
  const attributeTypes = new Map<string, string>();
  const inputData =
    ctx.dataByName.get(inputTypeName) ??
    (inputTypeRef && isData(inputTypeRef) ? inputTypeRef : undefined);
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
    diagnostics: ctx.diagnostics
  };

  const exprStr = transpileExpression(rule.expression as any, transpilerCtx);

  return `export const validate${name} = ${schemaName}.refine(\n  (data) => ${exprStr},\n  '${name}'\n);`;
}

/**
 * Emit the file header: SPDX, generated comment, imports, runtime helpers.
 * FR-021 (inlined helpers), T038.
 */
function emitFileHeader(namespace: string, _ctx: EmissionContext): string {
  return [
    `// SPDX-License-Identifier: MIT`,
    `// Generated by @rune-langium/codegen — do not edit`,
    `// Source namespace: ${namespace}`,
    ``,
    `import { z } from 'zod';`,
    ``,
    RUNTIME_HELPER_SOURCE,
    ``
  ].join('\n');
}

/**
 * Convert a dot-separated Rune namespace to a file path.
 * e.g., "cdm.base.math" → "cdm/base/math.zod.ts"
 * R6 (file organization).
 */
function namespaceToPath(namespace: string): string {
  return namespace.replace(/\./g, '/') + '.zod.ts';
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
        // Reports don't have simple names — derive from context
      } else if (isAnnotation(element)) {
        annotationsByName.set(element.name, element);
      } else if (isRosettaExternalFunction(element)) {
        libraryFuncsByName.set(element.name, element);
      }
    }
  }

  // Build reference graph and find cycles
  const graph = buildTypeReferenceGraph(docs);
  const lazyTypes = findCyclicTypes(graph);
  const emitOrder = topoSort(graph, lazyTypes);

  return {
    target: 'zod',
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
 * Emit one namespace as a single .zod.ts file.
 *
 * Entry point for the Zod emitter.
 * FR-001 (one file per namespace), FR-022 (deterministic output).
 */
export function emitNamespace(
  docs: LangiumDocument[],
  namespace: string,
  _options: GeneratorOptions,
  registry: NamespaceRegistry = { namespaces: new Map() }
): GeneratorOutput {
  const ctx = buildEmissionContext(docs, namespace, registry);
  const sections: string[] = [];

  sections.push(emitFileHeader(namespace, ctx));

  // Collect and emit cross-namespace import statements at the top of the file
  const crossNsImports = collectCrossNamespaceImports(ctx);
  if (crossNsImports.length > 0) {
    sections.push(crossNsImports.join('\n'));
    sections.push('');
  }

  // Emit in topological order: enums first (they don't have dependencies on data types),
  // then data types in topo-sorted order.
  //
  // Emit all enums first (alphabetically for determinism)
  const enumNames = Array.from(ctx.enumByName.keys()).sort();
  for (const name of enumNames) {
    const enumNode = ctx.enumByName.get(name)!;
    sections.push(emitEnum(enumNode, ctx));
    sections.push('');
  }

  // Emit type alias schemas (after enums, before data types)
  const typeAliasNames = Array.from(ctx.typeAliasByName.keys()).sort();
  for (const name of typeAliasNames) {
    const alias = ctx.typeAliasByName.get(name)!;
    sections.push('');
    sections.push(emitTypeAliasSchema(alias, ctx));
  }

  // For cyclic types: emit interface declarations first so that
  // z.ZodType<TypeName> annotations can reference the TS interface.
  const cyclicDataNames = Array.from(ctx.lazyTypes)
    .filter((n) => ctx.dataByName.has(n))
    .sort();
  if (cyclicDataNames.length > 0) {
    for (const typeName of cyclicDataNames) {
      const data = ctx.dataByName.get(typeName)!;
      sections.push(emitCyclicInterface(data, ctx));
    }
    sections.push('');
  }

  // Emit data types in topological order (from emitOrder), then any
  // data types not in the topo order (shouldn't happen, but defensive)
  const emittedData = new Set<string>();

  for (const typeName of ctx.emitOrder) {
    const data = ctx.dataByName.get(typeName);
    if (!data) continue; // might be from another namespace
    emittedData.add(typeName);
    sections.push(emitTypeSchema(data, ctx));
    const alias = emitTypeAlias(data, ctx);
    if (alias) sections.push(alias);
    sections.push('');
  }

  // Emit any data types not captured in topo order (defensive)
  const remainingData = Array.from(ctx.dataByName.keys())
    .filter((n) => !emittedData.has(n))
    .sort();
  for (const typeName of remainingData) {
    const data = ctx.dataByName.get(typeName)!;
    sections.push(emitTypeSchema(data, ctx));
    const alias = emitTypeAlias(data, ctx);
    if (alias) sections.push(alias);
    sections.push('');
  }

  // Emit rule validators (after data types)
  const ruleNames = Array.from(ctx.rulesByName.keys()).sort();
  for (const name of ruleNames) {
    const rule = ctx.rulesByName.get(name)!;
    const result = emitRuleValidator(rule, ctx);
    if (result) {
      sections.push('');
      sections.push(result);
    }
  }

  // Emit report metadata (T074b) — one const object summarising all rules
  const reportMeta = emitReportMetadata(ctx);
  if (reportMeta !== '') {
    sections.push('');
    sections.push(reportMeta);
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
    funcs: [] // FR-031: zod target silently skips funcs
  };
}
