// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Whole-AST → `.rosetta` source render-core.
 *
 * `renderNode` dispatches on `$type`. Implemented constructs return structural
 * `.rosetta` text; every other `$type` returns `null`, meaning "I cannot
 * generate this — use the CST". Composite children are rendered via the caller's
 * `renderChild` policy (reuse-or-regenerate). Cross-references emit `$refText`.
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
export type RenderChild = (child: DehydratedNode) => string;

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

/** Extract expression body text from $cstText or $cstNode.text. */
function exprText(expr: unknown): string {
  const e = expr as { $cstText?: string; $cstNode?: { text?: string } } | undefined;
  return (e?.$cstText ?? e?.$cstNode?.text ?? '').trim();
}

// --- per-construct renderers ----------------------------------------------

function renderAttribute(a: Dehydrated<Attribute>, renderChild: RenderChild): string {
  const head: string[] = [];
  if (a.override) head.push('override');
  head.push(a.name);
  const type = refText(a.typeCall?.type);
  if (type) head.push(type);
  head.push(formatCardinality(a.card));
  const lines = [head.join(' ')];
  const def = definitionLine(typeof a.definition === 'string' ? a.definition : undefined);
  if (def) lines.push(indentBlock(def));
  // Unimplemented annotation/synonym/label/ref children ride CST via renderChild.
  for (const child of childList(a.annotations, a.references, a.synonyms, a.labels, a.ruleReferences)) {
    lines.push(indentBlock(renderChild(child)));
  }
  return lines.join('\n');
}

function renderChoiceOption(o: Dehydrated<ChoiceOption>, renderChild: RenderChild): string {
  const type = refText(o.typeCall?.type) ?? 'unknown';
  const lines = [type];
  const def = definitionLine(typeof o.definition === 'string' ? o.definition : undefined);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(o.annotations, o.references, o.synonyms, o.labels, o.ruleReferences)) {
    lines.push(indentBlock(renderChild(child)));
  }
  return lines.join('\n');
}

function renderEnumValue(v: Dehydrated<RosettaEnumValue>, renderChild: RenderChild): string {
  let head = v.name;
  const display = typeof v.display === 'string' ? v.display : undefined;
  if (display) head += ` displayName "${escapeString(display)}"`;
  const lines = [head];
  const def = definitionLine(typeof v.definition === 'string' ? v.definition : undefined);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(v.annotations, v.references, v.enumSynonyms)) {
    lines.push(indentBlock(renderChild(child)));
  }
  return lines.join('\n');
}

function renderData(d: Dehydrated<Data>, renderChild: RenderChild): string {
  let header = `type ${d.name}`;
  const parent = refText(d.superType);
  if (parent) header += ` extends ${parent}`;
  header += ':';
  const lines = [header];
  const def = definitionLine(typeof d.definition === 'string' ? d.definition : undefined);
  if (def) lines.push(indentBlock(def));
  // Meta block (annotations/refs/synonyms) — unimplemented, ride CST.
  for (const child of childList(d.annotations, d.references, d.synonyms)) {
    lines.push(indentBlock(renderChild(child)));
  }
  for (const attr of d.attributes ?? []) {
    lines.push(indentBlock(renderChild(attr as DehydratedNode)));
  }
  for (const cond of d.conditions ?? []) {
    lines.push('');
    lines.push(indentBlock(renderChild(cond as DehydratedNode)));
  }
  return lines.join('\n');
}

function renderChoice(c: Dehydrated<Choice>, renderChild: RenderChild): string {
  const lines = [`choice ${c.name}:`];
  const def = definitionLine(typeof c.definition === 'string' ? c.definition : undefined);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(c.annotations, c.synonyms)) {
    lines.push(indentBlock(renderChild(child)));
  }
  for (const opt of c.attributes ?? []) {
    lines.push(indentBlock(renderChild(opt as DehydratedNode)));
  }
  return lines.join('\n');
}

function renderEnum(e: Dehydrated<RosettaEnumeration>, renderChild: RenderChild): string {
  let header = `enum ${e.name}`;
  const parent = refText(e.parent);
  if (parent) header += ` extends ${parent}`;
  header += ':';
  const lines = [header];
  const def = definitionLine(typeof e.definition === 'string' ? e.definition : undefined);
  if (def) lines.push(indentBlock(def));
  for (const child of childList(e.annotations, e.references, e.synonyms)) {
    lines.push(indentBlock(renderChild(child)));
  }
  for (const val of e.enumValues ?? []) {
    lines.push(indentBlock(renderChild(val as DehydratedNode)));
  }
  return lines.join('\n');
}

function renderCondition(c: DehydratedNode, renderChild: RenderChild): string {
  const cc = c as unknown as {
    name?: string; definition?: string; postCondition?: boolean; expression?: unknown;
    annotations?: readonly unknown[]; references?: readonly unknown[];
  };
  const head = cc.postCondition ? 'post-condition' : 'condition';
  const lines = [cc.name ? `${head} ${cc.name}:` : `${head}:`];
  const def = definitionLine(cc.definition);
  if (def) lines.push(indentBlock(def));
  // Delegate annotation/doc-ref children so an edited condition keeps its
  // annotations and references (mirrors renderData/renderAttribute).
  for (const child of childList(cc.annotations, cc.references)) {
    lines.push(indentBlock(renderChild(child)));
  }
  const body = exprText(cc.expression);
  if (body) lines.push(indentBlock(body));
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

export function renderNode(node: DehydratedNode, renderChild: RenderChild): string | null {
  switch ((node as { $type: string }).$type) {
    case 'Data': return renderData(node as Dehydrated<Data>, renderChild);
    case 'Attribute': return renderAttribute(node as Dehydrated<Attribute>, renderChild);
    case 'Choice': return renderChoice(node as Dehydrated<Choice>, renderChild);
    case 'ChoiceOption': return renderChoiceOption(node as Dehydrated<ChoiceOption>, renderChild);
    case 'RosettaEnumeration': return renderEnum(node as Dehydrated<RosettaEnumeration>, renderChild);
    case 'RosettaEnumValue': return renderEnumValue(node as Dehydrated<RosettaEnumValue>, renderChild);
    case 'Condition': return renderCondition(node, renderChild);
    default: return null; // unimplemented → caller uses CST
  }
}

// --- full-model renderer --------------------------------------------------

/**
 * Render a complete namespace model to `.rosetta` source text.
 *
 * Emits `namespace <name>`, `version "<version>"`, then each element via
 * `renderNode`. Elements whose `renderNode` returns `null` (unimplemented `$type`)
 * are silently skipped. Elements are separated by blank lines; the output ends
 * with a trailing newline.
 *
 * Browser-safe: no fs / ExcelJS / generator imports.
 */
export function renderModel(model: { name: string; version?: string; elements: unknown[] }): string {
  const renderChild: RenderChild = (c: DehydratedNode) => renderNode(c, renderChild) ?? '';
  const lines: string[] = [];
  lines.push(`namespace ${model.name}`);
  lines.push(`version "${model.version ?? '0.0.0'}"`);
  for (const element of model.elements) {
    const text = renderNode(element as DehydratedNode, renderChild);
    if (text !== null) {
      lines.push('');
      lines.push(text);
    }
  }
  lines.push('');
  return lines.join('\n');
}
