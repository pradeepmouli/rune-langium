// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * xsd-reader — W3C XML Schema (XSD) → `SourceModel` (spec.md Phase 3, this
 * effort's inbound-only reader; the outbound `-t xsd` emitter is a separate
 * follow-up task).
 *
 * Parser: `fast-xml-parser@^5.9.3` (spec.md Phase 3: NOT tree-sitter — XSD
 * is a document format like JSON Schema/OpenAPI, not a language with real
 * grammar/statements). No mature typed-XSD-vocabulary package exists, so
 * this module hand-rolls a small, typed walker over XSD's own well-known,
 * fixed vocabulary — the same approach `json-schema-reader.ts` takes for
 * JSON Schema.
 *
 * Two grounded parser-configuration decisions (spec.md Phase 3, verified via
 * a direct spike against `fast-xml-parser@5.9.3` against a representative
 * multi-construct sample XSD before writing this module):
 *
 *  1. `isArray` is mandatory, not optional. A tag occurring once parses to a
 *     plain object; the SAME tag occurring more than once parses to an
 *     array — the exact single-vs-many ambiguity bug class that hit the SQL
 *     reader twice. `xs:element`/`xs:complexType`/`xs:simpleType`/
 *     `xs:enumeration`/`xs:attribute` are forced to ALWAYS be arrays
 *     regardless of occurrence count. `xs:sequence`/`xs:choice`/`xs:all`/
 *     `xs:restriction`/`xs:complexContent`/`xs:extension` are NOT included —
 *     each of these occurs at most once per direct parent in valid XSD (a
 *     complexType has one `xs:sequence` XOR one `xs:choice` XOR one
 *     `xs:all`; a simpleType has one `xs:restriction`), verified empirically
 *     against a representative multi-construct sample.
 *
 *  2. Namespace prefixes are literal and arbitrary. The reader resolves
 *     tag/type-reference lookups via the DECLARED namespace URI (read from
 *     the root element's `xmlns:*` attributes into a prefix→URI map), never
 *     hardcoded `'xs:'`-prefixed string literals. A document using `xsd:`
 *     (or any other alias) for `http://www.w3.org/2001/XMLSchema` parses
 *     identically to one using `xs:` — see xsd-reader.test.ts's
 *     'xsd: prefix' regression test.
 *
 * Vocabulary (spec.md Phase 3's exact mapping):
 *  - Top-level named `xs:complexType` → `SourceType`. `xs:sequence`/
 *    `xs:choice`/`xs:all` children → attributes; a complexType's own
 *    `xs:attribute` children → also attributes (Rune has no XML-attribute-
 *    vs-element distinction).
 *  - `xs:simpleType` whose `xs:restriction` has ONLY `xs:enumeration`
 *    children → `SourceEnum`. A `simpleType` with other restriction facets
 *    (no enumeration) is NOT an enum — for MVP its facets are attached to
 *    the REFERENCING attribute (Rune has no first-class "restricted scalar
 *    type"), and the attribute is retyped to the Rune builtin matching the
 *    simpleType's own `base`.
 *  - Built-in XSD type → Rune builtin (`xs:string`→`string`,
 *    `xs:decimal`/`xs:double`/`xs:float`→`number`,
 *    `xs:int`/`xs:integer`/`xs:long`/`xs:short`→`int`, `xs:boolean`→`boolean`,
 *    `xs:date`→`date`, `xs:dateTime`→`dateTime`). A non-builtin `@_type`
 *    referencing another named complexType/enum-shaped simpleType → a typed
 *    attribute referencing that Rune type by its namespace-stripped local
 *    name.
 *  - `minOccurs`/`maxOccurs` → `SourceCardinality` (absent/`"1"` → `1`;
 *    `"0"` → `0`; `"unbounded"` or `> 1` → `sup` absent).
 *  - `xs:choice` → every member becomes a `(0..1)` attribute PLUS a
 *    type-level `{ kind: 'oneOf', paths }` ConstraintIR — mirrors
 *    `json-schema-reader.ts`'s own discriminated-`oneOf` handling.
 *  - `xs:extension` (nested in `xs:complexContent`) → `SourceType.extends`,
 *    resolved via the namespace map to the LOCAL base type name. The base
 *    type's own attributes are NOT re-emitted on the extending type.
 *  - `xs:restriction` facets → `ConstraintIR`: `xs:minInclusive`/
 *    `xs:maxInclusive` → `range` (inclusive); `xs:minExclusive`/
 *    `xs:maxExclusive` → `range` with `exclusive: true` — ONE `range` IR PER
 *    BOUND (never coalesced), matching every other reader's per-bound-
 *    exclusivity discipline; `xs:pattern` → `pattern` (always stub, per the
 *    established no-expression-level-regex rule);
 *    `xs:maxLength`/`xs:minLength`/`xs:length` → `length`.
 *  - Out of MVP scope — diagnostic + skip/stub, never silently dropped:
 *    `xs:union`, `xs:import`/`xs:include` (single-document import only —
 *    never fetches another file), substitution groups
 *    (`substitutionGroup` attribute), abstract types/elements
 *    (`abstract="true"` — Rune has no abstract-type concept; the type is
 *    still emitted structurally), `xs:group`/`xs:attributeGroup` references,
 *    mixed content.
 *
 * This module has ZERO Rune-AST awareness — its only job is
 * `XSD document text → SourceModel`. `ast-builder.ts` /
 * `constraint-translator.ts` do the Rune-specific work, exactly as for
 * every other reader.
 */

import { XMLParser } from 'fast-xml-parser';
import type {
  ConstraintIR,
  SourceAttribute,
  SourceCardinality,
  SourceEnum,
  SourceModel,
  SourceType
} from '../source-model.js';
import { pushDiagnostic, type ImportDiagnostic } from '../diagnostics.js';

// --- XSD namespace + tag resolution -----------------------------------------

const XSD_NS = 'http://www.w3.org/2001/XMLSchema';

/**
 * Tags forced to ALWAYS parse as arrays regardless of occurrence count (see
 * this module's doc, design decision 1). Declared PER-PREFIX at parse time
 * (see `buildIsArray`) since the real prefix isn't known until after a first,
 * prefix-agnostic pass reads the root element's `xmlns:*` attributes.
 */
const ALWAYS_ARRAY_LOCAL_NAMES = new Set(['element', 'complexType', 'simpleType', 'enumeration', 'attribute']);

/** A generic parsed-XML node: element children keyed by (possibly prefixed) tag name, plus `@_`-prefixed attributes. */
type XmlNode = Record<string, unknown>;

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function asNodeOrUndefined(value: unknown): XmlNode | undefined {
  if (value === undefined || value === null) return undefined;
  return value as XmlNode;
}

/**
 * Reads the root element's `xmlns:*` declarations into a prefix→URI map
 * (design decision 2). A bare `xmlns="..."` (default namespace, no prefix)
 * maps under the empty-string key.
 */
function readNamespaceMap(root: XmlNode): Map<string, string> {
  const map = new Map<string, string>();
  for (const [key, value] of Object.entries(root)) {
    if (key === '@_xmlns' && typeof value === 'string') {
      map.set('', value);
    } else if (key.startsWith('@_xmlns:') && typeof value === 'string') {
      map.set(key.slice('@_xmlns:'.length), value);
    }
  }
  return map;
}

/** Resolves the XSD namespace's own declared prefix (e.g. `'xs'`, `'xsd'`, or `''` for a default-namespace document). Throws if the document never declares the XSD namespace at all — there is no vocabulary to walk without it. */
function resolveXsdPrefix(nsMap: ReadonlyMap<string, string>): string {
  for (const [prefix, uri] of nsMap) {
    if (uri === XSD_NS) return prefix;
  }
  throw new Error(
    `rune-codegen import: no xmlns declaration for '${XSD_NS}' was found on the schema root — this does not look like an XSD document.`
  );
}

/** Builds the tag-name-keyed `isArray` predicate for the DECLARED xsd prefix (design decisions 1+2 combined). */
function buildIsArray(xsdPrefix: string): (tagName: string) => boolean {
  const qualify = (local: string): string => (xsdPrefix ? `${xsdPrefix}:${local}` : local);
  const alwaysArrayTags = new Set([...ALWAYS_ARRAY_LOCAL_NAMES].map(qualify));
  return (tagName: string) => alwaysArrayTags.has(tagName);
}

/**
 * Splits a `${prefix}:${local}` (or unprefixed `${local}`) tag name into its
 * local part, given the resolved xsd prefix — used to test "is this an
 * xs:foo tag" without hardcoding the prefix string.
 */
function localName(tagName: string): string {
  const idx = tagName.indexOf(':');
  return idx === -1 ? tagName : tagName.slice(idx + 1);
}

/**
 * Resolves a `@_type="prefix:LocalName"` / `@_base="prefix:LocalName"`
 * value into its LOCAL name (namespace-stripped, design decision 2) plus
 * whether that prefix resolved to the XSD namespace itself (a builtin) or
 * some other namespace (a reference to another named Rune type — including
 * an UNRESOLVED prefix, which is treated as a same-document reference
 * rather than failing outright, since real-world documents sometimes bind
 * the target namespace to no prefix or to the same prefix as another use).
 */
function resolveTypeRef(
  raw: string,
  nsMap: ReadonlyMap<string, string>,
  xsdPrefix: string
): { local: string; isBuiltin: boolean } {
  const idx = raw.indexOf(':');
  if (idx === -1) {
    // No prefix at all. In a document that always prefixes xs: types
    // (xsdPrefix !== ''), an unprefixed reference is always a local
    // same-document reference (never a builtin — a properly authored such
    // document always writes e.g. `xs:string` explicitly). In a
    // DEFAULT-namespace document (xsdPrefix === ''), an unprefixed
    // reference could be EITHER a genuine builtin (`type="string"`) OR a
    // same-document reference to a locally-declared complexType/simpleType
    // that is equally unprefixed under a default namespace — the prefix
    // style alone can't distinguish them. A prior version treated EVERY
    // unprefixed reference in a default-namespace document as a builtin,
    // silently dropping every local-type reference (`extends`, an enum
    // reference, a cross-type reference) — a real, critical bug found via
    // PR review, invisible to the test suite's only no-prefix test (which
    // happened to reference just a builtin). Resolve by checking whether
    // `raw` is actually a KNOWN XSD builtin keyword, not by prefix style.
    const isBuiltin = xsdPrefix === '' && raw in BUILTIN_TYPE_MAP;
    return { local: raw, isBuiltin };
  }
  const prefix = raw.slice(0, idx);
  const local = raw.slice(idx + 1);
  const uri = nsMap.get(prefix);
  return { local, isBuiltin: uri === XSD_NS };
}

// --- builtin type mapping ----------------------------------------------------

const BUILTIN_TYPE_MAP: Readonly<Record<string, string>> = {
  string: 'string',
  decimal: 'number',
  double: 'number',
  float: 'number',
  int: 'int',
  integer: 'int',
  long: 'int',
  short: 'int',
  boolean: 'boolean',
  date: 'date',
  dateTime: 'dateTime'
};

// --- naming ------------------------------------------------------------------

function sanitizeIdentifier(raw: string, fallback: string): string {
  let cleaned = raw.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (cleaned.length === 0) cleaned = fallback;
  if (/^[0-9]/.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned;
}

/** XSD complexType/simpleType names are used verbatim as Rune type/enum names when already ValidID-safe; sanitized otherwise. */
function toTypeName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : sanitizeIdentifier(name, 'Type');
}

/** XSD element/attribute names are used verbatim when already ValidID-safe; sanitized otherwise (matches json-schema-reader.ts's `toAttributeName`). */
function toAttributeName(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : sanitizeIdentifier(name, 'value');
}

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

// --- cardinality ---------------------------------------------------------

/** `minOccurs`/`maxOccurs` → `SourceCardinality` (spec.md Phase 3's exact mapping) — `xs:element` shape. */
function readCardinality(node: XmlNode): SourceCardinality {
  const minRaw = node['@_minOccurs'];
  const maxRaw = node['@_maxOccurs'];
  const inf = minRaw === undefined || minRaw === '1' ? 1 : Number(minRaw);
  if (maxRaw === undefined || maxRaw === '1') return { inf, sup: 1 };
  if (maxRaw === 'unbounded') return { inf };
  const sup = Number(maxRaw);
  return Number.isFinite(sup) && sup > 1 ? { inf } : { inf, sup: Number.isFinite(sup) ? sup : 1 };
}

/**
 * `xs:attribute` has NO `minOccurs`/`maxOccurs` at all (that's an
 * `xs:element`-only pair) — its own occurrence marker is `use="required" |
 * "optional" | "prohibited"`, defaulting to `"optional"` per the XSD spec.
 * Not explicit in spec.md's vocabulary table (which only names
 * `minOccurs`/`maxOccurs`) — this is the natural reading of "an XSD
 * attribute maps to a SourceAttribute" applied to XSD's own real default
 * (an unmarked `xs:attribute` is optional, matching how an unmarked
 * `xs:element` is REQUIRED — the two constructs' defaults are opposite, a
 * real gap found empirically while implementing, not assumed). Always
 * `sup: 1` — attributes are never multi-valued in XSD.
 */
function readAttributeUseCardinality(node: XmlNode): SourceCardinality {
  const use = node['@_use'] as string | undefined;
  return { inf: use === 'required' ? 1 : 0, sup: 1 };
}

// --- reader options --------------------------------------------------------

export interface XsdImportOptions {
  /** Overrides namespace derivation. XSD's `targetNamespace` has no reverse-DNS-ish structure guaranteed to yield a valid dotted Rune namespace, so (unlike JSON Schema/OpenAPI's `$id`/`info.title`) this is effectively always required in practice; falls back to a sanitized form of `targetNamespace` when omitted. */
  namespace?: string;
  /** Structural import only — never populate `constraints` arrays (spec.md CLI `--no-conditions`). Default: translate constraints. */
  skipConditions?: boolean;
}

// --- restriction facets -----------------------------------------------------

interface RestrictionFacets {
  base?: string;
  enumerationValues?: XmlNode[];
  minInclusive?: string;
  maxInclusive?: string;
  minExclusive?: string;
  maxExclusive?: string;
  minLength?: string;
  maxLength?: string;
  length?: string;
  pattern?: string;
  hasUnion: boolean;
}

/** Reads an `xs:restriction`'s own children into a flat facet bag (a restriction has each numeric/string facet at most once — no `isArray` entry needed for these). */
function readRestriction(restriction: XmlNode, xsdPrefix: string): RestrictionFacets {
  const q = (local: string): string => (xsdPrefix ? `${xsdPrefix}:${local}` : local);
  const facetValue = (local: string): string | undefined =>
    asNodeOrUndefined(restriction[q(local)])?.['@_value'] as string | undefined;
  return {
    base: restriction['@_base'] as string | undefined,
    enumerationValues: restriction[q('enumeration')] as XmlNode[] | undefined,
    minInclusive: facetValue('minInclusive'),
    maxInclusive: facetValue('maxInclusive'),
    minExclusive: facetValue('minExclusive'),
    maxExclusive: facetValue('maxExclusive'),
    minLength: facetValue('minLength'),
    maxLength: facetValue('maxLength'),
    length: facetValue('length'),
    pattern: facetValue('pattern'),
    hasUnion: restriction[q('union')] !== undefined
  };
}

/** A restriction is enum-shaped (→ `SourceEnum`) only when it has `xs:enumeration` children and NO other facet (spec.md Phase 3: "ONLY `xs:enumeration` children, no numeric/pattern facets alongside"). */
function isEnumRestriction(facets: RestrictionFacets): boolean {
  return (
    (facets.enumerationValues?.length ?? 0) > 0 &&
    facets.minInclusive === undefined &&
    facets.maxInclusive === undefined &&
    facets.minExclusive === undefined &&
    facets.maxExclusive === undefined &&
    facets.minLength === undefined &&
    facets.maxLength === undefined &&
    facets.length === undefined &&
    facets.pattern === undefined
  );
}

/** Translates a scalar simpleType's own restriction facets into `ConstraintIR`s attached to the REFERENCING attribute (spec.md Phase 3: Rune has no first-class restricted-scalar-type concept). One `range` IR PER BOUND, never coalesced (per-bound-exclusivity discipline, matching every other reader). */
function facetsToConstraints(facets: RestrictionFacets, path: string, diagnostics: ImportDiagnostic[]): ConstraintIR[] {
  const constraints: ConstraintIR[] = [];
  if (facets.minInclusive !== undefined) {
    constraints.push({ kind: 'range', path, min: Number(facets.minInclusive) });
  }
  if (facets.maxInclusive !== undefined) {
    constraints.push({ kind: 'range', path, max: Number(facets.maxInclusive) });
  }
  if (facets.minExclusive !== undefined) {
    constraints.push({ kind: 'range', path, min: Number(facets.minExclusive), exclusive: true });
  }
  if (facets.maxExclusive !== undefined) {
    constraints.push({ kind: 'range', path, max: Number(facets.maxExclusive), exclusive: true });
  }
  if (facets.minLength !== undefined || facets.maxLength !== undefined || facets.length !== undefined) {
    const min =
      facets.length !== undefined
        ? Number(facets.length)
        : facets.minLength !== undefined
          ? Number(facets.minLength)
          : undefined;
    const max =
      facets.length !== undefined
        ? Number(facets.length)
        : facets.maxLength !== undefined
          ? Number(facets.maxLength)
          : undefined;
    constraints.push({ kind: 'length', path, ...(min !== undefined && { min }), ...(max !== undefined && { max }) });
  }
  if (facets.pattern !== undefined) {
    // Diagnostic intentionally NOT pushed here — constraint-translator.ts's
    // `translateConstraintExpression` already pushes one `untranslatable-
    // construct` warning for every `pattern` IR when it emits the stub
    // (matches json-schema-reader.ts's own `pushRangeConstraint`-adjacent
    // comment for the identical reasoning).
    constraints.push({ kind: 'pattern', path, regex: facets.pattern });
  }
  if (facets.hasUnion) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'unsupported-xsd-union',
      message: `simpleType restriction for '${path}': xs:union has no Rune equivalent — member types ignored`
    });
  }
  return constraints;
}

// --- top-level schema walking ------------------------------------------------

interface NamedSimpleType {
  name: string;
  facets: RestrictionFacets;
  isEnum: boolean;
}

/** Reads every top-level `xs:simpleType`, classifying each as enum-shaped or scalar-restricted (spec.md Phase 3's disambiguation rule). */
function collectSimpleTypes(schema: XmlNode, xsdPrefix: string): Map<string, NamedSimpleType> {
  const q = (local: string): string => (xsdPrefix ? `${xsdPrefix}:${local}` : local);
  const simpleTypes = asArray<XmlNode>(schema[q('simpleType')] as XmlNode[] | undefined);
  const byName = new Map<string, NamedSimpleType>();
  for (const st of simpleTypes) {
    const name = st['@_name'] as string | undefined;
    if (!name) continue;
    const restriction = asNodeOrUndefined(st[q('restriction')]);
    // xs:union is a SIBLING of xs:restriction under xs:simpleType (a
    // simpleType has exactly one of restriction/union/list as its child),
    // not nested inside it — a bare `<xs:union>` with no restriction at all
    // must still be detected here, not only when it happens to appear
    // alongside restriction facets (readRestriction only ever looks INSIDE
    // a restriction node).
    const bareUnion = st[q('union')] !== undefined;
    const facets = restriction ? readRestriction(restriction, xsdPrefix) : { hasUnion: bareUnion };
    byName.set(name, { name, facets, isEnum: isEnumRestriction(facets) });
  }
  return byName;
}

function buildEnumFromSimpleType(named: NamedSimpleType): SourceEnum {
  const used = new Set<string>();
  const values = (named.facets.enumerationValues ?? []).map((ev) => {
    const original = String(ev['@_value'] ?? '');
    const name = dedupeIdentifier(sanitizeEnumValue(original), used);
    return {
      name,
      sourceKey: original,
      ...(name !== original && { displayName: original })
    };
  });
  return { name: toTypeName(named.name), sourceKey: named.name, values };
}

/** Resolves a `@_type`/`@_base` reference to the Rune typeName it should become: a builtin, an enum-shaped simpleType's Rune name, a scalar-restricted simpleType's underlying builtin (with facets returned separately for the caller to attach), or (falling through) the namespace-stripped local name of another named complexType. */
function resolveElementType(
  rawType: string,
  nsMap: ReadonlyMap<string, string>,
  xsdPrefix: string,
  simpleTypes: ReadonlyMap<string, NamedSimpleType>
): { typeName: string; scalarFacets?: RestrictionFacets } {
  const { local, isBuiltin } = resolveTypeRef(rawType, nsMap, xsdPrefix);
  if (isBuiltin) {
    return { typeName: BUILTIN_TYPE_MAP[local] ?? 'string' };
  }
  const simple = simpleTypes.get(local);
  if (simple) {
    if (simple.isEnum) return { typeName: toTypeName(simple.name) };
    // Scalar-restricted simpleType: resolve to the Rune builtin matching its
    // OWN base, attach the facets to the referencing attribute instead
    // (spec.md Phase 3 — Rune has no first-class restricted-scalar type).
    const baseTypeName = simple.facets.base
      ? resolveElementType(simple.facets.base, nsMap, xsdPrefix, simpleTypes).typeName
      : 'string';
    return { typeName: baseTypeName, scalarFacets: simple.facets };
  }
  // Not a builtin, not a known simpleType — assume a reference to a named
  // complexType (resolved by `toTypeName` the same way the complexType's own
  // declaration name is sanitized, so references and declarations agree).
  return { typeName: toTypeName(local) };
}

interface ElementLike {
  name: string;
  rawType?: string;
  cardinality: SourceCardinality;
  abstract: boolean;
  substitutionGroup?: string;
}

/**
 * Reads a common shape shared by `xs:element` and `xs:attribute` nodes.
 * `isAttribute` selects the cardinality rule: `xs:element`'s
 * `minOccurs`/`maxOccurs` (`readCardinality`, defaulting to REQUIRED) vs.
 * `xs:attribute`'s `use=` (`readAttributeUseCardinality`, defaulting to
 * OPTIONAL) — the two constructs' unmarked defaults are opposite, so this
 * cannot be inferred from the node's own shape alone (a plain `xs:attribute`
 * with no `use=` at all is indistinguishable, attribute-wise, from a plain
 * `xs:element` with no `minOccurs=` — both simply have neither marker
 * present); the caller already knows which XSD construct it read the node
 * from (`xs:element` vs `xs:attribute` children are collected separately in
 * `readComplexType`), so that context is threaded through explicitly here.
 */
function readElementLike(node: XmlNode, isAttribute: boolean): ElementLike {
  return {
    name: (node['@_name'] as string | undefined) ?? '',
    rawType: node['@_type'] as string | undefined,
    cardinality: isAttribute ? readAttributeUseCardinality(node) : readCardinality(node),
    abstract: node['@_abstract'] === 'true' || node['@_abstract'] === true,
    substitutionGroup: node['@_substitutionGroup'] as string | undefined
  };
}

function buildAttributeFromElementLike(
  el: ElementLike,
  nsMap: ReadonlyMap<string, string>,
  xsdPrefix: string,
  simpleTypes: ReadonlyMap<string, NamedSimpleType>,
  diagnostics: ImportDiagnostic[],
  skipConditions: boolean,
  cardinalityOverride?: SourceCardinality
): SourceAttribute {
  if (el.substitutionGroup) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'unsupported-substitution-group',
      message: `element '${el.name}': substitutionGroup ('${el.substitutionGroup}') has no Rune equivalent — imported structurally, without substitution-group semantics`
    });
  }
  const attrName = toAttributeName(el.name);
  const resolved = el.rawType ? resolveElementType(el.rawType, nsMap, xsdPrefix, simpleTypes) : { typeName: 'string' };
  const constraints: ConstraintIR[] = [];
  if (!skipConditions && resolved.scalarFacets) {
    constraints.push(...facetsToConstraints(resolved.scalarFacets, el.name, diagnostics));
  }
  return {
    name: attrName,
    typeName: resolved.typeName,
    cardinality: cardinalityOverride ?? el.cardinality,
    sourceKey: el.name,
    constraints
  };
}

interface ComplexTypeShape {
  name: string;
  abstract: boolean;
  extendsRaw?: string;
  /** Attribute-like elements from xs:sequence/xs:all (in document order). */
  memberElements: ElementLike[];
  /** xs:choice member elements, if a top-level (non-nested) xs:choice is present. */
  choiceElements: ElementLike[];
  /** xs:attribute children (complexType's own, or the xs:extension's own). */
  attributeElements: ElementLike[];
  hasMixedContent: boolean;
  hasGroupRef: boolean;
  hasAttributeGroupRef: boolean;
}

/** Reads one top-level `xs:complexType`'s structural shape (sequence/choice/all + attributes + optional extension), handling both the plain and `xs:complexContent`/`xs:extension` forms. */
function readComplexType(ct: XmlNode, xsdPrefix: string): ComplexTypeShape {
  const q = (local: string): string => (xsdPrefix ? `${xsdPrefix}:${local}` : local);
  const name = (ct['@_name'] as string | undefined) ?? '';
  const abstract = ct['@_abstract'] === 'true' || ct['@_abstract'] === true;
  const mixed = ct['@_mixed'] === 'true' || ct['@_mixed'] === true;

  const complexContent = asNodeOrUndefined(ct[q('complexContent')]);
  const extension = complexContent ? asNodeOrUndefined(complexContent[q('extension')]) : undefined;
  const body = extension ?? ct;
  const extendsRaw = extension?.['@_base'] as string | undefined;
  const bodyMixed = complexContent ? complexContent['@_mixed'] === 'true' || complexContent['@_mixed'] === true : mixed;

  const sequence = asNodeOrUndefined(body[q('sequence')]);
  const all = asNodeOrUndefined(body[q('all')]);
  const choice = asNodeOrUndefined(body[q('choice')]);
  const container = sequence ?? all;

  const memberElements = asArray<XmlNode>(container?.[q('element')] as XmlNode[] | undefined).map((n) =>
    readElementLike(n, false)
  );
  // A nested xs:choice inside the sequence (the common shape) is ALSO
  // recognized, not only a bare top-level xs:choice replacing the sequence
  // entirely — both are real XSD shapes.
  const nestedChoice = container ? asNodeOrUndefined(container[q('choice')]) : undefined;
  const effectiveChoice = choice ?? nestedChoice;
  const choiceElements = asArray<XmlNode>(effectiveChoice?.[q('element')] as XmlNode[] | undefined).map((n) =>
    readElementLike(n, false)
  );

  const attributeElements = asArray<XmlNode>(body[q('attribute')] as XmlNode[] | undefined).map((n) =>
    readElementLike(n, true)
  );

  const hasGroupRef = (container?.[q('group')] ?? body[q('group')]) !== undefined;
  const hasAttributeGroupRef = body[q('attributeGroup')] !== undefined;

  return {
    name,
    abstract,
    extendsRaw,
    memberElements,
    choiceElements,
    attributeElements,
    hasMixedContent: bodyMixed,
    hasGroupRef,
    hasAttributeGroupRef
  };
}

/** Builds one `SourceType` from a complexType's structural shape. */
function buildType(
  shape: ComplexTypeShape,
  nsMap: ReadonlyMap<string, string>,
  xsdPrefix: string,
  simpleTypes: ReadonlyMap<string, NamedSimpleType>,
  diagnostics: ImportDiagnostic[],
  skipConditions: boolean
): SourceType {
  const typeName = toTypeName(shape.name);

  if (shape.abstract) {
    pushDiagnostic(diagnostics, {
      severity: 'info',
      code: 'unsupported-abstract-type',
      message: `complexType '${shape.name}': abstract="true" has no Rune equivalent — imported as a normal (non-abstract) type`
    });
  }
  if (shape.hasMixedContent) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'unsupported-mixed-content',
      message: `complexType '${shape.name}': mixed content has no Rune equivalent — text content alongside child elements is not imported`
    });
  }
  if (shape.hasGroupRef) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'unsupported-xsd-group-ref',
      message: `complexType '${shape.name}': xs:group reference has no Rune equivalent — skipped (group contents are not inlined)`
    });
  }
  if (shape.hasAttributeGroupRef) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'unsupported-xsd-attribute-group-ref',
      message: `complexType '${shape.name}': xs:attributeGroup reference has no Rune equivalent — skipped`
    });
  }

  let extendsName: string | undefined;
  if (shape.extendsRaw) {
    const { local, isBuiltin } = resolveTypeRef(shape.extendsRaw, nsMap, xsdPrefix);
    if (isBuiltin) {
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'unsupported-builtin-extension',
        message: `complexType '${shape.name}': xs:extension base '${shape.extendsRaw}' is an XSD builtin, not another named complexType — extends omitted`
      });
    } else {
      extendsName = toTypeName(local);
    }
  }

  const attributes: SourceAttribute[] = [
    ...shape.memberElements.map((el) =>
      buildAttributeFromElementLike(el, nsMap, xsdPrefix, simpleTypes, diagnostics, skipConditions)
    ),
    ...shape.choiceElements.map((el) =>
      // Every choice member becomes a (0..1) attribute regardless of its own
      // minOccurs/maxOccurs (spec.md Phase 3's exact rule).
      buildAttributeFromElementLike(el, nsMap, xsdPrefix, simpleTypes, diagnostics, skipConditions, { inf: 0, sup: 1 })
    ),
    ...shape.attributeElements.map((el) =>
      buildAttributeFromElementLike(el, nsMap, xsdPrefix, simpleTypes, diagnostics, skipConditions)
    )
  ];

  const constraints: ConstraintIR[] = [];
  if (!skipConditions && shape.choiceElements.length > 0) {
    constraints.push({ kind: 'oneOf', paths: shape.choiceElements.map((el) => el.name) });
  }

  return {
    name: typeName,
    sourceKey: shape.name,
    ...(extendsName !== undefined && { extends: extendsName }),
    attributes,
    constraints
  };
}

// --- namespace derivation ----------------------------------------------------

const NAMESPACE_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function isValidNamespace(ns: string): boolean {
  return NAMESPACE_RE.test(ns);
}

function sanitizeNamespaceSegment(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9_]/g, '');
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : '';
}

/** Derives a Rune-safe dotted namespace from `--namespace` (always wins) or `targetNamespace` (best-effort sanitization — XSD's targetNamespace is typically a bare URN/URL with no guaranteed reverse-DNS structure, unlike JSON Schema's `$id`). */
function deriveNamespace(schema: XmlNode, options: XsdImportOptions): string {
  if (options.namespace !== undefined) {
    if (!isValidNamespace(options.namespace)) {
      throw new Error(
        `rune-codegen import: the supplied --namespace override ('${options.namespace}') is not a valid Rune namespace (expected dot-separated identifiers, e.g. 'com.example.trade').`
      );
    }
    return options.namespace;
  }
  const targetNamespace = schema['@_targetNamespace'] as string | undefined;
  if (targetNamespace) {
    let candidate: string | undefined;
    try {
      const url = new URL(targetNamespace);
      const hostSegments = url.hostname.split('.').filter(Boolean).reverse();
      const pathSegments = url.pathname.split('/').filter(Boolean);
      const segments = [...hostSegments, ...pathSegments].map(sanitizeNamespaceSegment).filter(Boolean);
      candidate = segments.length > 0 ? segments.join('.') : undefined;
    } catch {
      const segments = targetNamespace
        .split(/[:/.]+/)
        .map(sanitizeNamespaceSegment)
        .filter(Boolean);
      candidate = segments.length > 0 ? segments.join('.') : undefined;
    }
    if (candidate && isValidNamespace(candidate)) return candidate;
  }
  throw new Error(
    `rune-codegen import: unable to derive a Rune namespace from targetNamespace ('${targetNamespace ?? '<absent>'}') — supply --namespace explicitly.`
  );
}

// --- top-level entry point ---------------------------------------------------

/** Reads a full XSD document (a single `xs:schema` root) into a `SourceModel`. */
export function readXsd(
  xmlText: string,
  options: XsdImportOptions = {}
): { model: SourceModel; diagnostics: ImportDiagnostic[] } {
  const diagnostics: ImportDiagnostic[] = [];

  // First pass: prefix-agnostic parse (no isArray forcing yet) purely to
  // read the root element's xmlns:* declarations — cheap, since we only
  // look at attributes here, never at repeated-tag children.
  const probeParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const probed = probeParser.parse(xmlText) as XmlNode;
  const rootKey = Object.keys(probed).find((k) => k !== '?xml' && localName(k) === 'schema');
  if (!rootKey) {
    throw new Error(`rune-codegen import: no 'schema' root element found (expected an xs:schema/xsd:schema document).`);
  }
  const rootProbe = probed[rootKey] as XmlNode;
  const nsMap = readNamespaceMap(rootProbe);
  const xsdPrefix = resolveXsdPrefix(nsMap);

  // Second pass: full parse with the isArray predicate configured for the
  // document's OWN declared xsd prefix (design decisions 1+2 combined).
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: buildIsArray(xsdPrefix)
  });
  const parsed = parser.parse(xmlText) as XmlNode;
  const schema = parsed[rootKey] as XmlNode;

  const q = (local: string): string => (xsdPrefix ? `${xsdPrefix}:${local}` : local);

  for (const importTag of asArray<XmlNode>(schema[q('import')] as XmlNode | XmlNode[] | undefined)) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'unsupported-xsd-import',
      message: `xs:import (namespace '${importTag['@_namespace'] ?? '<none>'}', schemaLocation '${importTag['@_schemaLocation'] ?? '<none>'}') — multi-file schema composition is not supported; only this single document was read`
    });
  }
  for (const includeTag of asArray<XmlNode>(schema[q('include')] as XmlNode | XmlNode[] | undefined)) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'unsupported-xsd-include',
      message: `xs:include (schemaLocation '${includeTag['@_schemaLocation'] ?? '<none>'}') — multi-file schema composition is not supported; only this single document was read`
    });
  }
  for (const groupDecl of asArray<XmlNode>(schema[q('group')] as XmlNode | XmlNode[] | undefined)) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'unsupported-xsd-group-decl',
      message: `top-level xs:group '${groupDecl['@_name'] ?? '<anonymous>'}' has no Rune equivalent — skipped`
    });
  }
  for (const attrGroupDecl of asArray<XmlNode>(schema[q('attributeGroup')] as XmlNode | XmlNode[] | undefined)) {
    pushDiagnostic(diagnostics, {
      severity: 'warning',
      code: 'unsupported-xsd-attribute-group-decl',
      message: `top-level xs:attributeGroup '${attrGroupDecl['@_name'] ?? '<anonymous>'}' has no Rune equivalent — skipped`
    });
  }

  const namespace = deriveNamespace(schema, options);
  const simpleTypesByName = collectSimpleTypes(schema, xsdPrefix);

  const enums: SourceEnum[] = [];
  for (const named of simpleTypesByName.values()) {
    if (named.isEnum) {
      enums.push(buildEnumFromSimpleType(named));
    } else if (named.facets.hasUnion) {
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'unsupported-xsd-union',
        message: `simpleType '${named.name}': xs:union has no Rune equivalent — not imported as a standalone type`
      });
    }
  }

  const complexTypes = asArray<XmlNode>(schema[q('complexType')] as XmlNode | XmlNode[] | undefined).filter(
    (ct) => typeof ct['@_name'] === 'string' && (ct['@_name'] as string).length > 0
  );
  const types: SourceType[] = complexTypes.map((ct) =>
    buildType(
      readComplexType(ct, xsdPrefix),
      nsMap,
      xsdPrefix,
      simpleTypesByName,
      diagnostics,
      options.skipConditions ?? false
    )
  );

  // Top-level xs:element declarations (abstract/substitutionGroup are the
  // only ones with any MVP-relevant signal — see spec.md Phase 3's scope
  // list; a top-level element otherwise carries no additional structure
  // this reader represents beyond its referenced complexType/simpleType).
  const topLevelElements = asArray<XmlNode>(schema[q('element')] as XmlNode | XmlNode[] | undefined)
    .map((n) => readElementLike(n, false))
    .filter((el) => el.name.length > 0);
  for (const el of topLevelElements) {
    if (el.abstract) {
      pushDiagnostic(diagnostics, {
        severity: 'info',
        code: 'unsupported-abstract-element',
        message: `top-level element '${el.name}': abstract="true" has no Rune equivalent — not imported as a distinct construct`
      });
    }
    if (el.substitutionGroup) {
      pushDiagnostic(diagnostics, {
        severity: 'warning',
        code: 'unsupported-substitution-group',
        message: `top-level element '${el.name}': substitutionGroup ('${el.substitutionGroup}') has no Rune equivalent — not imported as a distinct construct`
      });
    }
  }

  return {
    model: { namespace, sourceName: 'Xsd', types, enums, funcs: [] },
    diagnostics
  };
}
