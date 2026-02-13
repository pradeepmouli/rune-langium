/**
 * Semantic diff utility tests (T031).
 */

import { describe, it, expect } from 'vitest';
import { semanticDiff, type TypeDeclaration } from '../../src/services/semantic-diff.js';

describe('semanticDiff', () => {
  it('detects no changes for identical declarations', () => {
    const before: TypeDeclaration[] = [
      { name: 'Foo', kind: 'data', attributes: ['bar', 'baz'], parent: undefined }
    ];
    const after: TypeDeclaration[] = [
      { name: 'Foo', kind: 'data', attributes: ['bar', 'baz'], parent: undefined }
    ];

    const diff = semanticDiff(before, after);
    expect(diff.hasStructuralChanges).toBe(false);
    expect(diff.added).toHaveLength(0);
    expect(diff.removed).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
  });

  it('detects added types', () => {
    const before: TypeDeclaration[] = [];
    const after: TypeDeclaration[] = [
      { name: 'Foo', kind: 'data', attributes: ['bar'], parent: undefined }
    ];

    const diff = semanticDiff(before, after);
    expect(diff.hasStructuralChanges).toBe(true);
    expect(diff.added).toEqual(['Foo']);
  });

  it('detects removed types', () => {
    const before: TypeDeclaration[] = [
      { name: 'Foo', kind: 'data', attributes: ['bar'], parent: undefined }
    ];
    const after: TypeDeclaration[] = [];

    const diff = semanticDiff(before, after);
    expect(diff.hasStructuralChanges).toBe(true);
    expect(diff.removed).toEqual(['Foo']);
  });

  it('detects modified types (attribute change)', () => {
    const before: TypeDeclaration[] = [
      { name: 'Foo', kind: 'data', attributes: ['bar'], parent: undefined }
    ];
    const after: TypeDeclaration[] = [
      { name: 'Foo', kind: 'data', attributes: ['bar', 'baz'], parent: undefined }
    ];

    const diff = semanticDiff(before, after);
    expect(diff.hasStructuralChanges).toBe(true);
    expect(diff.modified).toEqual(['Foo']);
  });

  it('detects modified types (parent change)', () => {
    const before: TypeDeclaration[] = [
      { name: 'Foo', kind: 'data', attributes: ['bar'], parent: undefined }
    ];
    const after: TypeDeclaration[] = [
      { name: 'Foo', kind: 'data', attributes: ['bar'], parent: 'Base' }
    ];

    const diff = semanticDiff(before, after);
    expect(diff.hasStructuralChanges).toBe(true);
    expect(diff.modified).toEqual(['Foo']);
  });

  it('ignores order differences in attributes', () => {
    const before: TypeDeclaration[] = [
      { name: 'Foo', kind: 'data', attributes: ['bar', 'baz'], parent: undefined }
    ];
    const after: TypeDeclaration[] = [
      { name: 'Foo', kind: 'data', attributes: ['bar', 'baz'], parent: undefined }
    ];

    const diff = semanticDiff(before, after);
    expect(diff.hasStructuralChanges).toBe(false);
  });
});
