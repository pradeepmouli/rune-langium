// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * AST → `.rosetta` text serializer.
 *
 * Converts Rune DSL AST nodes (Data, Choice, RosettaEnumeration) back to
 * valid `.rosetta` source text for round-trip editing workflows.
 *
 * This serializer generates freshly-formatted output — it does not preserve
 * original whitespace or comments (CST-preserving edits are a separate concern).
 */

// We use duck-typing to avoid hard coupling to the Langium runtime reflection
// utilities, which makes the serializer testable in isolation.

// ---------------------------------------------------------------------------
// Type guards (duck-typed)
// ---------------------------------------------------------------------------

function isDataType(el: unknown): boolean {
  return (el as { $type?: string })?.$type === 'Data';
}

function isChoiceType(el: unknown): boolean {
  return (el as { $type?: string })?.$type === 'Choice';
}

function isEnumType(el: unknown): boolean {
  return (el as { $type?: string })?.$type === 'RosettaEnumeration';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indent(text: string, level: number = 1): string {
  const pad = '  '.repeat(level);
  return text
    .split('\n')
    .map((line) => (line.trim() ? `${pad}${line}` : ''))
    .join('\n');
}

function getNamespace(model: unknown): string {
  const m = model as { name?: string | { segments?: string[] } };
  if (typeof m.name === 'string') {
    return m.name;
  }
  if (m.name && typeof m.name === 'object' && 'segments' in m.name) {
    return (m.name as { segments: string[] }).segments.join('.');
  }
  return 'unknown';
}

function formatCardinality(card: { inf: number; sup?: number; unbounded: boolean }): string {
  if (card.unbounded) {
    return `(${card.inf}..*)`;
  }
  const sup = card.sup ?? card.inf;
  return `(${card.inf}..${sup})`;
}

// ---------------------------------------------------------------------------
// Element serializers
// ---------------------------------------------------------------------------

interface AttributeLike {
  name: string;
  override?: boolean;
  definition?: string;
  typeCall?: {
    type?: { ref?: { name?: string }; $refText?: string };
  };
  card?: { inf: number; sup?: number; unbounded: boolean };
}

function serializeAttribute(attr: AttributeLike): string {
  const parts: string[] = [];
  if (attr.override) {
    parts.push('override');
  }
  parts.push(attr.name);

  const typeName = attr.typeCall?.type?.ref?.name ?? attr.typeCall?.type?.$refText;
  if (typeName) {
    parts.push(typeName);
  }

  if (attr.card) {
    parts.push(formatCardinality(attr.card));
  }

  let line = parts.join(' ');

  if (attr.definition) {
    line += `\n  [definition "${escapeString(attr.definition)}"]`;
  }

  return line;
}

interface ChoiceOptionLike {
  definition?: string;
  typeCall?: {
    type?: { ref?: { name?: string }; $refText?: string };
  };
}

function serializeChoiceOption(opt: ChoiceOptionLike): string {
  const typeName = opt.typeCall?.type?.ref?.name ?? opt.typeCall?.type?.$refText ?? 'unknown';

  let line = typeName;
  if (opt.definition) {
    line += `\n  [definition "${escapeString(opt.definition)}"]`;
  }
  return line;
}

interface EnumValueLike {
  name: string;
  definition?: string;
  display?: string;
}

function serializeEnumValue(val: EnumValueLike): string {
  let line = val.name;
  const annotations: string[] = [];
  if (val.display) {
    annotations.push(`displayName "${escapeString(val.display)}"`);
  }
  if (val.definition) {
    annotations.push(`definition "${escapeString(val.definition)}"`);
  }
  if (annotations.length > 0) {
    for (const ann of annotations) {
      line += `\n  [${ann}]`;
    }
  }
  return line;
}

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ---------------------------------------------------------------------------
// Top-level element serializer
// ---------------------------------------------------------------------------

function serializeDataType(data: {
  name: string;
  definition?: string;
  superType?: { ref?: { name?: string }; $refText?: string };
  attributes?: AttributeLike[];
  conditions?: { name?: string; expression?: unknown }[];
}): string {
  const lines: string[] = [];

  let header = `type ${data.name}`;
  const parentName = data.superType?.ref?.name ?? data.superType?.$refText;
  if (parentName) {
    header += ` extends ${parentName}`;
  }
  header += ':';
  lines.push(header);

  if (data.definition) {
    lines.push(`  [definition "${escapeString(data.definition)}"]`);
  }

  const attrs = data.attributes ?? [];
  for (const attr of attrs) {
    lines.push(indent(serializeAttribute(attr as AttributeLike)));
  }

  // Conditions (simplified — just output name)
  const conditions = data.conditions ?? [];
  for (const cond of conditions) {
    if (cond.name) {
      lines.push('');
      lines.push(`  condition ${cond.name}:`);
      // Condition expressions are complex — output a placeholder comment
      lines.push('    True');
    }
  }

  return lines.join('\n');
}

function serializeChoiceType(choice: {
  name: string;
  definition?: string;
  attributes?: ChoiceOptionLike[];
}): string {
  const lines: string[] = [];

  lines.push(`choice ${choice.name}:`);

  if (choice.definition) {
    lines.push(`  [definition "${escapeString(choice.definition)}"]`);
  }

  const opts = choice.attributes ?? [];
  for (const opt of opts) {
    lines.push(indent(serializeChoiceOption(opt)));
  }

  return lines.join('\n');
}

function serializeEnumType(enumeration: {
  name: string;
  definition?: string;
  parent?: { ref?: { name?: string }; $refText?: string };
  enumValues?: EnumValueLike[];
}): string {
  const lines: string[] = [];

  let header = `enum ${enumeration.name}`;
  const parentName = enumeration.parent?.ref?.name ?? enumeration.parent?.$refText;
  if (parentName) {
    header += ` extends ${parentName}`;
  }
  header += ':';
  lines.push(header);

  if (enumeration.definition) {
    lines.push(`  [definition "${escapeString(enumeration.definition)}"]`);
  }

  const values = enumeration.enumValues ?? [];
  for (const val of values) {
    lines.push(indent(serializeEnumValue(val)));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialize a single `RosettaModel` AST node back to `.rosetta` source text.
 *
 * @remarks
 * This serializer performs a **lossy** round-trip — it re-formats output with
 * consistent indentation and does not preserve the original whitespace, comments,
 * or annotation ordering. It is intended for code-generation and export workflows,
 * not for preserving user-authored formatting.
 *
 * Supported top-level element types:
 * - `Data` (type definitions)
 * - `Choice` (choice types)
 * - `RosettaEnumeration` (enum types)
 *
 * Unsupported elements (functions, rules, reporting rules, annotations) are
 * silently skipped. Condition expression bodies are emitted as `True` placeholders.
 *
 * @useWhen
 * - Exporting a modified AST back to `.rosetta` format after programmatic edits
 * - Generating a stub `.rosetta` file from a synthesized model object
 * - Round-trip testing: parse → mutate → serialize → re-parse
 *
 * @avoidWhen
 * - You need to preserve user-authored comments or whitespace — use a
 *   CST-preserving formatter instead.
 * - The model contains `RosettaFunction` or `RosettaRule` elements — these are
 *   silently dropped; use the visual editor serializer for full round-trip fidelity.
 *
 * @pitfalls
 * - Output does NOT include function or rule bodies — function/rule elements are
 *   skipped entirely. Do not use for models where function definitions are critical.
 * - `Condition` expression bodies are emitted as `True` placeholder text — they
 *   are not serialized from the AST expression tree.
 * - The `model` parameter uses `unknown` typing (duck typing) to avoid coupling to
 *   generated Langium types. Pass a `RosettaModel` AST node obtained from `parse()`.
 *
 * @param model - A `RosettaModel` AST node (or duck-typed equivalent).
 * @returns Formatted `.rosetta` source text ending with a trailing newline.
 *
 * @example
 * ```ts
 * import { parse, serializeModel } from '@rune-langium/core';
 *
 * const { value } = await parse(source);
 * const text = serializeModel(value);
 * // text is valid .rosetta source (minus functions/rules/comments)
 * ```
 *
 * @category Core
 */
export function serializeModel(model: unknown): string {
  const m = model as {
    name?: unknown;
    version?: string;
    elements?: unknown[];
    imports?: Array<{ importedNamespace?: string }>;
  };

  const lines: string[] = [];

  // Namespace
  const ns = getNamespace(model);
  lines.push(`namespace ${ns}`);
  lines.push(`version "${m.version ?? '0.0.0'}"`);

  // Imports
  const imports = m.imports ?? [];
  if (imports.length > 0) {
    lines.push('');
    for (const imp of imports) {
      if (imp.importedNamespace) {
        lines.push(`import ${imp.importedNamespace}`);
      }
    }
  }

  // Elements
  const elements = m.elements ?? [];
  for (const element of elements) {
    lines.push('');
    if (isDataType(element)) {
      lines.push(serializeDataType(element as Parameters<typeof serializeDataType>[0]));
    } else if (isChoiceType(element)) {
      lines.push(serializeChoiceType(element as Parameters<typeof serializeChoiceType>[0]));
    } else if (isEnumType(element)) {
      lines.push(serializeEnumType(element as Parameters<typeof serializeEnumType>[0]));
    }
    // Other element types (functions, rules, etc.) are not yet supported
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Serialize a single AST element (`Data`, `Choice`, or `RosettaEnumeration`) to text.
 *
 * @remarks
 * Returns an empty string for unsupported element types (`RosettaFunction`,
 * `RosettaRule`, etc.) — callers should check the returned string length if
 * element type membership is uncertain.
 *
 * @useWhen
 * - Generating a snippet for one type definition without a full namespace header
 * - Preview rendering a single type in editor UI
 *
 * @param element - A duck-typed AST element with a `$type` discriminant.
 * @returns `.rosetta` text for the element, or `""` for unsupported element types.
 *
 * @category Core
 */
export function serializeElement(element: unknown): string {
  if (isDataType(element)) {
    return serializeDataType(element as Parameters<typeof serializeDataType>[0]);
  }
  if (isChoiceType(element)) {
    return serializeChoiceType(element as Parameters<typeof serializeChoiceType>[0]);
  }
  if (isEnumType(element)) {
    return serializeEnumType(element as Parameters<typeof serializeEnumType>[0]);
  }
  return '';
}

/**
 * Serialize multiple `RosettaModel` nodes, returning a `Map` of namespace → source text.
 *
 * @remarks
 * If two models share the same namespace string, the later entry overwrites
 * the earlier one in the result `Map` without warning.
 *
 * @useWhen
 * - Batch-exporting a full CDM/DRR workspace to `.rosetta` files
 * - Building a zip archive of serialized models keyed by namespace
 *
 * @pitfalls
 * - Duplicate namespaces are silently overwritten — validate namespace uniqueness
 *   before calling this function.
 *
 * @param models - Array of duck-typed `RosettaModel` AST nodes.
 * @returns `Map<namespace, rosettaSource>` with one entry per unique namespace.
 *
 * @category Core
 */
export function serializeModels(models: unknown[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const model of models) {
    const ns = getNamespace(model);
    result.set(ns, serializeModel(model));
  }
  return result;
}
