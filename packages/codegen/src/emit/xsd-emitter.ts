// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * XSD (W3C XML Schema) target emitter for the Rune code generator (spec.md
 * Phase 3, adopted 2026-07-06).
 *
 * Entry point: emitNamespace(model, options, registry) → GeneratorOutput
 *
 * This is a FROM-SCRATCH namespace emitter — like `json-schema-emitter.ts`,
 * NOT like `openapi-emitter.ts` (which composes over the JSON Schema
 * emitter's own output). XSD has nothing natural to compose from JSON
 * Schema output, so this module walks `Data`/`Choice`/`RosettaEnumeration`
 * directly, the same way `json-schema-emitter.ts`'s `JsonSchemaNamespaceEmitter`
 * does, and builds plain XML string templates (no `fast-xml-parser`
 * `XMLBuilder` dependency needed — deterministic string assembly, mirroring
 * how `JsonSchemaNamespaceEmitter.serializeJson` hand-rolls its own
 * formatter rather than pulling in a generic serializer).
 *
 * Mapping (the INVERSE of `../import/sources/xsd-reader.ts`'s own vocabulary
 * — that reader is the ground truth for shape; every design choice below
 * was checked against its actual parsing logic, not assumed):
 *
 *  - `Data` → a top-level named `xs:complexType`. Attributes → `xs:element`
 *    children of an `xs:sequence`. `minOccurs`/`maxOccurs`: `(1..1)` →
 *    neither attribute (both default to `1`); `(0..1)` → `minOccurs="0"`;
 *    `(0..*)` → `minOccurs="0" maxOccurs="unbounded"`; `(1..*)` →
 *    `maxOccurs="unbounded"` (no `minOccurs`, since `1` is the default);
 *    `(n..m)`/`(n..*)` general case → both attributes emitted explicitly
 *    whenever they differ from the XSD default. A typed attribute
 *    referencing another Data/Enum → `type="TargetTypeName"` (no namespace
 *    prefix machinery — single document, single implicit target namespace,
 *    fixed `xs:` prefix, exactly the reader's own default-prefix-agnostic
 *    but here author-side-fixed convention).
 *
 *  - `RosettaEnumeration` → a top-level named `xs:simpleType` +
 *    `xs:restriction base="xs:string"` + one `xs:enumeration value="..."`
 *    per enum value. The reader's `buildEnumFromSimpleType` records each
 *    value's ORIGINAL source literal via `sourceKey`/the `[synonym ...
 *    value "..."]` annotation — but no emitter in this codebase (json-
 *    schema-emitter.ts's own `emitEnumDef` included) currently reads that
 *    synonym back out when EMITTING; every existing emitter uses the
 *    Rune-safe identifier (`RosettaEnumValue.name`) as the literal enum
 *    value. This emitter matches that established (if perhaps surprising)
 *    convention for consistency/DRY — see this file's own doc note below
 *    for the full finding.
 *
 *  - `extends` (Data.superType) → `xs:complexContent`/`xs:extension
 *    base="ParentTypeName"`, with the extending type's OWN new attributes
 *    nested inside the `xs:extension`'s own `xs:sequence` — the base
 *    type's attributes are NEVER re-emitted on the child (matches the
 *    reader's own `readComplexType`/`buildType`, which never re-attaches a
 *    base type's attributes to the extending type).
 *
 *  - A `required choice a, b, ...` condition (`ChoiceOperation` with
 *    `necessity: 'required'`, recognized via `constraint-recognizer.ts`'s
 *    `recognizeCondition` → `{kind: 'oneOf', paths}`) → the named attributes
 *    are pulled OUT of the plain `xs:sequence` and re-grouped as a single
 *    `xs:choice` nested inside the sequence — the EXACT inverse of the
 *    reader's own `xs:choice → (0..1) attributes + oneOf constraint`
 *    mapping (`xsd-reader.ts`'s `buildType`: "every choice member becomes a
 *    (0..1) attribute regardless of its own minOccurs/maxOccurs, PLUS a
 *    type-level `{kind: 'oneOf', paths}`"). A Rune `choice`/`optional
 *    choice` (`{kind: 'choice', paths}`) has no XSD `minOccurs="0"`-choice-
 *    group equivalent the reader consumes identically (the reader always
 *    emits a REQUIRED `oneOf`, never `choice`, from `xs:choice` — there is
 *    no XSD shape it derives an optional `choice` constraint from), so only
 *    `oneOf` conditions are rendered as `xs:choice`; an `optional choice`
 *    condition is left unrepresented in the XSD output (same "recognized
 *    but not literally round-tripped structurally" posture as every other
 *    condition kind below).
 *
 *  - A genuine Rune `choice` TYPE DECLARATION (`Choice`, a distinct Rune
 *    construct from the `required choice` CONDITION above) has no XSD
 *    inverse the reader can consume back into a `Choice` — the reader never
 *    produces a Rune `Choice` declaration from any XSD construct (confirmed:
 *    `xsd-reader.ts` has zero references to a Choice-shaped output; its
 *    `SourceModel`/`SourceType` has no choice-declaration concept, only the
 *    attributes+oneOf-condition shape above). This emitter still emits a
 *    structurally reasonable `xs:complexType` + nested `xs:choice` for a
 *    `Choice` declaration (each option → an `xs:element`) so the output is
 *    not simply silently dropped, but this half is NOT exercised by the
 *    single-artifact oracle (there is no reader-side path back to a Rune
 *    `Choice`) — see this package's round-trip test file's own doc comment
 *    for the explicit call-out.
 *
 *  - Conditions via `recognizeCondition` (`../emit/constraint-recognizer.ts`)
 *    + this file's OWN `constraintIRToXsdFacets`:
 *      - `range` → `xs:minInclusive`/`xs:maxInclusive` (or
 *        `xs:minExclusive`/`xs:maxExclusive` per bound when the IR's
 *        `exclusive` flag is set — XSD natively supports a MIXED
 *        inclusive/exclusive pair in one `xs:restriction`, so both bounds
 *        are combined into ONE restriction, never refused) as a
 *        SEPARATELY-NAMED top-level `xs:simpleType`, referenced from the
 *        owning `xs:element` via `@_type` — NOT an anonymous restriction
 *        nested inline inside the element. **Reader-ground-truth finding,
 *        corrected from an earlier (wrong) assumption**: `xsd-reader.ts`'s
 *        `readElementLike`/`buildAttributeFromElementLike` ONLY ever
 *        resolves a scalar-restricted simpleType's facets via `@_type`
 *        pointing at a named top-level `xs:simpleType`
 *        (`collectSimpleTypes` reads ONLY `schema[q('simpleType')]` —
 *        direct children of `xs:schema` — never an `xs:element`'s own
 *        nested child); an `xs:element` with NO `@_type` attribute falls
 *        straight through to `{ typeName: 'string' }` with the facets
 *        silently never read at all (verified empirically: an inline
 *        anonymous nested `xs:simpleType`/`xs:restriction` round-tripped
 *        to a plain `string` attribute with zero conditions, in this
 *        emitter's own test suite, before this was corrected — see the
 *        round-trip conditions test file's own doc comment for the
 *        explicit call-out). Each facet-bearing attribute gets its own
 *        uniquely-named simpleType (`<AttributeName>Type`).
 *      - `length` → `xs:maxLength`/`xs:minLength`/`xs:length` the same
 *        named-top-level-simpleType way (`length` when both bounds are
 *        equal, matching the reader's own `xs:length` → single min===max
 *        `length` IR collapse — `facetsToConstraints` folds `xs:length` to
 *        one IR with `min === max`; emitting the collapsed single-facet
 *        form when both bounds are present and equal keeps the round trip
 *        exact rather than merely equivalent).
 *      - Conditions that don't map to a SINGLE attribute's facets (`oneOf`
 *        handled above as `xs:choice`; `choice`/`comparison`/`exists`/
 *        `absent`/`conditional`/unrecognized) are NOT rendered as XSD
 *        structure — "recognized but not literally round-tripped
 *        structurally", the same posture `openapi-emitter.ts`'s own
 *        `constraintIRToJsonSchemaKeywords` doc comment establishes for
 *        constructs its own keyword rendering can't express (this emitter
 *        does not add an opaque metadata sidecar the way the JSON Schema/
 *        OpenAPI emitters do via `x-rune-conditions` — XSD has no
 *        established non-standard-extension convention analogous to
 *        `x-`-prefixed keys; the condition is simply not represented in
 *        this document, per spec.md's "CONSERVATIVE ... reject to an
 *        unrepresentable/opaque fallback rather than guess" framing).
 *      - `xs:pattern` is never emitted outbound — confirmed via
 *        `xsd-reader.ts`'s own `facetsToConstraints`, which only ever
 *        stubs `xs:pattern` into an untranslatable `pattern` ConstraintIR
 *        (never a real Rune expression), matching every other reader's
 *        "no expression-level regex" rule; there is no Rune condition
 *        shape this emitter could recognize as pattern-shaped in the first
 *        place (`recognizeCondition` has no `pattern` recognizer), so this
 *        is naturally a non-issue rather than a special case to guard.
 *
 *  - NO func/operation emission: spec.md's Phase 3 vocabulary-mapping table
 *    and its "Outbound emitter" paragraph enumerate Data/Enumeration/
 *    Choice/extends/constraints only — XSD has no RPC verb model and the
 *    addendum never mentions funcs/operations for this target (unlike
 *    OpenAPI's Phase 2b decision 4). Confirmed by reading the ENTIRE
 *    Phase 3 section top to bottom before writing this file.
 */

import {
  isChoice,
  isData,
  isRosettaEnumeration,
  isRosettaBasicType,
  type Choice,
  type Data,
  type Attribute,
  type RosettaEnumeration,
  type RosettaCardinality,
  type RosettaTypeAlias,
  type Condition
} from '@rune-langium/core';
import type { GeneratorOptions, GeneratorOutput, GeneratorDiagnostic } from '../types.js';
import { emitNamespaceWithContract } from './namespace-emitter.js';
import type { NamespaceEmitterOptions } from './namespace-emitter.js';
import { BaseNamespaceEmitter, decodeCardinality } from './base-namespace-emitter.js';
import type { NamespaceRegistry } from './namespace-registry.js';
import { getTargetRelativePath, type NamespaceWalkResult } from './namespace-walker.js';
import { recognizeCondition } from './constraint-recognizer.js';
import type { ConstraintIR } from '../import/source-model.js';

const XSD_NS = 'http://www.w3.org/2001/XMLSchema';

/** Builtin Rune scalar → XSD builtin type name (the inverse of xsd-reader.ts's `BUILTIN_TYPE_MAP`; picks ONE canonical XSD spelling per Rune type — `decimal` for `number`, `int` for the Rune `int` family — since the reader collapses several XSD spellings onto the same Rune type). */
const XSD_BUILTIN_TYPE_MAP: Readonly<Record<string, string>> = {
  string: 'string',
  number: 'decimal',
  int: 'int',
  boolean: 'boolean',
  date: 'date',
  dateTime: 'dateTime'
};

/** Facet keywords for a single-attribute `ConstraintIR`, rendered as `<xs:FACET value="..."/>` children of a (named, top-level — see this module's doc comment for why) `xs:restriction` — the XSD-facet mirror of `constraint-recognizer.ts`'s own `constraintIRToJsonSchemaKeywords`. Type-level constructs (`oneOf`/`choice`) and every other kind return `undefined` — handled separately (`oneOf` → `xs:choice` regrouping; everything else unrepresented, per this module's own doc comment). */
export function constraintIRToXsdFacets(ir: ConstraintIR): Record<string, number> | undefined {
  switch (ir.kind) {
    case 'range': {
      const facets: Record<string, number> = {};
      if (ir.min !== undefined) facets[ir.exclusive ? 'minExclusive' : 'minInclusive'] = ir.min;
      if (ir.max !== undefined) facets[ir.exclusive ? 'maxExclusive' : 'maxInclusive'] = ir.max;
      return Object.keys(facets).length > 0 ? facets : undefined;
    }
    case 'length': {
      if (ir.min !== undefined && ir.max !== undefined && ir.min === ir.max) {
        return { length: ir.min };
      }
      const facets: Record<string, number> = {};
      if (ir.min !== undefined) facets['minLength'] = ir.min;
      if (ir.max !== undefined) facets['maxLength'] = ir.max;
      return Object.keys(facets).length > 0 ? facets : undefined;
    }
    default:
      return undefined;
  }
}

/** XML-escapes a string for use as element/attribute text content or a quoted attribute value. */
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function indentLines(lines: readonly string[], depth: number): string[] {
  const pad = '  '.repeat(depth);
  return lines.map((l) => (l.length > 0 ? `${pad}${l}` : l));
}

/** One resolved attribute's element shape: name, `type="..."` value (a builtin, another named type, OR — when facets are present — a synthesized named restricted-simpleType name), and cardinality attrs. */
interface ResolvedElement {
  name: string;
  typeName: string;
  minOccurs?: string;
  maxOccurs?: string;
}

/** A synthesized named `xs:simpleType` restricting a builtin base type with recognized facets — emitted as a top-level sibling of the owning complexType, referenced from the element via `@_type` (see this module's doc comment for why: the reader only resolves scalar facets through a NAMED top-level simpleType, never an inline nested one). */
interface RestrictedSimpleType {
  name: string;
  base: string;
  facets: Record<string, number>;
}

function cardinalityAttrs(card: RosettaCardinality): { minOccurs?: string; maxOccurs?: string } {
  const { lower, upper } = decodeCardinality(card);
  const out: { minOccurs?: string; maxOccurs?: string } = {};
  if (lower !== 1) out.minOccurs = String(lower);
  if (upper === null) out.maxOccurs = 'unbounded';
  else if (upper !== 1) out.maxOccurs = String(upper);
  return out;
}

/** Renders one `xs:element` as a plain self-closing tag with a `type="..."` attribute (the type may be a builtin, another named type, or a synthesized named restricted-simpleType — indistinguishable at this call site, by design: the reader resolves all three identically via `@_type`). */
function renderElement(el: ResolvedElement, depth: number): string[] {
  const attrParts = [`name="${escapeXml(el.name)}"`];
  if (el.minOccurs !== undefined) attrParts.push(`minOccurs="${el.minOccurs}"`);
  if (el.maxOccurs !== undefined) attrParts.push(`maxOccurs="${el.maxOccurs}"`);
  attrParts.push(`type="${escapeXml(el.typeName)}"`);
  return indentLines([`<xs:element ${attrParts.join(' ')}/>`], depth);
}

/** Renders one synthesized named restricted-simpleType as a top-level `xs:simpleType`/`xs:restriction` block. */
function renderRestrictedSimpleType(rt: RestrictedSimpleType): string {
  const lines = [
    `<xs:simpleType name="${escapeXml(rt.name)}">`,
    `  <xs:restriction base="${escapeXml(rt.base)}">`,
    ...Object.entries(rt.facets).map(([facet, value]) => `    <xs:${facet} value="${value}"/>`),
    `  </xs:restriction>`,
    `</xs:simpleType>`
  ];
  return lines.join('\n');
}

export function emitNamespace(
  model: NamespaceWalkResult,
  options: GeneratorOptions,
  registry: NamespaceRegistry = { namespaces: new Map() }
): GeneratorOutput {
  return emitNamespaceWithContract(model, options, registry, XsdNamespaceEmitter);
}

export class XsdNamespaceEmitter extends BaseNamespaceEmitter {
  private readonly relativePath: string;
  private readonly diagnostics: GeneratorDiagnostic[] = [];
  private readonly complexTypeBlocks: string[] = [];
  private readonly simpleTypeBlocks: string[] = [];
  /** Every top-level `xs:simpleType` name emitted so far in this namespace (enum names + synthesized restricted-simpleType names share one name space) — guards against `synthesizeRestrictedSimpleType` colliding with an enum or another attribute's synthesized type. */
  private readonly usedSimpleTypeNames = new Set<string>();

  constructor(
    model: NamespaceWalkResult,
    options: NamespaceEmitterOptions,
    registry: NamespaceRegistry = { namespaces: new Map() }
  ) {
    super(model, options, registry);
    this.relativePath = getTargetRelativePath(model.namespace, 'xsd');
  }

  emitEnumeration(enumNode: RosettaEnumeration): void {
    this.usedSimpleTypeNames.add(enumNode.name);
    this.simpleTypeBlocks.push(XsdNamespaceEmitter.renderEnumSimpleType(enumNode));
  }

  emitTypeAlias(_typeAlias: RosettaTypeAlias): void {
    // No XSD equivalent for a Rune type alias in spec.md's Phase 3 vocabulary
    // (the reader never produces one either) — silently no-op, matching
    // json-schema-emitter's own scope (a type alias with no XSD-native
    // shape has no established "opaque fallback" convention here since the
    // whole document has no per-property metadata sidecar to attach one to).
  }

  emitData(data: Data): void {
    this.complexTypeBlocks.push(this.renderDataComplexType(data));
  }

  emitChoice(choice: Choice): void {
    this.complexTypeBlocks.push(this.renderChoiceComplexType(choice));
  }

  finalize(): GeneratorOutput {
    const body = [...this.simpleTypeBlocks, ...this.complexTypeBlocks].join('\n\n');
    const content =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<xs:schema xmlns:xs="${XSD_NS}" targetNamespace="urn:rune:${this.model.namespace}" elementFormDefault="qualified">\n\n` +
      (body.length > 0 ? `${body}\n\n` : '') +
      `</xs:schema>\n`;

    return {
      relativePath: this.relativePath,
      content,
      sourceMap: [],
      diagnostics: this.diagnostics,
      funcs: []
    };
  }

  // ---------------------------------------------------------------------------
  // Private instance methods
  // ---------------------------------------------------------------------------

  /** Resolves an attribute's XSD type name (builtin, enum, Data, or Choice reference) and any recognized scalar facets attached to it via its owning Data's conditions. */
  private resolveAttributeType(attr: Attribute): string {
    const typeRef = attr.typeCall?.type?.ref;
    const refText = attr.typeCall?.type?.$refText;

    if (typeRef) {
      if (isRosettaBasicType(typeRef)) {
        const mapped = XSD_BUILTIN_TYPE_MAP[typeRef.name];
        if (mapped) return `xs:${mapped}`;
        this.diagnostics.push({
          severity: 'warning',
          code: 'unmapped-builtin',
          message: `Builtin type '${typeRef.name}' has no XSD mapping; emitting xs:string`
        });
        return 'xs:string';
      }
      if (isRosettaEnumeration(typeRef) || isData(typeRef) || isChoice(typeRef)) {
        return typeRef.name;
      }
    }

    if (refText) {
      const builtin = XSD_BUILTIN_TYPE_MAP[refText];
      if (builtin) return `xs:${builtin}`;
      if (
        this.model.enumByName.has(refText) ||
        this.model.dataByName.has(refText) ||
        this.model.choiceByName.has(refText)
      ) {
        return refText;
      }
      this.diagnostics.push({
        severity: 'warning',
        code: 'unresolved-ref',
        message: `Attribute '${attr.name}': type '${refText}' is not resolved; emitting xs:string`
      });
      return 'xs:string';
    }

    this.diagnostics.push({
      severity: 'warning',
      code: 'unresolved-ref',
      message: `Attribute '${attr.name}' has an unresolved type reference`
    });
    return 'xs:string';
  }

  /** Recognizes every condition on `data` via `constraint-recognizer.ts`, splitting into per-attribute facet maps (`range`/`length`) and the set of attribute names participating in a `required choice` (`oneOf`) group, if any (spec.md Phase 3: at most a SINGLE `xs:choice` group per complexType is representable — the reader itself only ever produces one `oneOf` constraint per type, from one `xs:choice`). */
  private recognizeAttributeFacets(conditions: readonly Condition[]): {
    facetsByPath: Map<string, Record<string, number>>;
    oneOfPaths?: string[];
  } {
    const facetsByPath = new Map<string, Record<string, number>>();
    let oneOfPaths: string[] | undefined;

    for (const condition of conditions) {
      if (condition.expression == null) continue;
      const ir = recognizeCondition(condition.expression);
      if (!ir) continue;

      if (ir.kind === 'oneOf') {
        // Only the FIRST recognized oneOf becomes an xs:choice group — a
        // second one has no representable second choice-group slot in this
        // MVP mapping (documented limitation, mirrors the reader's own
        // single-oneOf-per-xs:choice production).
        if (!oneOfPaths) oneOfPaths = ir.paths;
        continue;
      }

      if (!('path' in ir)) continue; // choice/conditional/etc — not a per-attribute facet shape
      const facets = constraintIRToXsdFacets(ir);
      if (!facets) continue;
      const existing = facetsByPath.get(ir.path);
      facetsByPath.set(ir.path, existing ? { ...existing, ...facets } : facets);
    }

    return { facetsByPath, oneOfPaths };
  }

  /**
   * Resolves every one of `data`'s OWN attributes (not inherited ones —
   * `extends` puts only the child's new attributes in its own
   * `xs:extension`/`xs:sequence`, matching the reader's `buildType` which
   * never re-attaches a base type's attributes to the extending type) into
   * `ResolvedElement`s, honoring a recognized `oneOf` group by splitting
   * them into (plain sequence members, choice members). A facet-bearing
   * attribute's `type="..."` is redirected to a freshly synthesized named
   * restricted-simpleType (pushed onto `this.simpleTypeBlocks` as a
   * top-level sibling) rather than an inline nested restriction — see this
   * module's doc comment for why.
   */
  private resolveElements(data: Data): { plain: ResolvedElement[]; choiceMembers: ResolvedElement[] } {
    const { facetsByPath, oneOfPaths } = this.recognizeAttributeFacets(data.conditions ?? []);
    const choiceNameSet = new Set(oneOfPaths ?? []);

    const plain: ResolvedElement[] = [];
    const choiceMembers: ResolvedElement[] = [];

    for (const attr of data.attributes) {
      const baseTypeName = this.resolveAttributeType(attr);
      const facets = facetsByPath.get(attr.name);
      const typeName = facets ? this.synthesizeRestrictedSimpleType(attr.name, baseTypeName, facets) : baseTypeName;
      const element: ResolvedElement = {
        name: attr.name,
        typeName,
        ...cardinalityAttrs(attr.card)
      };
      if (choiceNameSet.has(attr.name)) {
        choiceMembers.push(element);
      } else {
        plain.push(element);
      }
    }

    return { plain, choiceMembers };
  }

  /** Synthesizes a uniquely-named top-level restricted `xs:simpleType` (`<AttributeName>Type`, de-duplicated against every prior simpleType name in this namespace — enum names included, since both share the same top-level simpleType name space) for a facet-bearing attribute, pushes its rendering onto `this.simpleTypeBlocks`, and returns the synthesized name for the owning element's `type="..."` attribute. */
  private synthesizeRestrictedSimpleType(attrName: string, base: string, facets: Record<string, number>): string {
    const capitalized = attrName.charAt(0).toUpperCase() + attrName.slice(1);
    let candidate = `${capitalized}Type`;
    let suffix = 2;
    while (this.usedSimpleTypeNames.has(candidate)) {
      candidate = `${capitalized}Type${suffix}`;
      suffix += 1;
    }
    this.usedSimpleTypeNames.add(candidate);
    this.simpleTypeBlocks.push(renderRestrictedSimpleType({ name: candidate, base, facets }));
    return candidate;
  }

  /** Renders one `Data` node as a top-level named `xs:complexType`. */
  private renderDataComplexType(data: Data): string {
    const { plain, choiceMembers } = this.resolveElements(data);
    const bodyLines: string[] = [];
    for (const el of plain) bodyLines.push(...renderElement(el, 0));
    if (choiceMembers.length > 0) {
      bodyLines.push('<xs:choice>');
      for (const el of choiceMembers) bodyLines.push(...renderElement(el, 1));
      bodyLines.push('</xs:choice>');
    }

    const superTypeRef = data.superType?.ref;
    const parentName = superTypeRef && (isData(superTypeRef) || isChoice(superTypeRef)) ? superTypeRef.name : undefined;

    if (parentName) {
      const inner = indentLines(['<xs:sequence>', ...indentLines(bodyLines, 1), '</xs:sequence>'], 3);
      const lines = [
        `<xs:complexType name="${escapeXml(data.name)}">`,
        `  <xs:complexContent>`,
        `    <xs:extension base="${escapeXml(parentName)}">`,
        ...inner,
        `    </xs:extension>`,
        `  </xs:complexContent>`,
        `</xs:complexType>`
      ];
      return lines.join('\n');
    }

    if (bodyLines.length === 0) {
      return `<xs:complexType name="${escapeXml(data.name)}"/>`;
    }

    const lines = [
      `<xs:complexType name="${escapeXml(data.name)}">`,
      `  <xs:sequence>`,
      ...indentLines(bodyLines, 2),
      `  </xs:sequence>`,
      `</xs:complexType>`
    ];
    return lines.join('\n');
  }

  /**
   * Renders a genuine Rune `Choice` DECLARATION as a top-level named
   * `xs:complexType` wrapping a plain `xs:choice` of its options — a
   * best-effort structural emission with NO reader-side inverse (see this
   * file's module doc: `xsd-reader.ts` never produces a Rune `Choice`
   * declaration from any XSD construct), so this path is not exercised by
   * the round-trip oracle.
   */
  private renderChoiceComplexType(choice: Choice): string {
    const elements = choice.attributes.map((option): ResolvedElement => {
      const optionTypeRef = option.typeCall?.type;
      const optionTypeName = optionTypeRef?.ref?.name ?? optionTypeRef?.$refText ?? 'unknown';
      return { name: optionTypeName, typeName: optionTypeName, minOccurs: '0', maxOccurs: '1' };
    });

    const bodyLines: string[] = ['<xs:choice>'];
    for (const el of elements) bodyLines.push(...indentLines(renderElement(el, 0), 1));
    bodyLines.push('</xs:choice>');

    const lines = [
      `<xs:complexType name="${escapeXml(choice.name)}">`,
      ...indentLines(bodyLines, 1),
      `</xs:complexType>`
    ];
    return lines.join('\n');
  }

  /**
   * Renders a `RosettaEnumeration` as a top-level named `xs:simpleType` +
   * `xs:restriction base="xs:string"` + one `xs:enumeration` per value.
   *
   * Uses `enumValue.name` (the Rune-safe identifier) as the literal
   * `value="..."` — NOT a synonym-recorded original source literal. This
   * mirrors json-schema-emitter.ts's own `emitEnumDef`, which likewise uses
   * `v.name` (never reads `v.synonyms`/a `[synonym ... value "..."]`
   * annotation back out) — no emitter in this codebase currently reads an
   * enum value's recorded synonym when EMITTING (only the INBOUND readers
   * ever WRITE one, via `synonym-builder.ts`, to preserve a non-ValidID-safe
   * original literal). Consistent with that established convention (DRY);
   * see this module's own top-of-file doc note for the full finding.
   */
  private static renderEnumSimpleType(enumNode: RosettaEnumeration): string {
    const lines = [
      `<xs:simpleType name="${escapeXml(enumNode.name)}">`,
      `  <xs:restriction base="xs:string">`,
      ...enumNode.enumValues.map((v) => `    <xs:enumeration value="${escapeXml(v.name)}"/>`),
      `  </xs:restriction>`,
      `</xs:simpleType>`
    ];
    return lines.join('\n');
  }
}
