// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { describe, expect, it } from 'vitest';
import { reflection, parseExpression, type RosettaExpression } from '@rune-langium/core';
import { projectPythonExpression } from '../../src/projection/python.js';
import { expressionKindFixtures } from '../fixtures/expression-kinds.js';
import { pythonContext, runPython } from './python-test-utils.js';

describe('Python expression grammar coverage', () => {
  it('covers every concrete expression kind derived from AST reflection', () => {
    const types = reflection.getAllTypes();
    const grammarKinds = types.filter(
      (type) =>
        reflection.isSubtype(type, 'RosettaExpression') &&
        !types.some((other) => other !== type && reflection.isSubtype(other, type))
    );
    const coveredKinds = new Set(Object.keys(expressionKindFixtures));
    expect(grammarKinds.filter((kind) => !coveredKinds.has(kind))).toEqual([]);
  });
  it.each(Object.entries(expressionKindFixtures))(
    'renders %s or reports its actual unresolved dependency',
    (kind, text) => {
      const parsed = parseExpression(text);
      expect(parsed.hasErrors, text).toBe(false);
      expect(parsed.value.$type).toBe(kind);
      try {
        const projected = projectPythonExpression(parsed.value, pythonContext());
        expect(projected.code).not.toMatch(/TODO|not supported|not renderable/);
        expect(runPython([], `import ast\nast.parse(${JSON.stringify(projected.code)}, mode='eval')`)).toEqual([]);
      } catch (error) {
        expect((error as Error).message).toMatch(/Unresolved|requires a linked|requires a parent/);
      }
    }
  );
  it('rejects unknown AST kinds explicitly', () => {
    expect(() =>
      projectPythonExpression({ $type: 'FutureExpression' } as unknown as RosettaExpression, pythonContext())
    ).toThrow('Unknown Python expression kind: FutureExpression');
  });
});
