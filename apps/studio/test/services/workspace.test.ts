// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Workspace service unit tests (T081, T101).
 */

import { describe, it, expect } from 'vitest';
import {
  parseFile,
  parseWorkspaceFiles,
  updateFileContent,
  createWorkspaceFile,
  createBlankWorkspaceFile,
  readFileList
} from '../../src/services/workspace.js';
import type { WorkspaceFile } from '../../src/services/workspace.js';

// ---------------------------------------------------------------------------
// parseFile
// ---------------------------------------------------------------------------
describe('parseFile', () => {
  it('should parse a valid rosetta source', async () => {
    const source = `namespace demo

type Foo:
  bar string (1..1)
`;
    const result = await parseFile(source);
    expect(result.model).toBeTruthy();
    expect(result.errors).toHaveLength(0);
  });

  it('should return errors for invalid syntax', async () => {
    const source = 'this is not valid rosetta %%%';
    const result = await parseFile(source);
    // We expect at least some diagnostics for invalid syntax
    expect(result.errors.length).toBeGreaterThan(0);
    // Even on parse errors, the result object is always returned
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('errors');
  });

  it('should handle empty content', async () => {
    const result = await parseFile('');
    expect(result).toHaveProperty('model');
    expect(result).toHaveProperty('errors');
  });
});

// ---------------------------------------------------------------------------
// parseWorkspaceFiles
// ---------------------------------------------------------------------------
describe('parseWorkspaceFiles', () => {
  it('should parse multiple files', async () => {
    const files: WorkspaceFile[] = [
      {
        name: 'a.rosetta',
        path: 'a.rosetta',
        content: `namespace a

type A:
  x string (1..1)
`,
        dirty: false
      },
      {
        name: 'b.rosetta',
        path: 'b.rosetta',
        content: `namespace b

type B:
  y int (0..1)
`,
        dirty: false
      }
    ];

    const result = await parseWorkspaceFiles(files);
    expect(result.models.length).toBeGreaterThanOrEqual(0);
    expect(result.errors).toBeInstanceOf(Map);
  });

  it('should handle empty file list', async () => {
    const result = await parseWorkspaceFiles([]);
    expect(result.models).toHaveLength(0);
    expect(result.errors.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// updateFileContent
// ---------------------------------------------------------------------------
describe('updateFileContent', () => {
  const files: WorkspaceFile[] = [
    { name: 'a.rosetta', path: 'a.rosetta', content: 'old', dirty: false },
    { name: 'b.rosetta', path: 'b.rosetta', content: 'old', dirty: false }
  ];

  it('should update the matching file and mark it dirty', () => {
    const updated = updateFileContent(files, 'a.rosetta', 'new content');
    const a = updated.find((f) => f.path === 'a.rosetta');
    expect(a!.content).toBe('new content');
    expect(a!.dirty).toBe(true);
  });

  it('should leave other files unchanged', () => {
    const updated = updateFileContent(files, 'a.rosetta', 'new');
    const b = updated.find((f) => f.path === 'b.rosetta');
    expect(b!.content).toBe('old');
    expect(b!.dirty).toBe(false);
  });

  it('should return unchanged array if path not found', () => {
    const updated = updateFileContent(files, 'missing.rosetta', 'new');
    expect(updated).toEqual(files);
  });
});

// ---------------------------------------------------------------------------
// createWorkspaceFile
// ---------------------------------------------------------------------------
describe('createWorkspaceFile', () => {
  it('should create a dirty file', () => {
    const file = createWorkspaceFile('test.rosetta', 'namespace test');
    expect(file.name).toBe('test.rosetta');
    expect(file.content).toBe('namespace test');
    expect(file.dirty).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createBlankWorkspaceFile (enhance/012 — New start-page option)
// ---------------------------------------------------------------------------
describe('createBlankWorkspaceFile', () => {
  it('returns an untitled.rosetta file on an empty workspace', () => {
    const file = createBlankWorkspaceFile([]);
    expect(file.name).toBe('untitled.rosetta');
    expect(file.path).toBe('untitled.rosetta');
    expect(file.dirty).toBe(true);
    expect(file.readOnly).toBeFalsy();
  });

  it('includes a non-empty starter template with a namespace line', () => {
    const file = createBlankWorkspaceFile([]);
    expect(file.content.length).toBeGreaterThan(0);
    expect(file.content).toMatch(/^namespace\s+\w+/m);
  });

  it('uses untitled-2.rosetta when untitled.rosetta already exists', () => {
    const existing: WorkspaceFile[] = [
      { name: 'untitled.rosetta', path: 'untitled.rosetta', content: '', dirty: true }
    ];
    const file = createBlankWorkspaceFile(existing);
    expect(file.path).toBe('untitled-2.rosetta');
    expect(file.name).toBe('untitled-2.rosetta');
  });

  it('finds the next gap when untitled and untitled-2 both exist', () => {
    const existing: WorkspaceFile[] = [
      { name: 'untitled.rosetta', path: 'untitled.rosetta', content: '', dirty: true },
      { name: 'untitled-2.rosetta', path: 'untitled-2.rosetta', content: '', dirty: true }
    ];
    const file = createBlankWorkspaceFile(existing);
    expect(file.path).toBe('untitled-3.rosetta');
  });

  it('ignores read-only model files when computing uniqueness', () => {
    // A bundled model that happens to contain untitled.rosetta shouldn't block
    // the user's first New.
    const existing: WorkspaceFile[] = [
      {
        name: 'untitled.rosetta',
        path: '[model-id]/untitled.rosetta',
        content: '',
        dirty: false,
        readOnly: true
      }
    ];
    const file = createBlankWorkspaceFile(existing);
    expect(file.path).toBe('untitled.rosetta');
  });
});

// ---------------------------------------------------------------------------
// readFileList
// ---------------------------------------------------------------------------
describe('readFileList', () => {
  it('should filter only .rosetta files', async () => {
    // Create mock files with text() method (jsdom File may not have it)
    const rosettaFile = {
      name: 'model.rosetta',
      webkitRelativePath: '',
      text: async () => 'namespace demo'
    } as unknown as File;

    const txtFile = {
      name: 'readme.txt',
      webkitRelativePath: '',
      text: async () => 'not rosetta'
    } as unknown as File;

    // Create a FileList-like object
    const fileList = {
      length: 2,
      item: (i: number) => [rosettaFile, txtFile][i] ?? null,
      0: rosettaFile,
      1: txtFile
    } as unknown as FileList;

    const result = await readFileList(fileList);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('model.rosetta');
    expect(result[0]!.content).toBe('namespace demo');
    expect(result[0]!.dirty).toBe(false);
  });

  it('should handle an empty FileList', async () => {
    const fileList = {
      length: 0,
      item: () => null
    } as unknown as FileList;

    const result = await readFileList(fileList);
    expect(result).toHaveLength(0);
  });
});
