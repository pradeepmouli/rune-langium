// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * json-schema-reader — JSON Schema (Draft 7 / 2020-12) → `SourceModel`
 * (spec.md User Story 1, Phase 1's only active importer).
 *
 * Scope (per spec.md's Phase 1 item 5 + acceptance scenarios 1-6):
 *  - `object` + `properties` + `required` → `SourceType` + cardinality
 *  - `array` + `minItems`/`maxItems` → cardinality
 *  - `enum` / `oneOf` of `const` → `SourceEnum`, with `x-rune-enum-display`
 *    (our own outbound emitter's extension) preferred over guessing a
 *    display name from a non-identifier-safe enum literal
 *  - `allOf` composing a base `$ref` + extra `properties` → `extends`
 *  - `minimum`/`maximum`/`exclusiveMinimum`/`exclusiveMaximum` → `range`
 *  - `minLength`/`maxLength` → `length`
 *  - `pattern` → `pattern` (always stub, per the amended scenario 5)
 *  - `oneOf` + `discriminator` → `oneOf` (sibling-property presence, NOT
 *    the enum/const form above — disambiguated by shape, see `isEnumOneOf`)
 *  - internal `$defs`/`definitions` `$ref` resolution only (hand-rolled,
 *    per spec.md's Source Parser Dependencies table); an external ref
 *    (anything without a `#/$defs/...` or `#/definitions/...` shape)
 *    produces an `external-ref` diagnostic and the referencing
 *    property/type is skipped rather than guessed at.
 *  - `$id` → namespace derivation (reverse-DNS-ish host+path), falling back
 *    to the caller-supplied `--namespace` option; an error when neither
 *    yields a valid Rune namespace segment sequence (spec.md open question 2).
 *
 * This module has ZERO Rune-AST awareness — its only job is
 * `JSON Schema document → SourceModel`. `ast-builder.ts` /
 * `constraint-translator.ts` do the Rune-specific work.
 */

import type { ConstraintIR, SourceEnum, SourceModel, SourceType, SourceAttribute } from '../source-model.js';
import { pushDiagnostic, type ImportDiagnostic } from '../diagnostics.js';

// --- JSON Schema shape (loosely typed — we only read the keywords we translate) ---

interface JsonSchemaNode {
  $id?: string;
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  minItems?: number;
  maxItems?: number;
  enum?: unknown[];
  const?: unknown;
  allOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  discriminator?: { propertyName?: string };
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  description?: string;
  title?: string;
  'x-rune-enum-display'?: Record<string, string>;
  $defs?: Record<string, JsonSchemaNode>;
  definitions?: Record<string, JsonSchemaNode>;
}

const BUILTIN_TYPE_MAP: Readonly<Record<string, string>> = {
  string: 'string',
  integer: 'int',
  number: 'number',
  boolean: 'boolean'
};

export interface JsonSchemaImportOptions {
  /** Overrides namespace derivation from `$id` (spec.md CLI `--namespace`). */
  namespace?: string;
}

/**
 * Reads a top-level JSON Schema document (with `$defs`/`definitions`) into a
 * `SourceModel`. Every `$defs`/`definitions` entry becomes either a
 * `SourceType` (object) or a `SourceEnum` (enum/const-union), in declaration
 * order.
 */
export function readJsonSchema(
  schema: JsonSchemaNode,
  options: JsonSchemaImportOptions = {}
): { model: SourceModel; diagnostics: ImportDiagnostic[] } {
  const diagnostics: ImportDiagnostic[] = [];
  const namespace = deriveNamespace(schema, options, diagnostics);
  const defs = { ...schema.$defs, ...schema.definitions };

  const types: SourceType[] = [];
  const enums: SourceEnum[] = [];

  for (const [key, def] of Object.entries(defs)) {
    if (isEnumDef(def)) {
      enums.push(readEnumDef(key, def));
      continue;
    }
    if (def.type === 'object' || def.properties !== undefined || def.allOf !== undefined) {
      types.push(readTypeDef(key, def, defs, diagnostics));
      continue;
    }
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'unrecognized-def',
      message: `$defs/${key} is neither an object nor an enum/const definition — skipped`
    });
  }

  return {
    model: { namespace, sourceName: 'JsonSchema', types, enums },
    diagnostics
  };
}

// --- namespace derivation (spec.md open question 2) ------------------------

/**
 * Derives a Rune-safe dotted namespace from `$id` (reverse-DNS-ish:
 * `https://example.com/schemas/trade.json` → `com.example.schemas.trade`),
 * falling back to `options.namespace`. Throws when neither yields at least
 * one valid segment — spec.md: "error if neither yields a valid namespace".
 */
function deriveNamespace(
  schema: JsonSchemaNode,
  options: JsonSchemaImportOptions,
  diagnostics: ImportDiagnostic[]
): string {
  const fromId = schema.$id ? namespaceFromId(schema.$id) : undefined;
  const namespace = fromId ?? options.namespace;
  if (!namespace || !isValidNamespace(namespace)) {
    if (fromId && options.namespace) {
      pushDiagnostic(diagnostics, {
        severity: 'info',
        code: 'namespace-fallback',
        message: `$id '${schema.$id}' did not yield a usable namespace; using --namespace '${options.namespace}'`
      });
    }
    throw new Error(
      `Unable to derive a Rune namespace: '$id' ('${schema.$id ?? '<absent>'}') did not yield a valid ` +
        `namespace and no --namespace override was supplied.`
    );
  }
  return namespace;
}

function namespaceFromId(id: string): string | undefined {
  try {
    const url = new URL(id);
    const hostSegments = url.hostname.split('.').filter(Boolean).reverse();
    const pathSegments = url.pathname
      .replace(/\.(json|schema\.json)$/i, '')
      .split('/')
      .filter(Boolean);
    const segments = [...hostSegments, ...pathSegments].map(sanitizeSegment).filter(Boolean);
    return segments.length > 0 ? segments.join('.') : undefined;
  } catch {
    // Not a URL — treat the whole $id as a single dotted path candidate.
    const segments = id.split(/[./]/).map(sanitizeSegment).filter(Boolean);
    return segments.length > 0 ? segments.join('.') : undefined;
  }
}

function sanitizeSegment(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9_]/g, '');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : '';
}

const NAMESPACE_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function isValidNamespace(ns: string): boolean {
  return NAMESPACE_RE.test(ns);
}

// --- enum / const-union detection ------------------------------------------

/** A def is an enum def when it has a bare `enum` array, OR is a `oneOf` of single-`const` branches (no `discriminator` — that shape is the sibling-presence oneOf, handled by `readOneOfConstraint`). */
function isEnumDef(def: JsonSchemaNode): boolean {
  if (Array.isArray(def.enum)) return true;
  if (Array.isArray(def.oneOf) && def.oneOf.length > 0 && !def.discriminator) {
    return def.oneOf.every((branch) => branch.const !== undefined);
  }
  return false;
}

function readEnumDef(key: string, def: JsonSchemaNode): SourceEnum {
  const displayMap = def['x-rune-enum-display'];
  const rawValues: unknown[] = Array.isArray(def.enum) ? def.enum : (def.oneOf ?? []).map((b) => b.const);

  const used = new Set<string>();
  const values = rawValues.map((raw) => {
    const original = String(raw);
    const displayName = displayMap?.[original];
    const name = dedupeIdentifier(sanitizeEnumValue(original), used);
    return {
      name,
      // Prefer the outbound emitter's own x-rune-enum-display map; otherwise
      // fall back to the original literal when sanitization changed it
      // (scenario 3: "ACT/360" → ACT_360 retains the original as displayName).
      ...((displayName ?? (name !== original ? original : undefined)) !== undefined && {
        displayName: displayName ?? original
      })
    };
  });

  return { name: key, sourceKey: key, values };
}

/** Sanitizes a non-ValidID-safe enum literal into a Rune-safe identifier (scenario 3: `"ACT/360"` → `ACT_360`). */
function sanitizeEnumValue(raw: string): string {
  let cleaned = raw.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (cleaned.length === 0) cleaned = 'VALUE';
  if (/^[0-9]/.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned;
}

function dedupeIdentifier(base: string, used: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

// --- $ref resolution (internal $defs/definitions only) ---------------------

/** Resolves `#/$defs/<Name>` or `#/definitions/<Name>` to the def's key; anything else is an external ref (diagnostic, caller skips). */
function resolveInternalRef(ref: string): string | undefined {
  const match = /^#\/(?:\$defs|definitions)\/([^/]+)$/.exec(ref);
  return match?.[1];
}

// --- object (type) definitions ----------------------------------------------

function readTypeDef(
  key: string,
  def: JsonSchemaNode,
  defs: Record<string, JsonSchemaNode>,
  diagnostics: ImportDiagnostic[]
): SourceType {
  // allOf composing [{$ref: base}, {own properties}] → extends (spec.md scenario 4).
  if (def.allOf && def.allOf.length > 0) {
    return readAllOfType(key, def, defs, diagnostics);
  }

  const required = new Set(def.required ?? []);
  const attributes: SourceAttribute[] = [];
  for (const [propName, propDef] of Object.entries(def.properties ?? {})) {
    attributes.push(readAttribute(propName, propDef, required.has(propName), defs, diagnostics));
  }

  const constraints: ConstraintIR[] = [];
  if (def.oneOf && def.oneOf.length > 0 && def.discriminator) {
    constraints.push(readOneOfConstraint(def));
  }

  return { name: toTypeName(key), sourceKey: key, attributes, constraints };
}

function readAllOfType(
  key: string,
  def: JsonSchemaNode,
  defs: Record<string, JsonSchemaNode>,
  diagnostics: ImportDiagnostic[]
): SourceType {
  const branches = def.allOf ?? [];
  const baseBranch = branches.find((b) => b.$ref !== undefined);
  const ownBranch = branches.find((b) => b.properties !== undefined) ?? branches.find((b) => b !== baseBranch);

  let extendsName: string | undefined;
  if (baseBranch?.$ref) {
    const refKey = resolveInternalRef(baseBranch.$ref);
    if (refKey) {
      extendsName = toTypeName(refKey);
    } else {
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'external-ref',
        message: `$defs/${key}: allOf base $ref '${baseBranch.$ref}' is not an internal $defs/definitions reference — extends omitted`
      });
    }
  }

  const required = new Set(ownBranch?.required ?? []);
  const attributes: SourceAttribute[] = [];
  for (const [propName, propDef] of Object.entries(ownBranch?.properties ?? {})) {
    attributes.push(readAttribute(propName, propDef, required.has(propName), defs, diagnostics));
  }

  return {
    name: toTypeName(key),
    sourceKey: key,
    ...(extendsName !== undefined && { extends: extendsName }),
    attributes,
    constraints: []
  };
}

function readAttribute(
  propName: string,
  propDef: JsonSchemaNode,
  isRequired: boolean,
  defs: Record<string, JsonSchemaNode>,
  diagnostics: ImportDiagnostic[]
): SourceAttribute {
  const constraints: ConstraintIR[] = [];
  const isArray = propDef.type === 'array';
  const itemDef = isArray ? (propDef.items ?? {}) : propDef;

  const typeName = resolveTypeName(itemDef, defs, diagnostics, propName);

  const cardinality = isArray
    ? { inf: propDef.minItems ?? 0, ...(propDef.maxItems !== undefined && { sup: propDef.maxItems }) }
    : { inf: isRequired ? 1 : 0, sup: 1 };

  const constraintTarget = isArray ? itemDef : propDef;
  pushRangeConstraint(constraintTarget, propName, constraints);
  pushLengthConstraint(propDef, propName, constraints, isArray);
  if (constraintTarget.pattern !== undefined) {
    constraints.push({ kind: 'pattern', path: propName, regex: constraintTarget.pattern });
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'untranslatable-construct',
      message: `property '${propName}': 'pattern' has no Rune expression-level equivalent — will emit a stub condition`
    });
  }

  return {
    name: toAttributeName(propName),
    typeName,
    cardinality,
    ...(propDef.description !== undefined && { description: propDef.description }),
    sourceKey: propName,
    constraints
  };
}

function pushRangeConstraint(node: JsonSchemaNode, path: string, constraints: ConstraintIR[]): void {
  const min = typeof node.exclusiveMinimum === 'number' ? node.exclusiveMinimum : node.minimum;
  const max = typeof node.exclusiveMaximum === 'number' ? node.exclusiveMaximum : node.maximum;
  const exclusive = typeof node.exclusiveMinimum === 'number' || typeof node.exclusiveMaximum === 'number';
  if (min !== undefined || max !== undefined) {
    constraints.push({
      kind: 'range',
      path,
      ...(min !== undefined && { min }),
      ...(max !== undefined && { max }),
      ...(exclusive && { exclusive: true })
    });
  }
}

function pushLengthConstraint(node: JsonSchemaNode, path: string, constraints: ConstraintIR[], isArray: boolean): void {
  // For a scalar string, minLength/maxLength map to `length` on the attribute
  // itself; for an array, minItems/maxItems ALREADY encode cardinality (not a
  // condition) — see readAttribute's cardinality derivation — so only the
  // scalar string form emits a length constraint here.
  if (isArray) return;
  if (node.minLength !== undefined || node.maxLength !== undefined) {
    constraints.push({
      kind: 'length',
      path,
      ...(node.minLength !== undefined && { min: node.minLength }),
      ...(node.maxLength !== undefined && { max: node.maxLength })
    });
  }
}

/** `oneOf` + `discriminator` → `oneOf` ConstraintIR over the union member property names (scenario 6). */
function readOneOfConstraint(def: JsonSchemaNode): ConstraintIR {
  const propertyName = def.discriminator?.propertyName;
  const paths = (def.oneOf ?? [])
    .flatMap((branch) => Object.keys(branch.properties ?? {}))
    .filter((p) => p !== propertyName);
  return { kind: 'oneOf', paths: [...new Set(paths)] };
}

function resolveTypeName(
  node: JsonSchemaNode,
  defs: Record<string, JsonSchemaNode>,
  diagnostics: ImportDiagnostic[],
  propName: string
): string {
  if (node.$ref) {
    const refKey = resolveInternalRef(node.$ref);
    if (refKey && refKey in defs) {
      return isEnumDef(defs[refKey]!) ? refKey : toTypeName(refKey);
    }
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'external-ref',
      message: `property '${propName}': $ref '${node.$ref}' is not an internal $defs/definitions reference — using 'string'`
    });
    return 'string';
  }
  const type = Array.isArray(node.type) ? node.type[0] : node.type;
  return (type && BUILTIN_TYPE_MAP[type]) ?? 'string';
}

// --- naming -----------------------------------------------------------------

/** JSON Schema def keys are used verbatim as Rune type/enum names when already ValidID-safe (the common case); sanitized otherwise. */
function toTypeName(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : sanitizeEnumValue(key);
}

/** JSON property names are used verbatim when already ValidID-safe camelCase-ish identifiers; sanitized otherwise. */
function toAttributeName(propName: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(propName) ? propName : sanitizeEnumValue(propName);
}
