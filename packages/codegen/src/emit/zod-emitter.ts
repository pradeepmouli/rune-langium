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
import {
  isData,
  isRosettaModel,
  isRosettaEnumeration,
  isRosettaBasicType,
  isData as _isData,
  type Data,
  type Attribute,
  type RosettaEnumeration,
  type RosettaModel,
  type RosettaCardinality
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
 * Quote a property key if it is a TypeScript reserved word.
 * FR-009.
 */
function quoteKey(key: string): string {
  if (RESERVED_WORDS.has(key)) {
    return `"${key}"`;
  }
  return key;
}

/**
 * Escape a display-name string for use in a TypeScript string literal.
 * Spec edge case: display names may contain `"` or backslashes.
 */
function escapeDisplayName(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
 * Handles: plain object, extends, lazy wrapping for cycles.
 * FR-002 (exports), FR-005 (extends), FR-006 (lazy), FR-008 (empty).
 */
function emitTypeSchema(data: Data, ctx: EmissionContext): string {
  const name = data.name;
  const schemaName = `${name}Schema`;
  const isLazy = ctx.lazyTypes.has(name);

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
    // For cyclic types: add explicit ZodType annotation so TS can infer recursive schemas
    return `export const ${schemaName}: z.ZodType<${name}> = z.lazy(() => ${schemaExpr});`;
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
      const displayName = v.display != null ? escapeDisplayName(v.display) : v.name;
      return `  '${v.name}': "${displayName}"`;
    });
    lines.push('');
    lines.push(
      `export const ${name}DisplayNames: Record<${name}, string> = {\n${displayEntries.join(',\n')}\n};`
    );
  }

  return lines.join('\n');
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
    enumByName
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
  _options: GeneratorOptions
): GeneratorOutput {
  const ctx = buildEmissionContext(docs, namespace);
  const sections: string[] = [];

  sections.push(emitFileHeader(namespace, ctx));

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
