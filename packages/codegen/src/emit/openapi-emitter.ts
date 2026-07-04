// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * OpenAPI 3.1 target emitter for the Rune code generator (spec.md Phase 2b
 * Implementation Addendum).
 *
 * Entry point: emitNamespace(model, options, registry) → GeneratorOutput
 *
 * ─── DECISION 2 (byte-stability) ─────────────────────────────────────────
 * The existing JSON Schema emitter (`json-schema-emitter.ts`) is UNCHANGED
 * by this effort — its own tests/fixtures stay green untouched. This
 * emitter COMPOSES rather than extracts: it calls the JSON Schema
 * emitter's own PUBLIC `emitNamespace()` entry point unmodified, parses
 * the resulting JSON text back into `{ $defs, x-rune-conditions, ... }`,
 * and wraps `$defs` as `components.schemas` — the exact approach
 * `test/import/round-trip-openapi.test.ts`'s test-local
 * `wrapAsOpenApiComponents` helper already proved out for Phase 2's T5
 * oracle (this module productionizes that same pattern as real emitter
 * code, rather than inventing a new one). Byte-stability of the JSON
 * Schema emitter's own output is trivially guaranteed: zero lines of
 * json-schema-emitter.ts are touched by this file.
 *
 * On top of the wrapped schemas, this emitter ADDS (json-schema-emitter.ts
 * does none of this):
 *  1. Constraint keywords for every RECOGNIZED condition
 *     (`../emit/constraint-recognizer.ts`, T1) — merged into the owning
 *     property's schema object, additive alongside the existing
 *     `x-rune-conditions` opaque metadata (nothing removed).
 *  2. Funcs → RPC-style operations (decision 4): `POST /functions/{FuncName}`,
 *     `operationId` = func name, inputs → an inline requestBody object
 *     schema (respecting cardinality — reusing `extractFuncs`'s already-
 *     resolved `RuneFuncParam` shape from `../types/func.ts`, the exact
 *     same extraction `ts-emitter.ts`'s `emitFunctions()` already uses),
 *     output → the 200 response schema, `definition` → summary/description.
 *     `x-rune-operation` carries the SAME "METHOD /path" string T2's
 *     operation-carrier module attaches to a func via
 *     `[openApi op "value"="..."]` — the emitter and the reader (T4) must
 *     independently derive/consume the identical string for the round
 *     trip to close.
 *  3. YAML output: `options.openapi.format === 'yaml'` (or an explicit
 *     `.yaml`/`.yml` extension request) emits YAML via the `yaml` package
 *     (already a runtime dep of this package, from Phase 2's inbound
 *     OpenAPI reader) instead of JSON.
 *  4. CRUD generation (decision 5): an OPT-IN emitter option
 *     (`options.openapi.crud`) generating the standard
 *     `GET /xs`, `POST /xs`, `GET /xs/{id}`, `PUT /xs/{id}`,
 *     `DELETE /xs/{id}` operation set for selected (or all) `Data` types.
 *     NOT default.
 */

import { stringify as stringifyYaml } from 'yaml';
import type { Condition } from '@rune-langium/core';
import type { GeneratorOptions, GeneratorOutput, GeneratorDiagnostic } from '../types.js';
import { emitNamespaceWithContract } from './namespace-emitter.js';
import type { NamespaceEmitterOptions } from './namespace-emitter.js';
import { BaseNamespaceEmitter, mergeProfileTypeMaps } from './base-namespace-emitter.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import { getTargetRelativePath, type NamespaceWalkResult } from './namespace-walker.js';
import { emitNamespace as emitJsonSchemaNamespace } from './json-schema-emitter.js';
import { jsonSchemaProfile } from './json-schema-profile.js';
import { extractFuncs, type RuneFunc, type RuneFuncParam } from '../types/func.js';
import { recognizeCondition, constraintIRToJsonSchemaKeywords } from './constraint-recognizer.js';
import { resolveCrudTypeNames, type OpenApiOptions } from '../options/openapi-options.js';

const JSON_BUILTIN_TYPE_MAP: Readonly<Record<string, object>> = mergeProfileTypeMaps(jsonSchemaProfile) as Record<
  string,
  object
>;

/**
 * Recursively rewrites every `$ref: '#/$defs/X'` to `$ref: '#/components/schemas/X'`
 * — the OAS `components.schemas` local-ref convention, mirroring
 * `test/import/round-trip-openapi.test.ts`'s test-local `rewriteDefsRefs`
 * helper (productionized here as real emitter code).
 */
function rewriteDefsRefsToComponents(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteDefsRefsToComponents);
  if (typeof node !== 'object' || node === null) return node;
  const entries = Object.entries(node as Record<string, unknown>).map(([k, v]) => {
    if (k === '$ref' && typeof v === 'string') {
      return [k, v.replace(/^#\/\$defs\//, '#/components/schemas/')];
    }
    return [k, rewriteDefsRefsToComponents(v)];
  });
  return Object.fromEntries(entries);
}

/** Builds the JSON Schema for one func parameter's type (builtin/enum/Data/Choice — mirrors json-schema-emitter.ts's `resolveItemSchema`, scoped to what a func param can reference). */
function resolveParamItemSchema(
  param: RuneFuncParam,
  model: NamespaceWalkResult,
  diagnostics: GeneratorDiagnostic[]
): object {
  const builtin = JSON_BUILTIN_TYPE_MAP[param.typeName];
  if (builtin) return builtin;
  if (
    model.enumByName.has(param.typeName) ||
    model.dataByName.has(param.typeName) ||
    model.choiceByName.has(param.typeName)
  ) {
    return { $ref: `#/components/schemas/${param.typeName}` };
  }
  diagnostics.push({
    severity: 'warning',
    code: 'unresolved-ref',
    message: `Func parameter '${param.name}': type '${param.typeName}' is not resolved; emitting {}`
  });
  return {};
}

/** Applies a `RuneFuncParam`'s cardinality to its base item schema — the same array/scalar encoding json-schema-emitter.ts's `applyCardinality` uses, reimplemented locally since that method is private (byte-stability decision 2: no shared extraction that could risk the original emitter's output). */
function applyParamCardinality(cardinality: RuneFuncParam['cardinality'], itemSchema: object): object {
  const { lower, upper } = cardinality;
  if (upper !== null && upper <= 1) return itemSchema;
  const arraySchema: Record<string, unknown> = { type: 'array', items: itemSchema };
  if (lower > 0) arraySchema['minItems'] = lower;
  if (upper !== null) arraySchema['maxItems'] = upper;
  return arraySchema;
}

/** Builds an inline object schema from a func's `inputs` (the requestBody schema). */
function buildInputsSchema(
  inputs: readonly RuneFuncParam[],
  model: NamespaceWalkResult,
  diagnostics: GeneratorDiagnostic[]
): object {
  const properties: Record<string, object> = {};
  const required: string[] = [];
  for (const input of inputs) {
    const item = resolveParamItemSchema(input, model, diagnostics);
    properties[input.name] = applyParamCardinality(input.cardinality, item);
    if (input.cardinality.lower >= 1 && input.cardinality.upper === 1) required.push(input.name);
  }
  const schema: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) schema['required'] = required;
  return schema;
}

/** The operation string this emitter and T2/T4's carrier must independently agree on for a given func (decision 4's RPC convention). */
export function operationStringForFunc(funcName: string): string {
  return `POST /functions/${funcName}`;
}

/** camelCase plural path segment for a Data type name (CRUD generation, decision 5) — `Party` → `parties`, naive English pluralization (append `s`, `y`→`ies`) sufficient for the MVP opt-in feature. */
function pluralPathSegment(typeName: string): string {
  const lower = typeName.charAt(0).toLowerCase() + typeName.slice(1);
  if (lower.endsWith('y') && !/[aeiou]y$/.test(lower)) return `${lower.slice(0, -1)}ies`;
  return `${lower}s`;
}

export function emitNamespace(
  model: NamespaceWalkResult,
  options: GeneratorOptions,
  registry: NamespaceRegistry = { namespaces: new Map() }
): GeneratorOutput {
  return emitNamespaceWithContract(model, options, registry, OpenApiNamespaceEmitter);
}

export class OpenApiNamespaceEmitter extends BaseNamespaceEmitter {
  private readonly relativePathJson: string;
  private readonly openApiOptions: OpenApiOptions;
  private readonly diagnostics: GeneratorDiagnostic[] = [];
  private readonly generatorOptions: NamespaceEmitterOptions;

  constructor(model: NamespaceWalkResult, options: NamespaceEmitterOptions, registry: NamespaceRegistry) {
    super(model, options, registry);
    this.relativePathJson = getTargetRelativePath(model.namespace, 'json-schema').replace(
      /\.schema\.json$/,
      '.openapi.json'
    );
    this.openApiOptions = options.openapi ?? {};
    this.generatorOptions = options;
  }

  // NamespaceEmitter contract methods — no-ops. This emitter builds its
  // whole document in `finalize()` by composing the JSON Schema emitter's
  // OWN full run over the same `model`/`registry`, rather than walking
  // per-element like a from-scratch emitter would (decision 2: compose,
  // don't extract/duplicate the JSON Schema emitter's per-type logic).
  emitEnumeration(): void {}
  emitTypeAlias(): void {}
  emitData(): void {}
  emitChoice(): void {}

  finalize(): GeneratorOutput {
    const jsonSchemaOutput = emitJsonSchemaNamespace(this.model, this.generatorOptions, this.registry);
    const jsonSchemaDoc = JSON.parse(jsonSchemaOutput.content) as {
      $defs: Record<string, Record<string, unknown>>;
      'x-rune-rules'?: unknown;
    };

    const schemas = rewriteDefsRefsToComponents(jsonSchemaDoc.$defs) as Record<string, Record<string, unknown>>;
    this.applyConstraintKeywords(schemas);

    const paths: Record<string, Record<string, unknown>> = {};
    this.emitFuncOperations(paths);
    this.emitCrudOperations(paths);

    const doc: Record<string, unknown> = {
      openapi: '3.1.0',
      info: { title: this.model.namespace, version: '0.0.0' },
      paths,
      components: { schemas }
    };
    if (jsonSchemaDoc['x-rune-rules'] !== undefined) {
      doc['x-rune-rules'] = jsonSchemaDoc['x-rune-rules'];
    }

    const format = this.resolveFormat();
    const content = format === 'yaml' ? stringifyYaml(doc) : JSON.stringify(doc, null, 2) + '\n';
    const relativePath = format === 'yaml' ? this.relativePathJson.replace(/\.json$/, '.yaml') : this.relativePathJson;

    return {
      relativePath,
      content,
      sourceMap: jsonSchemaOutput.sourceMap,
      diagnostics: [...jsonSchemaOutput.diagnostics, ...this.diagnostics],
      funcs: []
    };
  }

  private resolveFormat(): 'json' | 'yaml' {
    if (this.openApiOptions.format) return this.openApiOptions.format;
    return 'json';
  }

  /**
   * Merges recognized constraint keywords (T1's `constraint-recognizer.ts`)
   * into each type's own property schemas, ADDITIVE alongside the existing
   * `x-rune-conditions` opaque metadata the composed JSON Schema document
   * already carries (nothing removed — decision 1: "Unrecognizable
   * conditions keep the existing opaque x-rune-conditions metadata;
   * nothing lost, keywords are additive").
   */
  private applyConstraintKeywords(schemas: Record<string, Record<string, unknown>>): void {
    for (const typeName of this.model.emitOrder) {
      const data = this.model.dataByName.get(typeName);
      if (!data) continue;
      const schema = schemas[typeName];
      if (!schema) continue;
      this.applyConditionsToSchema(data.conditions ?? [], schema);
    }
    // emitOrder covers only cyclic-safe topo-sorted names; sweep every
    // remaining Data too (mirrors json-schema-emitter's own dual-pass
    // convention via emitNamespaceWithContract's own fallback sweep).
    for (const [typeName, data] of this.model.dataByName) {
      const schema = schemas[typeName];
      if (!schema) continue;
      this.applyConditionsToSchema(data.conditions ?? [], schema, /* skipIfAlreadyApplied */ true);
    }
  }

  private readonly appliedConditionSchemas = new WeakSet<object>();

  private applyConditionsToSchema(
    conditions: readonly Condition[],
    schema: Record<string, unknown>,
    skipIfAlreadyApplied = false
  ): void {
    if (skipIfAlreadyApplied && this.appliedConditionSchemas.has(schema)) return;
    this.appliedConditionSchemas.add(schema);

    // Resolve the schema's own properties object, following the
    // allOf-composed shape (extends) the same way json-schema-emitter's
    // own emitTypeDef produces it.
    const ownSchema = Array.isArray(schema['allOf'])
      ? ((schema['allOf'] as Record<string, unknown>[])[1] ?? schema)
      : schema;
    const properties = ownSchema['properties'] as Record<string, Record<string, unknown>> | undefined;
    if (!properties) return;

    for (const condition of conditions) {
      if (condition.expression == null) continue;
      const ir = recognizeCondition(condition.expression);
      if (!ir) continue;
      if (!('path' in ir)) continue;
      const propertySchema = properties[ir.path];
      if (!propertySchema) continue;
      const keywords = constraintIRToJsonSchemaKeywords(ir);
      if (!keywords) continue;
      Object.assign(propertySchema, keywords);
    }
  }

  /** Funcs → RPC-style operations (decision 4). */
  private emitFuncOperations(paths: Record<string, Record<string, unknown>>): void {
    const funcs: RuneFunc[] = extractFuncs(Array.from(this.model.docs), this.model.namespace, this.diagnostics);
    for (const func of funcs) {
      const pathKey = `/functions/${func.name}`;
      const operation = operationStringForFunc(func.name);
      const requestBodySchema = buildInputsSchema(func.inputs, this.model, this.diagnostics);
      const outputItem = resolveParamItemSchema(func.output, this.model, this.diagnostics);
      const outputSchema = applyParamCardinality(func.output.cardinality, outputItem);

      paths[pathKey] = {
        post: {
          operationId: func.name,
          'x-rune-operation': operation,
          requestBody: {
            required: true,
            content: { 'application/json': { schema: requestBodySchema } }
          },
          responses: {
            '200': {
              description: `${func.name} result`,
              content: { 'application/json': { schema: outputSchema } }
            }
          }
        }
      };
    }
  }

  /** CRUD paths for selected Data types (decision 5, opt-in). */
  private emitCrudOperations(paths: Record<string, Record<string, unknown>>): void {
    const allDataTypeNames = Array.from(this.model.dataByName.keys());
    const crudTypeNames = resolveCrudTypeNames(this.openApiOptions.crud, allDataTypeNames);
    if (crudTypeNames === undefined) return;

    for (const typeName of crudTypeNames) {
      if (!this.model.dataByName.has(typeName)) continue;
      const schemaRef = { $ref: `#/components/schemas/${typeName}` };
      const collectionPath = `/${pluralPathSegment(typeName)}`;
      const itemPath = `${collectionPath}/{id}`;

      paths[collectionPath] = {
        get: {
          operationId: `List${typeName}`,
          responses: {
            '200': {
              description: `List of ${typeName}`,
              content: { 'application/json': { schema: { type: 'array', items: schemaRef } } }
            }
          }
        },
        post: {
          operationId: `Create${typeName}`,
          requestBody: { required: true, content: { 'application/json': { schema: schemaRef } } },
          responses: {
            '200': { description: `Created ${typeName}`, content: { 'application/json': { schema: schemaRef } } }
          }
        }
      };
      paths[itemPath] = {
        get: {
          operationId: `Get${typeName}`,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: `${typeName} by id`, content: { 'application/json': { schema: schemaRef } } }
          }
        },
        put: {
          operationId: `Update${typeName}`,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: schemaRef } } },
          responses: {
            '200': { description: `Updated ${typeName}`, content: { 'application/json': { schema: schemaRef } } }
          }
        },
        delete: {
          operationId: `Delete${typeName}`,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: `${typeName} deleted` } }
        }
      };
    }
  }
}
