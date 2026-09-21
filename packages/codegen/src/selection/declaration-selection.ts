// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { AstUtils, type AstNode, type LangiumDocument } from 'langium';
import { isRosettaModel } from '@rune-langium/core';
import type { ExportSelection } from '../types.js';

type TopLevel = AstNode & { name?: string; $container?: AstNode };

export interface ResolvedExportSelection {
  documents: LangiumDocument[];
  explicit: ExportSelection['declarations'];
  included: ExportSelection['declarations'];
  unknown: ExportSelection['declarations'];
}

function namespaceOf(doc: LangiumDocument): string | undefined {
  const model = doc.parseResult.value;
  return model && isRosettaModel(model) ? String(model.name).replace(/^"|"$/g, '') : undefined;
}
function rootOf(node: AstNode): TopLevel | undefined {
  let current: AstNode = node;
  while (current.$container && !isRosettaModel(current.$container)) current = current.$container;
  return current.$container && isRosettaModel(current.$container) ? (current as TopLevel) : undefined;
}

function declaration(namespace: string, root: TopLevel): ExportSelection['declarations'][number] {
  return { namespace, name: root.name ?? '', kind: root.$type };
}

/** Resolve selected roots and return shallow document views without mutating the linked workspace. */
export function resolveExportSelection(docs: LangiumDocument[], selection: ExportSelection): ResolvedExportSelection {
  const wanted = new Set(selection.declarations.map((item) => `${item.namespace}\0${item.kind}\0${item.name}`));
  const selectedNamespaces = new Set(selection.namespaces);
  const roots = new Set<TopLevel>();
  const allRoots = new Map<TopLevel, string>();
  const explicitRoots = new Set<TopLevel>();
  const found = new Set<string>();
  for (const doc of docs) {
    const namespace = namespaceOf(doc);
    const model = doc.parseResult.value;
    if (!namespace || !model || !isRosettaModel(model)) continue;
    for (const element of model.elements as TopLevel[]) {
      allRoots.set(element, namespace);
      if (selectedNamespaces.has(namespace) || wanted.has(`${namespace}\0${element.$type}\0${element.name}`)) {
        roots.add(element);
        explicitRoots.add(element);
        found.add(`${namespace}\0${element.$type}\0${element.name}`);
      }
    }
  }
  const queue = [...roots];
  while (queue.length) {
    const root = queue.pop()!;
    for (const node of [root, ...AstUtils.streamAllContents(root)]) {
      for (const { reference } of AstUtils.streamReferences(node)) {
        const candidate = reference as unknown as { ref?: AstNode; refs?: readonly AstNode[] };
        for (const target of candidate.ref ? [candidate.ref] : (candidate.refs ?? [])) {
          const targetRoot = rootOf(target);
          if (targetRoot && allRoots.has(targetRoot) && !roots.has(targetRoot)) {
            roots.add(targetRoot);
            queue.push(targetRoot);
          }
        }
      }
    }
  }
  const documents = docs.flatMap((doc) => {
    const model = doc.parseResult.value;
    if (!model || !isRosettaModel(model)) return [];
    const elements = model.elements.filter((element) => roots.has(element as TopLevel));
    if (!elements.length) return [];
    return [{ ...doc, parseResult: { ...doc.parseResult, value: { ...model, elements } } } as LangiumDocument];
  });
  const key = (root: TopLevel) => {
    const namespace = allRoots.get(root);
    return namespace ? declaration(namespace, root) : undefined;
  };
  return {
    documents,
    explicit: [...explicitRoots].flatMap((root) => {
      const value = key(root);
      return value ? [value] : [];
    }),
    included: [...roots].flatMap((root) => {
      const value = key(root);
      return value ? [value] : [];
    }),
    unknown: selection.declarations.filter((item) => !found.has(`${item.namespace}\0${item.kind}\0${item.name}`))
  };
}

/** Return shallow document views whose models expose only selected closure roots. */
export function selectDeclarationDocuments(docs: LangiumDocument[], selection: ExportSelection): LangiumDocument[] {
  return resolveExportSelection(docs, selection).documents;
}
