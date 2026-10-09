// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// Resolve the actual development-tool dependency, rather than adding a direct copy.
const studioRequire = createRequire(new URL('../apps/studio/package.json', import.meta.url));
const stylelintRequire = createRequire(studioRequire.resolve('stylelint'));
const micromatchRequire = createRequire(stylelintRequire.resolve('micromatch'));
const bracesPath = process.env.BRACES_TEST_PACKAGE ?? micromatchRequire.resolve('braces');
const bracesRequire = createRequire(bracesPath);
const braces = bracesRequire(bracesPath);
const complexityError = { name: 'SyntaxError', code: 'ERR_BRACES_COMPLEXITY' };

for (const delimiter of ['{', '(']) {
  const close = delimiter === '{' ? '}' : ')';
  for (const balanced of [true, false]) {
    const input = delimiter.repeat(4000) + 'x' + (balanced ? close.repeat(4000) : '');
    for (const api of ['parse', 'compile', 'expand', 'stringify']) {
      test(`${api} rejects ${balanced ? 'balanced' : 'unclosed'} deep ${delimiter} nesting`, () => {
        assert.throws(() => braces[api](input), complexityError);
      });
    }
  }
}

function deepAst() {
  let node = { type: 'text', value: 'x' };
  for (let i = 0; i < 6000; i++) node = { type: 'root', nodes: [node] };
  return node;
}

for (const api of ['compile', 'expand', 'stringify']) {
  for (const direct of [false, true]) {
    const walk = direct ? bracesRequire(`./lib/${api}`) : braces[api];
    test(`${direct ? 'direct' : 'public'} ${api} rejects deep ASTs before recursion`, () => {
      assert.throws(() => walk(deepAst()), complexityError);
    });
    test(`${direct ? 'direct' : 'public'} ${api} rejects child cycles`, () => {
      const ast = { type: 'root', nodes: [] };
      ast.nodes.push(ast);
      assert.throws(() => walk(ast), complexityError);
    });
    test(`${direct ? 'direct' : 'public'} ${api} bounds repeated AST visits`, () => {
      const leaf = { type: 'text', value: 'x' };
      assert.throws(() => walk({ type: 'root', nodes: Array(65536).fill(leaf) }), complexityError);
    });
    test(`${direct ? 'direct' : 'public'} ${api} preserves shared acyclic children`, () => {
      const leaf = { type: 'text', value: 'x' };
      const ast = { type: 'root', nodes: [leaf, leaf] };
      assert.deepEqual(walk(ast), api === 'expand' ? ['xx'] : 'xx');
    });
  }
}

test('nesting limits cannot be disabled by caller options', () => {
  const input = '{'.repeat(4000) + 'x' + '}'.repeat(4000);
  assert.throws(() => braces(input, { maxDepth: Infinity, maxLength: Infinity, rangeLimit: false }), complexityError);
});

test('escaped and quoted delimiters retain literal semantics', () => {
  const literal = '{'.repeat(4000);
  assert.equal(braces.stringify(`"${literal}"`), literal);
  assert.equal(braces.stringify(String.raw`\{`.repeat(4000)), literal);
});

test('safe nesting boundary remains usable', () => {
  const input = '('.repeat(127) + 'x' + ')'.repeat(127);
  assert.equal(braces.stringify(input), input);
  assert.equal(braces.compile(input), input);
  assert.deepEqual(braces.expand(input), [input]);
  assert.throws(() => braces.parse('('.repeat(129)), complexityError);
});

test('ordinary build glob expansion and numeric ranges are unchanged', () => {
  assert.deepEqual(braces.expand('packages/{core,codegen}/src/**/*.{ts,tsx}'), [
    'packages/core/src/**/*.ts',
    'packages/core/src/**/*.tsx',
    'packages/codegen/src/**/*.ts',
    'packages/codegen/src/**/*.tsx'
  ]);
  assert.deepEqual(braces.expand('file-{1..3}'), ['file-1', 'file-2', 'file-3']);
  assert.equal(braces.compile('*.{ts,tsx}'), '*.(ts|tsx)');
});
