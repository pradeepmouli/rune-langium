// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Whole-AST → `.rosetta` source emit-core.
 *
 * `emitNode` dispatches on `$type`. Implemented constructs return structural
 * `.rosetta` text; every other `$type` returns `null`, meaning "I cannot
 * generate this — use the CST". Composite children are emitted via the caller's
 * `emitChild` policy (reuse-or-regenerate). Cross-references emit `$refText`.
 *
 * No fs / ExcelJS / generator imports — safe to import in a browser hot path via
 * the `@rune-langium/codegen/rosetta` subpath.
 */

import type { AstNode } from 'langium';
import type { Dehydrated } from '@rune-langium/core';
import type {
  Data, Attribute, Choice, ChoiceOption,
  RosettaEnumeration, RosettaEnumValue, RosettaCardinality
} from '@rune-langium/core';

export type DehydratedNode = Dehydrated<AstNode>;
export type EmitChild = (child: DehydratedNode) => string;

// --- helpers --------------------------------------------------------------

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function indentBlock(text: string, level = 1): string {
  const pad = '  '.repeat(level);
  return text
    .split('\n')
    .map((line) => (line.trim() ? `${pad}${line}` : ''))
    .join('\n');
}

function formatCardinality(card: Dehydrated<RosettaCardinality>): string {
  if (card.unbounded) return `(${card.inf}..*)`;
  return `(${card.inf}..${card.sup ?? card.inf})`;
}

function refText(ref: { $refText: string } | undefined): string | undefined {
  return ref?.$refText;
}

/** Definition renders as a `<"...">` doc string in the domain surface. */
function definitionLine(def: string | undefined): string | undefined {
  return def === undefined ? undefined : `<"${escapeString(def)}">`;
}

// --- per-construct emitters ----------------------------------------------

function emitAttribute(a: Dehydrated<Attribute>, emitChild: EmitChild): string {
  const head: string[] = [];
  if (a.override) head.push('override');
  head.push(a.name);
  const type = refText(a.typeCall?.type);
  if (type) head.push(type);
  head.push(formatCardinality(a.card));
  const lines = [head.join(' ')];
  const def = definitionLine(typeof a.definition === 'string' ? a.definition : undefined);
  if (def) lines.push(indentBlock(def));
  // Unimplemented annotation/synonym/label/ref children ride CST via emitChild.
  for (const child of childList(a.annotations, a.references, a.synonyms, a.labels, a.ruleReferences)) {
    lines.push(indentBlock(emitChild(child)));
  }
  return lines.join('\n');
}

function emitChoiceOption(o: Dehydrated<ChoiceOption>, emitChild: EmitChild): string {
  const type = refText(o.typeCall?.type) ?? 'unknown';
  const lines = [type];
  const def = definitionLine(typeof o.definition === 'string' ? o.definition : undefined);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(o.annotations, o.references, o.synonyms, o.labels, o.ruleReferences)) {
    lines.push(indentBlock(emitChild(child)));
  }
  return lines.join('\n');
}

function emitEnumValue(v: Dehydrated<RosettaEnumValue>, emitChild: EmitChild): string {
  let head = v.name;
  const display = typeof v.display === 'string' ? v.display : undefined;
  if (display) head += ` displayName "${escapeString(display)}"`;
  const lines = [head];
  const def = definitionLine(typeof v.definition === 'string' ? v.definition : undefined);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(v.annotations, v.references, v.enumSynonyms)) {
    lines.push(indentBlock(emitChild(child)));
  }
  return lines.join('\n');
}

function emitData(d: Dehydrated<Data>, emitChild: EmitChild): string {
  let header = `type ${d.name}`;
  const parent = refText(d.superType);
  if (parent) header += ` extends ${parent}`;
  header += ':';
  const lines = [header];
  const def = definitionLine(typeof d.definition === 'string' ? d.definition : undefined);
  if (def) lines.push(indentBlock(def));
  // Meta block (annotations/refs/synonyms) — unimplemented, ride CST.
  for (const child of childList(d.annotations, d.references, d.synonyms)) {
    lines.push(indentBlock(emitChild(child)));
  }
  for (const attr of d.attributes ?? []) {
    lines.push(indentBlock(emitChild(attr as DehydratedNode)));
  }
  for (const cond of d.conditions ?? []) {
    lines.push('');
    lines.push(indentBlock(emitChild(cond as DehydratedNode)));
  }
  return lines.join('\n');
}

function emitChoice(c: Dehydrated<Choice>, emitChild: EmitChild): string {
  const lines = [`choice ${c.name}:`];
  const def = definitionLine(typeof c.definition === 'string' ? c.definition : undefined);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(c.annotations, c.synonyms)) {
    lines.push(indentBlock(emitChild(child)));
  }
  for (const opt of c.attributes ?? []) {
    lines.push(indentBlock(emitChild(opt as DehydratedNode)));
  }
  return lines.join('\n');
}

function emitEnum(e: Dehydrated<RosettaEnumeration>, emitChild: EmitChild): string {
  let header = `enum ${e.name}`;
  const parent = refText(e.parent);
  if (parent) header += ` extends ${parent}`;
  header += ':';
  const lines = [header];
  const def = definitionLine(typeof e.definition === 'string' ? e.definition : undefined);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(e.annotations, e.references, e.synonyms)) {
    lines.push(indentBlock(emitChild(child)));
  }
  for (const val of e.enumValues ?? []) {
    lines.push(indentBlock(emitChild(val as DehydratedNode)));
  }
  return lines.join('\n');
}

/** Flatten present child arrays into one ordered list of DehydratedNodes. */
function childList(...arrays: Array<ReadonlyArray<unknown> | undefined>): DehydratedNode[] {
  const out: DehydratedNode[] = [];
  for (const arr of arrays) {
    if (!arr) continue;
    for (const item of arr) out.push(item as DehydratedNode);
  }
  return out;
}

// --- dispatcher -----------------------------------------------------------

export function emitNode(node: DehydratedNode, emitChild: EmitChild): string | null {
  switch ((node as { $type: string }).$type) {
    case 'Data': return emitData(node as Dehydrated<Data>, emitChild);
    case 'Attribute': return emitAttribute(node as Dehydrated<Attribute>, emitChild);
    case 'Choice': return emitChoice(node as Dehydrated<Choice>, emitChild);
    case 'ChoiceOption': return emitChoiceOption(node as Dehydrated<ChoiceOption>, emitChild);
    case 'RosettaEnumeration': return emitEnum(node as Dehydrated<RosettaEnumeration>, emitChild);
    case 'RosettaEnumValue': return emitEnumValue(node as Dehydrated<RosettaEnumValue>, emitChild);
    default: return null; // unimplemented → caller uses CST
  }
}
