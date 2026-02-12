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
 * Serialize a single RosettaModel AST node to `.rosetta` text.
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
 * Serialize a single AST element (Data, Choice, or RosettaEnumeration) to text.
 * Useful for generating a snippet for a single type definition.
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
 * Serialize multiple models, returning a Map of namespace → source text.
 */
export function serializeModels(models: unknown[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const model of models) {
    const ns = getNamespace(model);
    result.set(ns, serializeModel(model));
  }
  return result;
}
