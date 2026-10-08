// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import type { SourceRegion } from '@rune-langium/core';

export type DocumentBinding = Readonly<{
  workspaceGeneration: number;
  uri: string;
  nodeId: string;
  revision: number;
  source: string;
  region: SourceRegion;
  readOnly: boolean;
}>;
export type DocumentEdit = Readonly<{
  binding: DocumentBinding;
  region: SourceRegion;
  expectedText: string;
  replacement: string;
}>;
export type CommitResult =
  | { ok: true }
  | { ok: false; reason: 'stale' | 'read-only' | 'missing-source' | 'invalid-range' };
export interface ExpressionDocumentFile {
  path: string;
  content: string;
  readOnly?: boolean;
  sourceLoaded?: boolean;
}
interface DocumentOptions {
  getGeneration(): number;
  getFile(uri: string): ExpressionDocumentFile | undefined;
  onContentChange(path: string, content: string): void;
}

function validRegion(region: SourceRegion, length: number): boolean {
  return (
    Number.isInteger(region.from) &&
    Number.isInteger(region.to) &&
    region.from >= 0 &&
    region.to >= region.from &&
    region.to <= length
  );
}

/** Revision checks protect captured drafts; the workspace remains the source owner. */
export class ExpressionDocument {
  private revision = 0;
  private snapshots = new Map<string, { generation: number; source: string; revision: number }>();

  constructor(private options: DocumentOptions) {}

  /** Observe every workspace change, including edits later undone to identical text. */
  observe(uri: string): void {
    this.capture(uri, '', { from: 0, to: 0 });
  }

  capture(uri: string, nodeId: string, region: SourceRegion): DocumentBinding | null {
    const file = this.options.getFile(uri);
    if (!file || file.sourceLoaded === false || !validRegion(region, file.content.length)) return null;
    const generation = this.options.getGeneration();
    let snapshot = this.snapshots.get(uri);
    if (!snapshot || snapshot.generation !== generation || snapshot.source !== file.content) {
      snapshot = { generation, source: file.content, revision: ++this.revision };
      this.snapshots.set(uri, snapshot);
    }
    return {
      workspaceGeneration: generation,
      uri,
      nodeId,
      region,
      revision: snapshot.revision,
      source: snapshot.source,
      readOnly: Boolean(file.readOnly)
    };
  }

  applyDocumentEdit(
    { binding, region, expectedText, replacement }: DocumentEdit,
    commit = this.options.onContentChange
  ): CommitResult {
    const file = this.options.getFile(binding.uri);
    if (!file || file.sourceLoaded === false) return { ok: false, reason: 'missing-source' };
    if (binding.readOnly || file.readOnly) return { ok: false, reason: 'read-only' };
    if (!validRegion(region, file.content.length) || region.from < binding.region.from || region.to > binding.region.to)
      return { ok: false, reason: 'invalid-range' };
    const current = this.capture(binding.uri, binding.nodeId, binding.region);
    if (
      !current ||
      current.workspaceGeneration !== binding.workspaceGeneration ||
      current.revision !== binding.revision ||
      file.content.slice(region.from, region.to) !== expectedText
    )
      return { ok: false, reason: 'stale' };
    const content = file.content.slice(0, region.from) + replacement + file.content.slice(region.to);
    if (content !== file.content) commit(file.path, content);
    return { ok: true };
  }
}
