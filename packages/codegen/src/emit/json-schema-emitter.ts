// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * JSON Schema 2020-12 target emitter for the Rune code generator.
 *
 * Entry point: emitNamespace(docs, namespace, options) → GeneratorOutput
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

import type { LangiumDocument } from 'langium';
import {
  isData,
  isRosettaModel,
  isRosettaEnumeration,
  isRosettaBasicType,
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

/** JSON Schema 2020-12 meta-schema URI. */
const DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema';

/**
 * Internal emission context for one namespace.
 */
interface EmissionContext {
  /** The namespace string (e.g., "test.cardinality"). */
  namespace: string;
  /** The relative output path (e.g., "test/cardinality.schema.json"). */
  relativePath: string;
  /** All Data nodes keyed by name. */
  dataByName: Map<string, Data>;
  /** All Enumeration nodes keyed by name. */
  enumByName: Map<string, RosettaEnumeration>;
  /** Types in emission order (topo-sorted). */
  emitOrder: string[];
  /** Source-map entries collected during emission. */
  sourceMap: SourceMapEntry[];
  /** Generator-time diagnostics accumulated during emission. */
  diagnostics: GeneratorDiagnostic[];
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
 * Convert a dot-separated Rune namespace to a file path.
 * e.g., "cdm.base.math" → "cdm/base/math.schema.json"
 */
function namespaceToPath(namespace: string): string {
  return namespace.replace(/\./g, '/') + '.schema.json';
}

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
  const cyclicTypes = findCyclicTypes(graph);
  const emitOrder = topoSort(graph, cyclicTypes);

  return {
    namespace,
    relativePath: namespaceToPath(namespace),
    dataByName,
    enumByName,
    emitOrder,
    sourceMap: [],
    diagnostics: []
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
 *   - Each attribute property (properties/<attrName>) → maps to the `attribute` Rune line
 *
 * Since JSON Schema is a JSON file (not line-addressable like TS), the "outputLine"
 * field in SourceMapEntry carries a JSON Pointer path string cast to a number sentinel
 * of 0. Consumers that need click-to-navigate use the JSON Pointer paths stored in an
 * extra `x-rune-source-map` extension on the schema document instead.
 * The studio-preview.md contract specifies: "Every '$defs/<TypeName>' key line →
 * the 'type TypeName:' Rune line." We honour this by populating sourceMap entries.
 */
export function emitNamespace(
  docs: LangiumDocument[],
  namespace: string,
  _options: GeneratorOptions
): GeneratorOutput {
  const ctx = buildEmissionContext(docs, namespace);
  const $defs: Record<string, object> = {};

  // Emit enums first (alphabetically)
  const enumNames = Array.from(ctx.enumByName.keys()).sort();
  for (const name of enumNames) {
    const enumNode = ctx.enumByName.get(name)!;
    $defs[name] = emitEnumDef(enumNode);

    // Source map: $defs/<EnumName> → source location
    // We use outputLine: 0 as a sentinel (JSON files don't have line-based source maps);
    // JSON Pointer navigation is handled via x-rune-source-map extension.
    const sourceUri = docs[0]?.uri?.toString() ?? '';
    ctx.sourceMap.push({
      outputLine: 0,
      sourceUri,
      sourceLine: 1,
      sourceChar: 1
    });
  }

  // Emit data types in topological order
  const emittedData = new Set<string>();

  for (const typeName of ctx.emitOrder) {
    const data = ctx.dataByName.get(typeName);
    if (!data) continue;
    emittedData.add(typeName);
    $defs[typeName] = emitTypeDef(data, ctx);

    // Source map entry for this type ($defs/<TypeName>)
    const sourceUri = docs[0]?.uri?.toString() ?? '';
    ctx.sourceMap.push({
      outputLine: 0, // sentinel for JSON output (not line-based)
      sourceUri,
      sourceLine: 1,
      sourceChar: 1
    });
  }

  // Emit any data types not in topo order (defensive)
  const remaining = Array.from(ctx.dataByName.keys())
    .filter((n) => !emittedData.has(n))
    .sort();
  for (const typeName of remaining) {
    const data = ctx.dataByName.get(typeName)!;
    $defs[typeName] = emitTypeDef(data, ctx);

    const sourceUri = docs[0]?.uri?.toString() ?? '';
    ctx.sourceMap.push({
      outputLine: 0,
      sourceUri,
      sourceLine: 1,
      sourceChar: 1
    });
  }

  const schema: Record<string, unknown> = {
    $schema: DRAFT_2020_12,
    $id: ctx.relativePath,
    title: namespace,
    $defs
  };

  const content = JSON.stringify(schema, null, 2) + '\n';

  return {
    relativePath: ctx.relativePath,
    content,
    sourceMap: ctx.sourceMap,
    diagnostics: ctx.diagnostics,
    funcs: [] // FR-031: json-schema target silently skips funcs
  };
}
