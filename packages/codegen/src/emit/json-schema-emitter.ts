// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * JSON Schema 2020-12 target emitter for the Rune code generator.
 *
 * Entry point: emitNamespace(model, options) → GeneratorOutput
 *
 * FR-019: Emit JSON Schema 2020-12 documents encoding cardinality,
 * enums, and inheritance equivalent to the Zod target.
 *
 * ─── CONDITION LIMITATIONS ───────────────────────────────────────────────────
 * JSON Schema cannot fully express Rune's condition forms. Specifically:
 *
 *   - `one-of` / `choice` over optional siblings: In simple cases these can be
 *     modelled with `"oneOf": [...]`, but Rune's semantics (exactly one of a set
 *     of optional attributes is present) don't map cleanly to `oneOf` because JSON
 *     Schema's `oneOf` validates the entire document against each subschema — not
 *     just attribute presence. We emit these as `"x-rune-conditions"` metadata.
 *
 *   - `exists` on a single required attr: We mark the attr in `"required"`. This
 *     is the one condition form we CAN faithfully express in JSON Schema.
 *
 *   - `is absent` / `only exists` / all arithmetic, comparison, boolean, set,
 *     aggregation, higher-order, and conditional expression predicates: Not
 *     expressible in JSON Schema. Emitted as opaque `"x-rune-conditions"` entries
 *     (using the conventional `x-` prefix for non-standard extensions) so
 *     downstream consumers know the conditions exist.
 *
 * FR-019 only requires "cardinality and enums encoded" in JSON Schema; conditions
 * are not promised in JSON Schema output. This design is intentional and consistent
 * with the spec.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  isData,
  isRosettaEnumeration,
  isRosettaBasicType,
  isRosettaTypeAlias,
  isRosettaRule,
  isRosettaReport,
  isAnnotation,
  isRosettaExternalFunction,
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
import { emitNamespaceWithContract, type NamespaceEmitter } from './namespace-emitter.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import { getTargetRelativePath, type NamespaceWalkResult } from './namespace-walker.js';

/** JSON Schema 2020-12 meta-schema URI. */
const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

/**
 * oxfmt-compatible JSON serializer.
 *
 * oxfmt collapses short arrays onto a single line when they fit within
 * the print width (100 chars). We replicate this behaviour so that
 * committed `expected.schema.json` fixture files are byte-identical to the
 * formatter's output. Specifically:
 *   - Arrays of primitives (strings, numbers, booleans) that fit on one
 *     line within the given indent level are serialised inline.
 *   - Arrays of objects are always expanded.
 *   - Objects are always expanded (one key per line).
 *
 * @param value - The JSON value to serialise.
 * @param indent - Current indent level (0 = top level).
 * @param printWidth - Maximum column width (default 100, matching oxfmt).
 */
function serializeJson(value: unknown, indent: number = 0, printWidth: number = 100): string {
  const spaces = '  '.repeat(indent);
  const innerSpaces = '  '.repeat(indent + 1);

  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';

    // Try compact (inline) form — only for primitive arrays
    const allPrimitives = value.every(
      (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null
    );
    if (allPrimitives) {
      const compact = '[' + value.map((v) => serializeJson(v, 0, printWidth)).join(', ') + ']';
      // Check if it fits within the line budget at the current indentation level
      const lineLength = spaces.length + compact.length;
      if (lineLength <= printWidth) {
        return compact;
      }
    }

    // Expanded form
    const items = value.map((v) => innerSpaces + serializeJson(v, indent + 1, printWidth));
    return '[\n' + items.join(',\n') + '\n' + spaces + ']';
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return '{}';

    const entries = keys.map(
      (k) =>
        innerSpaces +
        JSON.stringify(k) +
        ': ' +
        serializeJson((value as Record<string, unknown>)[k], indent + 1, printWidth)
    );
    return '{\n' + entries.join(',\n') + '\n' + spaces + '}';
  }

  return JSON.stringify(value);
}

/**
 * Internal emission context for one namespace.
 */
interface EmissionContext {
  /** The namespace string (e.g., "test.cardinality"). */
  namespace: string;
  /** The relative output path (e.g., "test/cardinality.schema.json"). */
  relativePath: string;
  /** All Data nodes keyed by name. */
  dataByName: ReadonlyMap<string, Data>;
  /** All Enumeration nodes keyed by name. */
  enumByName: ReadonlyMap<string, RosettaEnumeration>;
  typeAliasByName: ReadonlyMap<string, RosettaTypeAlias>;
  rulesByName: ReadonlyMap<string, RosettaRule>;
  reportsByName: ReadonlyMap<string, RosettaReport>;
  annotationsByName: ReadonlyMap<string, Annotation>;
  libraryFuncsByName: ReadonlyMap<string, RosettaExternalFunction>;
  /** Types in emission order (topo-sorted). */
  emitOrder: readonly string[];
  /** Source-map entries collected during emission. */
  sourceMap: SourceMapEntry[];
  /** Generator-time diagnostics accumulated during emission. */
  diagnostics: GeneratorDiagnostic[];
  registry: NamespaceRegistry;
}

interface PendingSourceMapEntry {
  name: string;
  sourceUri: string;
  sourceLine: number;
  sourceChar: number;
}

/**
 * Maps Rune built-in type names to JSON Schema types.
 * FR-019.
 */
const BUILTIN_JSON_TYPE_MAP: Record<string, object> = {
  string: { type: 'string' },
  int: { type: 'integer' },
  number: { type: 'number' },
  boolean: { type: 'boolean' },
  date: { type: 'string', format: 'date' },
  dateTime: { type: 'string', format: 'date-time' },
  zonedDateTime: { type: 'string', format: 'date-time' },
  time: { type: 'string', format: 'time' },
  productType: { type: 'string' },
  eventType: { type: 'string' }
};

/**
 * Resolve the item schema for a scalar type reference.
 * Returns a JSON Schema object for the base (non-array) type.
 */
function resolveItemSchema(attr: Attribute, ctx: EmissionContext): object {
  const typeRef = attr.typeCall?.type?.ref;
  const refText = attr.typeCall?.type?.$refText;

  if (!typeRef) {
    if (refText) {
      const builtinSchema = BUILTIN_JSON_TYPE_MAP[refText];
      if (builtinSchema) return builtinSchema;

      // Check if it's an enum or data type in the current namespace
      if (ctx.enumByName.has(refText)) {
        return { $ref: `#/$defs/${refText}` };
      }
      if (ctx.dataByName.has(refText)) {
        return { $ref: `#/$defs/${refText}` };
      }

      ctx.diagnostics.push({
        severity: 'warning',
        code: 'unresolved-ref',
        message: `Attribute '${attr.name}': type '${refText}' is not resolved; emitting {}`
      });
      return {};
    }
    ctx.diagnostics.push({
      severity: 'warning',
      code: 'unresolved-ref',
      message: `Attribute '${attr.name}' has an unresolved type reference`
    });
    return {};
  }

  if (isRosettaBasicType(typeRef)) {
    return BUILTIN_JSON_TYPE_MAP[typeRef.name] ?? {};
  }

  if (isRosettaEnumeration(typeRef)) {
    return { $ref: `#/$defs/${typeRef.name}` };
  }

  if (isData(typeRef)) {
    return { $ref: `#/$defs/${typeRef.name}` };
  }

  // Fallback with $refText
  if (refText) {
    const builtinSchema = BUILTIN_JSON_TYPE_MAP[refText];
    if (builtinSchema) return builtinSchema;
  }

  ctx.diagnostics.push({
    severity: 'warning',
    code: 'unresolved-ref',
    message: `Unknown type reference kind for attribute '${attr.name}'`
  });
  return {};
}

/**
 * Apply cardinality encoding to a base item schema.
 * Returns the JSON Schema representation of the attribute type + cardinality.
 * FR-019 / T095.
 *
 * Cardinality map:
 *   (1..1) → base item schema (no wrapping); field listed in "required"
 *   (0..1) → base item schema (no wrapping); field NOT in "required"
 *   (0..*) → { "type": "array", "items": itemSchema }
 *   (1..*) → { "type": "array", "items": itemSchema, "minItems": 1 }
 *   (n..m) → { "type": "array", "items": itemSchema, "minItems": n, "maxItems": m }
 *   (n..n) n>1 → { "type": "array", "items": itemSchema, "minItems": n, "maxItems": n }
 */
function applyCardinality(card: RosettaCardinality, itemSchema: object): object {
  const lower = card.inf;
  const upper = card.unbounded ? null : (card.sup ?? lower);

  // Scalar forms: (1..1) or (0..1)
  if (upper !== null && upper <= 1) {
    return itemSchema;
  }

  // Array forms
  const arraySchema: Record<string, unknown> = {
    type: 'array',
    items: itemSchema
  };

  if (upper === null) {
    // (n..*)
    if (lower > 0) {
      arraySchema['minItems'] = lower;
    }
    // (0..*) → no minItems
  } else {
    // Fixed upper bound
    if (lower > 0) arraySchema['minItems'] = lower;
    arraySchema['maxItems'] = upper;
  }

  return arraySchema;
}

/**
 * Emit the JSON Schema definition for a single Data type.
 * T094, T095.
 *
 * Returns a JSON Schema object for the type.
 */
function emitTypeDef(data: Data, ctx: EmissionContext): object {
  const required: string[] = [];
  const properties: Record<string, object> = {};

  for (const attr of data.attributes) {
    const card = attr.card;
    const lower = card.inf;
    const upper = card.unbounded ? null : (card.sup ?? lower);

    const itemSchema = resolveItemSchema(attr, ctx);
    const attrSchema = applyCardinality(card, itemSchema);

    properties[attr.name] = attrSchema;

    // Field is required if lower === 1 and upper === 1 (scalar mandatory)
    if (lower === 1 && upper === 1) {
      required.push(attr.name);
    }
  }

  // Collect condition metadata (x-rune-conditions extension).
  // JSON Schema cannot express Rune conditions beyond "exists" (required),
  // so we emit them as opaque extension metadata per the spec comment above.
  const conditions = data.conditions ?? [];
  const conditionMeta = conditions
    .filter((c) => c.name != null)
    .map((c) => ({
      name: c.name,
      // Include a best-effort kind description based on what we can detect
      kind: 'condition'
    }));

  if (data.superType?.ref) {
    // Inheritance: use allOf pattern
    const parentName = data.superType.ref.name;
    const parentRef: object = { $ref: `#/$defs/${parentName}` };

    const ownSchema: Record<string, unknown> = {
      type: 'object',
      properties,
      additionalProperties: false
    };
    if (required.length > 0) ownSchema['required'] = required;
    if (conditionMeta.length > 0) ownSchema['x-rune-conditions'] = conditionMeta;

    return {
      allOf: [parentRef, ownSchema]
    };
  }

  // No inheritance
  const def: Record<string, unknown> = {
    type: 'object',
    properties,
    additionalProperties: false
  };

  if (required.length > 0) def['required'] = required;
  if (conditionMeta.length > 0) def['x-rune-conditions'] = conditionMeta;

  return def;
}

/**
 * Emit the JSON Schema definition for a type alias.
 */
function emitTypeAliasDef(alias: RosettaTypeAlias, ctx: EmissionContext): object {
  const typeRef = alias.typeCall?.type?.ref;
  const refText = alias.typeCall?.type?.$refText;

  // Resolve to a JSON Schema type
  if (typeRef && isRosettaBasicType(typeRef)) {
    const typeMap: Record<string, object> = {
      string: { type: 'string' },
      int: { type: 'integer' },
      number: { type: 'number' },
      boolean: { type: 'boolean' },
      date: { type: 'string', format: 'date' },
      dateTime: { type: 'string', format: 'date-time' },
      zonedDateTime: { type: 'string', format: 'date-time' },
      time: { type: 'string', format: 'time' }
    };
    return typeMap[typeRef.name] ?? { type: 'string' };
  }

  if (typeRef && isRosettaEnumeration(typeRef)) {
    return { $ref: `#/$defs/${typeRef.name}` };
  }

  if (typeRef && isData(typeRef)) {
    return { $ref: `#/$defs/${typeRef.name}` };
  }

  if (refText) {
    const builtinMap: Record<string, object> = {
      string: { type: 'string' },
      int: { type: 'integer' },
      number: { type: 'number' },
      boolean: { type: 'boolean' },
      date: { type: 'string', format: 'date' },
      dateTime: { type: 'string', format: 'date-time' },
      zonedDateTime: { type: 'string', format: 'date-time' },
      time: { type: 'string', format: 'time' }
    };
    if (builtinMap[refText]) return builtinMap[refText];
    if (ctx.enumByName.has(refText) || ctx.dataByName.has(refText)) {
      return { $ref: `#/$defs/${refText}` };
    }
  }

  return { type: 'string' };
}

/**
 * Emit the JSON Schema definition for an enumeration.
 * T095.
 *
 * Emits: `{ "type": "string", "enum": ["Val1", "Val2", ...] }`
 *
 * Note: Display-name maps are not standardized in JSON Schema. Enum display names
 * are documented as `x-rune-enum-display` extension entries so consumers know they
 * exist, but they are not added to the `"enum"` array itself.
 */
function emitEnumDef(enumNode: RosettaEnumeration): object {
  const memberNames = enumNode.enumValues.map((v) => v.name);

  const def: Record<string, unknown> = {
    type: 'string',
    enum: memberNames
  };

  // Display names as optional x- extension (not standardized in JSON Schema)
  const hasDisplayNames = enumNode.enumValues.some((v) => v.display != null);
  if (hasDisplayNames) {
    const displayMap: Record<string, string> = {};
    for (const v of enumNode.enumValues) {
      displayMap[v.name] = v.display ?? v.name;
    }
    def['x-rune-enum-display'] = displayMap;
  }

  return def;
}

function buildEmissionContext(model: NamespaceWalkResult, registry: NamespaceRegistry): EmissionContext {
  return {
    namespace: model.namespace,
    relativePath: getTargetRelativePath(model.namespace, 'json-schema'),
    dataByName: model.dataByName,
    enumByName: model.enumByName,
    typeAliasByName: model.typeAliasByName,
    rulesByName: model.rulesByName,
    reportsByName: model.reportsByName,
    annotationsByName: model.annotationsByName,
    libraryFuncsByName: model.libraryFuncsByName,
    emitOrder: model.emitOrder,
    sourceMap: [],
    diagnostics: [],
    registry
  };
}

/**
 * Emit one namespace as a single .schema.json file.
 *
 * Entry point for the JSON Schema emitter.
 * T093, T096, T097.
 *
 * Source-map convention for JSON Schema (FR-018, studio-preview.md §Source-map coverage):
 *   - Each type ($defs/<TypeName>) → maps to the `type TypeName:` Rune source line
 *
 * Source-map entries point at the concrete `$defs/<TypeName>` key lines in the emitted
 * JSON so Studio line-click navigation can resolve back to the defining Rune node.
 */
export function emitNamespace(
  model: NamespaceWalkResult,
  options: GeneratorOptions,
  registry: NamespaceRegistry = { namespaces: new Map() }
): GeneratorOutput {
  return emitNamespaceWithContract(model, options, registry, JsonSchemaNamespaceEmitter);
}

export class JsonSchemaNamespaceEmitter implements NamespaceEmitter {
  private readonly ctx: EmissionContext;
  private readonly $defs: Record<string, object> = {};
  private readonly pendingSourceMapEntries: PendingSourceMapEntry[] = [];
  private readonly fallbackSourceUri: string;
  private readonly rulesMetadata: Record<string, { kind: string; inputType: string }> = {};

  constructor(
    private readonly model: NamespaceWalkResult,
    _options: GeneratorOptions,
    registry: NamespaceRegistry = { namespaces: new Map() }
  ) {
    this.ctx = buildEmissionContext(model, registry);
    this.fallbackSourceUri = model.docs[0]?.uri?.toString() ?? '';
  }

  private trackDefinitionSourceMap(node: Data | RosettaEnumeration | RosettaTypeAlias): void {
    const start = node.$cstNode?.range?.start;
    const sourceUri = node.$container?.$document?.uri?.toString() ?? this.fallbackSourceUri;
    if (!sourceUri || !start) {
      return;
    }
    this.pendingSourceMapEntries.push({
      name: node.name,
      sourceUri,
      sourceLine: start.line + 1,
      sourceChar: start.character + 1
    });
  }

  private flushSourceMap(content: string): void {
    const lines = content.split('\n');
    for (const entry of this.pendingSourceMapEntries) {
      const marker = `    ${JSON.stringify(entry.name)}: {`;
      const outputLine = lines.findIndex((line) => line === marker);
      if (outputLine === -1) {
        continue;
      }
      this.ctx.sourceMap.push({
        outputLine,
        sourceUri: entry.sourceUri,
        sourceLine: entry.sourceLine,
        sourceChar: entry.sourceChar
      });
    }
  }

  emitEnumeration(enumNode: RosettaEnumeration): void {
    this.$defs[enumNode.name] = emitEnumDef(enumNode);
    this.trackDefinitionSourceMap(enumNode);
  }

  emitTypeAlias(typeAlias: RosettaTypeAlias): void {
    this.$defs[typeAlias.name] = emitTypeAliasDef(typeAlias, this.ctx);
    this.trackDefinitionSourceMap(typeAlias);
  }

  emitData(data: Data): void {
    this.$defs[data.name] = emitTypeDef(data, this.ctx);
    this.trackDefinitionSourceMap(data);
  }

  emitRule(rule: RosettaRule): void {
    const kind = rule.eligibility ? 'eligibility' : 'reporting';
    const inputRef = rule.input?.type?.ref;
    this.rulesMetadata[rule.name] = { kind, inputType: inputRef ? inputRef.name : 'unknown' };
  }

  finalize(): GeneratorOutput {
    const schema: Record<string, unknown> = {
      $schema: DRAFT_2020_12,
      $id: this.ctx.relativePath,
      title: this.model.namespace,
      $defs: this.$defs
    };
    if (Object.keys(this.rulesMetadata).length > 0) {
      schema['x-rune-rules'] = this.rulesMetadata;
    }
    const content = serializeJson(schema) + '\n';
    this.flushSourceMap(content);
    return {
      relativePath: this.ctx.relativePath,
      content,
      sourceMap: this.ctx.sourceMap,
      diagnostics: this.ctx.diagnostics,
      funcs: []
    };
  }
}
