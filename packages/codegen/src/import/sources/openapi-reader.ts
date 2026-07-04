// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * openapi-reader — OpenAPI 3.0.x / 3.1 documents (JSON or YAML) → `SourceModel`
 * (spec 021 Phase 2 Addendum item 5, the reordered "OpenAPI reader FIRST"
 * task).
 *
 * `components.schemas` ARE JSON Schema (with dialect differences per OAS
 * version — see below), so this reader's only real job is NORMALIZATION:
 * turn an OpenAPI document into a plain `{ $defs: {...} }` JSON-Schema-
 * shaped document, then delegate the whole thing to the EXISTING, shipped,
 * corpus-tested `readJsonSchema` (json-schema-reader.ts) — per the brief's
 * explicit instruction: "the reader normalizes, the json-schema-reader
 * translates." Nothing about constraint translation, enum detection, `allOf`
 * composition, or `oneOf`+`discriminator`→condition handling is reimplemented
 * here.
 *
 * OAS 3.0 dialect normalization (this reader's actual work):
 *  - `nullable: true` → optionality floor (this reader clears
 *    `required`-membership for that property rather than mutating
 *    cardinality directly — `readJsonSchema` already derives `(0..1)` vs
 *    `(1..1)` purely from `required` membership, so "floor to 0..1" is
 *    just "don't mark it required").
 *  - `discriminator: { propertyName, mapping }` — an OBJECT in both OAS 3.0
 *    and 3.1 (matching `json-schema-reader.ts`'s `JsonSchemaNode.
 *    discriminator` shape already, added in T3 specifically for this reuse).
 *    When `mapping` is present, MAPPING KEYS win as the branch identity
 *    over a `$ref`'s own path segment — this reader resolves each `oneOf`
 *    branch's referenced `components.schemas` entry via the mapping's
 *    `$ref` value and inlines that schema's `properties`/`required` into
 *    the branch object `readJsonSchema`'s `mergeOneOfBranchAttributes`
 *    already knows how to merge (Phase 1 built that machinery for INLINE
 *    oneOf branches; the common real-world OpenAPI idiom is `oneOf` of
 *    pure `$ref`s to named component schemas, which this reader bridges by
 *    inlining rather than teaching the shared translator a second oneOf
 *    branch shape).
 *  - `allOf` composition — identical rule to the JSON Schema path (a
 *    `$ref` base + inline `properties` branch → `extends`); no OAS-specific
 *    normalization needed, `readJsonSchema`'s existing `readAllOfType`
 *    handles it unchanged.
 *  - `exclusiveMinimum`/`exclusiveMaximum` BOOLEAN form (OAS 3.0's own
 *    keyword shape, matching Draft 4/6) — already handled unmodified by
 *    `json-schema-reader.ts`'s T3 `JsonSchemaNode` extension (`number |
 *    boolean`); no separate normalization needed here.
 *
 * OAS 3.1: near-passthrough. 3.1's `SchemaObject` IS 2020-12 JSON Schema
 * (`nullable` was REMOVED in favor of `type: [T, 'null']`, which
 * `readJsonSchema`'s `BUILTIN_TYPE_MAP`/`resolveTypeName` already handle via
 * `Array.isArray(node.type) ? node.type[0] : node.type` — the `'null'`
 * member is simply not selected, matching "first non-null type wins",
 * itself an acceptable MVP simplification consistent with how the reader
 * already treats a `type` array generally).
 *
 * Synonym source name: `OpenApi` (spec.md Phase 2 Addendum item 5).
 * Namespace derivation: `info.title` (sanitized) preferred; falls back to
 * the first `servers[]` entry's URL (reverse-DNS-ish, reusing the exact
 * same host+path convention `json-schema-reader.ts`'s `namespaceFromId`
 * already implements for a JSON Schema `$id` — delegated via
 * `options.namespace` so no logic is duplicated); `--namespace` always wins
 * when supplied (same precedence rule as the JSON Schema reader).
 */

import { parse as parseYaml } from 'yaml';
import type { OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import type { SourceModel } from '../source-model.js';
import { pushDiagnostic, type ImportDiagnostic } from '../diagnostics.js';
import { readJsonSchema, type JsonSchemaImportOptions } from './json-schema-reader.js';

export interface OpenApiImportOptions extends JsonSchemaImportOptions {}

/** A loosely-typed schema-or-reference object, matching this reader's normalization output shape (fed to `readJsonSchema` via the same `as never` boundary convention `import/index.ts`/its own tests already use). */
type LooseSchema = Record<string, unknown>;

/**
 * Parses a `.json`/`.yaml`/`.yml` OpenAPI document (auto-detected: valid
 * JSON parses as JSON, otherwise treated as YAML — the `yaml` package
 * parses plain JSON too, since JSON is a YAML subset, but attempting
 * `JSON.parse` first avoids YAML's more permissive scalar coercion rules
 * on documents that are already strict JSON).
 */
export function parseOpenApiDocument(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    return parseYaml(source);
  }
}

/**
 * Reads a parsed OpenAPI 3.0.x or 3.1 document into a `SourceModel`,
 * delegating the entire structural + constraint translation to
 * `readJsonSchema` after normalizing `components.schemas` into a
 * `{ $defs: {...} }` JSON-Schema-shaped document.
 */
export function readOpenApi(
  doc: unknown,
  options: OpenApiImportOptions = {}
): { model: SourceModel; diagnostics: ImportDiagnostic[] } {
  const diagnostics: ImportDiagnostic[] = [];
  const document = doc as Partial<OpenAPIV3.Document> & Partial<OpenAPIV3_1.Document>;

  const is31 = typeof document.openapi === 'string' && document.openapi.startsWith('3.1');
  const rawSchemas = document.components?.schemas ?? {};

  const defs: Record<string, LooseSchema> = {};
  for (const [name, rawSchema] of Object.entries(rawSchemas)) {
    defs[name] = normalizeSchema(rawSchema as LooseSchema, name, rawSchemas, is31, diagnostics);
  }

  const namespace = options.namespace ?? deriveNamespaceFromDocument(document, diagnostics);

  const shimmed: LooseSchema = { $defs: defs };
  const { model, diagnostics: readerDiagnostics } = readJsonSchema(shimmed as never, {
    namespace,
    ...(options.skipConditions !== undefined && { skipConditions: options.skipConditions })
  });

  // readJsonSchema always stamps sourceName: 'JsonSchema' (it has no
  // awareness this document originated from OpenAPI) — corrected here to
  // the source-specific synonym-source name spec.md requires ('OpenApi'),
  // exactly as `import/index.ts` already does for the JSON Schema path's
  // own `sourceName` field (a plain object property, not re-derived logic).
  const openApiModel: SourceModel = { ...model, sourceName: 'OpenApi' };

  return { model: openApiModel, diagnostics: [...diagnostics, ...readerDiagnostics] };
}

/**
 * Normalizes ONE `components.schemas` entry for the OAS 3.0 dialect
 * (no-op pass-through for 3.1, modulo the `oneOf`+`discriminator.mapping`
 * inlining, which applies identically to both versions since `discriminator`
 * is unchanged between 3.0 and 3.1).
 */
function normalizeSchema(
  schema: LooseSchema,
  ownName: string,
  allSchemas: Record<string, unknown>,
  is31: boolean,
  diagnostics: ImportDiagnostic[]
): LooseSchema {
  if (schema === undefined || schema === null || typeof schema !== 'object') return schema ?? {};

  let result: LooseSchema = schema;

  if (!is31 && result['properties'] !== undefined) {
    result = normalizeNullableProperties(result);
  }

  if (Array.isArray(result['oneOf']) && result['discriminator'] !== undefined) {
    result = inlineDiscriminatedOneOfBranches(result, ownName, allSchemas, diagnostics);
  }

  // allOf composition needs no OAS-specific normalization for the
  // composition ITSELF (readAllOfType handles $ref-base + inline-properties
  // composition identically to the plain JSON Schema path) — recurse into
  // each branch so a NESTED oneOf/nullable inside an allOf's own
  // (inline-properties) branch is normalized too, the same combination
  // json-schema-reader.ts's own readAllOfType already merges for the plain
  // path.
  if (Array.isArray(result['allOf'])) {
    result = {
      ...result,
      allOf: (result['allOf'] as unknown[]).map((branch) =>
        typeof branch === 'object' && branch !== null
          ? normalizeSchema(branch as LooseSchema, ownName, allSchemas, is31, diagnostics)
          : branch
      )
    };
  }

  return rewriteComponentRefs(result) as LooseSchema;
}

/**
 * Rewrites every `$ref: '#/components/schemas/X'` (anywhere in the schema
 * tree — `properties[x].$ref`, `items.$ref`, `allOf[i].$ref`, etc.) to
 * `$ref: '#/$defs/X'`. `readJsonSchema`'s own internal-ref resolution
 * (`resolveInternalRef`) only recognizes the `#/$defs/...` / `#/definitions/
 * ...` JSON Pointer prefixes (its own module's MVP rule); an OpenAPI `$ref`
 * pointing at `#/components/schemas/...` would otherwise be treated as an
 * EXTERNAL reference (diagnosed, falls back to `string`) even though it
 * resolves to an entry this reader already copied into the shimmed
 * document's own `$defs`. A ref to anything OTHER than `#/components/
 * schemas/...` (e.g. `#/components/parameters/...`, or a genuinely external
 * URL) is left untouched — `readJsonSchema` will correctly diagnose it as
 * external, which is accurate (this reader only ever populates `$defs`
 * from `components.schemas`).
 */
function rewriteComponentRefs(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteComponentRefs);
  if (typeof node !== 'object' || node === null) return node;
  const obj = node as LooseSchema;
  const rewritten: LooseSchema = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '$ref' && typeof v === 'string') {
      const match = /^#\/components\/schemas\/([^/]+)$/.exec(v);
      rewritten[k] = match ? `#/$defs/${match[1]}` : v;
    } else {
      rewritten[k] = rewriteComponentRefs(v);
    }
  }
  return rewritten;
}

/**
 * OAS 3.0's `nullable: true` → optionality floor.
 *
 * `readJsonSchema` derives `(1..1)` vs `(0..1)` PURELY from `required`
 * membership at the containing type's `properties` iteration site — it has
 * no `nullable` concept at all (that keyword doesn't exist in any JSON
 * Schema draft; OAS 3.0 invented it). A `nullable: true` property that is
 * ALSO in the parent's `required` array is therefore, per OAS 3.0 semantics
 * ("the value MAY be null" — a distinct axis from "the key MUST be
 * present"), NOT equivalent to Rune's `(1..1)`: the source schema tolerates
 * an explicit `null` where Rune's `(1..1)` tolerates no value at all in
 * that slot. The closest achievable floor without teaching the shared
 * `readJsonSchema` a new keyword (out of scope — "reuse, don't duplicate")
 * is to drop the property from `required` before delegating, so it imports
 * as `(0..1)` rather than the stricter, semantically wrong `(1..1)`; the
 * `nullable` keyword itself is then dead weight `readJsonSchema` never
 * reads, so it is stripped from the property schema to avoid leaking
 * OAS-only keyword noise into the shimmed JSON-Schema-shaped document.
 *
 * Operates on the PARENT object schema (not a single nested property in
 * isolation) because both `required` and `properties` must be visible
 * together to compute the corrected `required` array.
 */
function normalizeNullableProperties(schema: LooseSchema): LooseSchema {
  const properties = schema['properties'] as Record<string, unknown> | undefined;
  if (properties === undefined) return schema;

  const required = new Set((schema['required'] as string[] | undefined) ?? []);
  let changed = false;
  const newProperties: Record<string, unknown> = {};

  for (const [propName, propSchema] of Object.entries(properties)) {
    if (typeof propSchema === 'object' && propSchema !== null && (propSchema as LooseSchema)['nullable'] === true) {
      changed = true;
      required.delete(propName);
      const { nullable: _nullable, ...rest } = propSchema as LooseSchema;
      newProperties[propName] = rest;
    } else {
      newProperties[propName] = propSchema;
    }
  }

  if (!changed) return schema;
  return { ...schema, properties: newProperties, required: [...required] };
}

/**
 * Resolves `$ref: '#/components/schemas/Name'` to `Name`; anything else
 * (an external ref) returns `undefined` — same internal-ref-only MVP rule
 * `json-schema-reader.ts`'s `resolveInternalRef` applies to `$defs`/
 * `definitions` refs.
 */
function resolveComponentRef(ref: string): string | undefined {
  const match = /^#\/components\/schemas\/([^/]+)$/.exec(ref);
  return match?.[1];
}

/**
 * Inlines each `oneOf` branch's referenced component schema's own
 * `properties`/`required` directly into the branch object, so
 * `readJsonSchema`'s existing `mergeOneOfBranchAttributes` (built for
 * INLINE oneOf branches, Phase 1 scenario 6) can merge them without any
 * change to that shared machinery. When `discriminator.mapping` is
 * present, its keys are the AUTHORITATIVE branch identity — a mapping
 * entry's `$ref` value wins over merely appearing in the `oneOf` array in
 * the same position, and a `oneOf` branch with no corresponding mapping
 * entry is diagnosed (mapping is optional in the OpenAPI spec itself, but
 * once present, an unmapped `oneOf` member is a real ambiguity: the spec
 * defines `mapping` as "MUST be used to determine which of the schemas in
 * oneOf ... is expected to satisfy the payload", so an unmapped member has
 * no defined selection rule — this reader retains it in the merge for
 * structural completeness but flags it).
 */
function inlineDiscriminatedOneOfBranches(
  schema: LooseSchema,
  ownName: string,
  allSchemas: Record<string, unknown>,
  diagnostics: ImportDiagnostic[]
): LooseSchema {
  const discriminator = schema['discriminator'] as
    | { propertyName?: string; mapping?: Record<string, string> }
    | undefined;
  const mapping = discriminator?.mapping;
  const oneOf = schema['oneOf'] as unknown[];

  const mappedRefs = new Set(Object.values(mapping ?? {}));

  const inlinedBranches = oneOf.map((rawBranch) => {
    if (typeof rawBranch !== 'object' || rawBranch === null) return rawBranch;
    const branch = rawBranch as LooseSchema;
    const ref = branch['$ref'];
    if (typeof ref !== 'string') return branch;

    const refKey = resolveComponentRef(ref);
    if (refKey === undefined) {
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'external-ref',
        message: `components/schemas/${ownName}: oneOf branch $ref '${ref}' is not an internal components/schemas reference — branch skipped`
      });
      return {};
    }
    if (mapping !== undefined && !mappedRefs.has(ref) && !mappedRefs.has(`#/components/schemas/${refKey}`)) {
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'unmapped-discriminator-branch',
        message: `components/schemas/${ownName}: oneOf branch '$ref: ${ref}' has no entry in discriminator.mapping — included anyway (no defined selection rule per the OpenAPI spec)`
      });
    }

    const referenced = allSchemas[refKey] as LooseSchema | undefined;
    if (referenced === undefined) {
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'external-ref',
        message: `components/schemas/${ownName}: oneOf branch $ref '${ref}' does not resolve to a components/schemas entry — branch skipped`
      });
      return {};
    }
    // Inline the referenced schema's properties/required directly — this
    // is exactly the "inline object with properties" branch shape
    // json-schema-reader.ts's mergeOneOfBranchAttributes already merges;
    // no new branch shape is introduced.
    return {
      type: 'object',
      ...(referenced['properties'] !== undefined && { properties: referenced['properties'] }),
      ...(referenced['required'] !== undefined && { required: referenced['required'] })
    };
  });

  return { ...schema, oneOf: inlinedBranches };
}

const NAMESPACE_SEGMENT_RE = /[^A-Za-z0-9_]/g;

function sanitizeNamespaceSegment(s: string): string {
  const cleaned = s.replace(NAMESPACE_SEGMENT_RE, '_').replace(/^_+|_+$/g, '');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : cleaned.length > 0 ? `_${cleaned}` : '';
}

const NAMESPACE_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/**
 * Derives a Rune namespace from `info.title` (sanitized, preferred) or the
 * first `servers[]` entry's URL (reverse-DNS-ish host+path, the same
 * convention `json-schema-reader.ts`'s `namespaceFromId` already applies to
 * a JSON Schema `$id` — reimplemented locally rather than importing that
 * function, since it is not exported and this reader's fallback source is
 * a `servers[].url`, not a `$id`, a distinct enough input that duplicating
 * the small URL→segments transform is clearer than exporting an internal
 * for one caller). Throws when neither yields a valid namespace, matching
 * `deriveNamespace`'s error contract in the JSON Schema reader.
 */
function deriveNamespaceFromDocument(
  document: Partial<OpenAPIV3.Document> & Partial<OpenAPIV3_1.Document>,
  diagnostics: ImportDiagnostic[]
): string {
  const fromTitle = document.info?.title ? sanitizeTitleToNamespace(document.info.title) : undefined;
  const fromServers = document.servers?.[0]?.url ? namespaceFromUrl(document.servers[0].url) : undefined;
  const namespace = fromTitle ?? fromServers;

  if (namespace === undefined || !NAMESPACE_RE.test(namespace)) {
    pushDiagnostic(diagnostics, {
      severity: 'info',
      code: 'namespace-fallback',
      message: `info.title ('${document.info?.title ?? '<absent>'}') and servers[0].url ('${document.servers?.[0]?.url ?? '<absent>'}') did not yield a usable namespace and no --namespace override was supplied`
    });
    throw new Error(
      `Unable to derive a Rune namespace: neither 'info.title' nor 'servers[0].url' yielded a valid namespace ` +
        `and no --namespace override was supplied.`
    );
  }
  return namespace;
}

function sanitizeTitleToNamespace(title: string): string | undefined {
  const segments = title
    .split(/[\s._-]+/)
    .map(sanitizeNamespaceSegment)
    .filter(Boolean);
  return segments.length > 0 ? segments.join('.') : undefined;
}

function namespaceFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const hostSegments = parsed.hostname.split('.').filter(Boolean).reverse();
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const segments = [...hostSegments, ...pathSegments].map(sanitizeNamespaceSegment).filter(Boolean);
    return segments.length > 0 ? segments.join('.') : undefined;
  } catch {
    return undefined;
  }
}
