// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * unified-type-reference-resolution Task 6 follow-up — a genuine Rune
 * `Choice` declaration's `renderChoiceComplexType` used to resolve each
 * option's XSD type name via its own separate, ad hoc read of
 * `option.typeCall?.type?.ref?.name ?? option.typeCall?.type?.$refText ??
 * 'unknown'`, entirely bypassing `resolveAttributeType`/the shared
 * `resolveTypeCallTarget` resolver this whole plan migrated every other
 * type-reference site onto. That ad hoc path had two bugs, worse than the
 * one Task 6 fixed for Data attributes:
 *
 *   1. It never mapped through `XSD_BUILTIN_TYPE_MAP` at all — a Choice
 *      option typed as a plain builtin (e.g. `string`) emitted the bare,
 *      invalid `type="string"` instead of `type="xs:string"`.
 *   2. It never chased a `RosettaTypeAlias` chain — the exact bug class
 *      this whole plan exists to fix.
 *
 * Both are now fixed by extracting `resolveAttributeType`'s body into
 * `resolveTypeCallToXsdType(typeCall, diagnosticLabel)` and having
 * `renderChoiceComplexType` call it too (mirrors
 * xsd-type-alias-field.test.ts's Data-attribute alias coverage, but for the
 * Choice-option path).
 */

import { createRuneDslServices, isRosettaModel } from '@rune-langium/core';
import { URI } from 'langium';
import { describe, it, expect } from 'vitest';
import { walkNamespace } from '../../src/emit/namespace-walker.js';
import { emitNamespace } from '../../src/emit/xsd-emitter.js';

async function parseSource(source: string, uri = 'inmemory:///model.rosetta') {
  const { RuneDsl } = createRuneDslServices();
  const doc = RuneDsl.shared.workspace.LangiumDocumentFactory.fromString(source, URI.parse(uri));
  await RuneDsl.shared.workspace.DocumentBuilder.build([doc]);
  const model = doc.parseResult?.value;
  if (!model || !isRosettaModel(model)) {
    throw new Error('expected a RosettaModel');
  }
  return doc;
}

describe('xsd-emitter — Choice-option type resolution', () => {
  it('maps a Choice option typed as a plain builtin through XSD_BUILTIN_TYPE_MAP (not a bare, invalid type="string")', async () => {
    const source = `
namespace test.xsdChoiceOptionBuiltin
version "0.0.0"

choice Asset:
    string
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.xsdChoiceOptionBuiltin');
    const output = emitNamespace(model, {});
    expect(output.content).toContain('type="xs:string"');
    expect(output.content).not.toMatch(/type="string"/);
    // `name` must stay a bare NCName (no `xs:` prefix) even though `type`
    // legitimately carries one — see the dedicated `name` vs `type` NCName
    // regression test below for the full history of this split.
    expect(output.content).toContain('name="string"');
    expect(output.content).not.toContain('name="xs:string"');
    expect(output.diagnostics.filter((d) => d.code === 'unresolved-ref' || d.code === 'unmapped-builtin')).toHaveLength(
      0
    );
  });

  /**
   * Final whole-branch review of docs/standalone-zod-schema-extraction-design
   * (2026-08-04) surfaced a live PR #469 finding: `renderChoiceComplexType`
   * reused the resolved `type` value (from `resolveTypeCallToXsdType`, which
   * legitimately prefixes XSD builtins with `xs:`) as BOTH the element's
   * `type` AND its `name`. For a primitive option this produced
   * `name="xs:string"` — the `name` attribute must be a valid NCName, which
   * cannot contain `:`, so the emitted XSD was invalid. Fixed by deriving
   * `name` from the DIRECT/immediate reference via `choiceOptionFieldName`,
   * the same FIELD-KEY-vs-RESOLVED-VALUE split ts-emitter's
   * emitChoiceTypeDeclaration and zod-emitter's emitChoiceSchema already use
   * for their own Choice-option keys — never the alias-chased terminal type.
   */
  it('derives the element name from the DIRECT reference (never alias-chased), keeping it a valid NCName', async () => {
    const source = `
namespace test.xsdChoiceOptionElementName
version "0.0.0"

type Party:
    partyId string (1..1)

typeAlias Inner: Party
typeAlias Outer: Inner

choice Asset:
    string
    Outer
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.xsdChoiceOptionElementName');
    const output = emitNamespace(model, {});
    const choiceBlock = output.content.slice(
      output.content.indexOf('<xs:complexType name="Asset">'),
      output.content.indexOf('</xs:complexType>', output.content.indexOf('<xs:complexType name="Asset">'))
    );
    // Primitive option: name is the bare builtin name, never the `xs:`-prefixed type.
    expect(choiceBlock).toContain('name="string" minOccurs="0" maxOccurs="1" type="xs:string"');
    // Alias-typed option: name is derived from the DIRECT reference (`Outer`,
    // lowercased), never the alias-chased terminal type (`Party`) — the type
    // attribute, in contrast, DOES chase through to `Party`.
    expect(choiceBlock).toContain('name="outer" minOccurs="0" maxOccurs="1" type="Party"');
    expect(choiceBlock).not.toContain('name="Party"');
    // No `name` attribute anywhere in this block may contain a colon (a
    // valid NCName can never contain one).
    for (const match of choiceBlock.matchAll(/name="([^"]*)"/g)) {
      expect(match[1]).not.toContain(':');
    }
  });

  it('chases a 2-hop type-alias chain (alias-to-alias-to-Data) for a Choice option', async () => {
    const source = `
namespace test.xsdChoiceOptionAliasChain
version "0.0.0"

type Party:
    partyId string (1..1)

typeAlias Inner: Party
typeAlias Outer: Inner

choice Asset:
    Outer
`;
    const doc = await parseSource(source);
    const model = walkNamespace([doc], 'test.xsdChoiceOptionAliasChain');
    const output = emitNamespace(model, {});
    const choiceBlock = output.content.slice(
      output.content.indexOf('<xs:complexType name="Asset">'),
      output.content.indexOf('</xs:complexType>', output.content.indexOf('<xs:complexType name="Asset">'))
    );
    // Fixed: resolves through both aliases to `Party` — pre-fix this option
    // resolved to `Outer` (the alias's OWN name, via `$refText`) since the
    // ad hoc read never consulted `typeAliasByName`.
    expect(choiceBlock).toContain('type="Party"');
    expect(choiceBlock).not.toContain('type="Outer"');
    expect(choiceBlock).not.toContain('type="unknown"');
    expect(output.diagnostics.filter((d) => d.code === 'unresolved-ref')).toHaveLength(0);
  });
});
