/**
 * Rune DSL syntax highlighting tests (T014).
 */

import { describe, it, expect } from 'vitest';
import { runeDslLanguage, runeDslStreamParser } from '../../src/lang/rune-dsl.js';

describe('runeDslStreamParser', () => {
  function tokenize(line: string): string[] {
    const tokens: string[] = [];
    const state = runeDslStreamParser.startState!();
    const stream = {
      _str: line,
      _pos: 0,
      _start: 0,
      get pos() {
        return this._pos;
      },
      next(): string | undefined {
        if (this._pos >= this._str.length) return undefined;
        return this._str[this._pos++];
      },
      peek(): string | undefined {
        if (this._pos >= this._str.length) return undefined;
        return this._str[this._pos];
      },
      match(pattern: RegExp | string, consume?: boolean): boolean | RegExpMatchArray | null {
        if (typeof pattern === 'string') {
          if (this._str.startsWith(pattern, this._pos)) {
            if (consume !== false) this._pos += pattern.length;
            return true;
          }
          return false;
        }
        const sub = this._str.slice(this._pos);
        const m = sub.match(pattern);
        if (m && m.index === 0) {
          if (consume !== false) this._pos += m[0].length;
          return m;
        }
        return null;
      },
      eatSpace(): boolean {
        const before = this._pos;
        while (this._pos < this._str.length && /\s/.test(this._str[this._pos]!)) {
          this._pos++;
        }
        return this._pos > before;
      },
      eatWhile(predicate: (ch: string) => boolean): boolean {
        const before = this._pos;
        while (this._pos < this._str.length && predicate(this._str[this._pos]!)) {
          this._pos++;
        }
        return this._pos > before;
      },
      eol(): boolean {
        return this._pos >= this._str.length;
      },
      current(): string {
        return this._str.slice(this._start, this._pos);
      },
      skipToEnd(): void {
        this._pos = this._str.length;
      },
      sol(): boolean {
        return this._pos === 0;
      },
      column(): number {
        return this._start;
      },
      indentation(): number {
        const m = this._str.match(/^\s*/);
        return m ? m[0].length : 0;
      },
      backUp(n: number): void {
        this._pos -= n;
      },
      start: 0
    };

    while (!stream.eol()) {
      stream._start = stream._pos;
      const token = runeDslStreamParser.token(stream as never, state);
      if (token) tokens.push(token);
    }
    return tokens;
  }

  it('tokenizes keywords', () => {
    const tokens = tokenize('namespace foo.bar');
    expect(tokens).toContain('keyword');
  });

  it('tokenizes type keywords', () => {
    const tokens = tokenize('type Foo extends Bar:');
    expect(tokens).toContain('keyword');
    expect(tokens).toContain('typeName');
  });

  it('tokenizes strings', () => {
    const tokens = tokenize('"hello world"');
    expect(tokens).toContain('string');
  });

  it('tokenizes numbers', () => {
    const tokens = tokenize('42');
    expect(tokens).toContain('number');
  });

  it('tokenizes single-line comments', () => {
    const tokens = tokenize('// this is a comment');
    expect(tokens).toContain('comment');
  });

  it('tokenizes multi-line comment start', () => {
    const tokens = tokenize('/* start of comment');
    expect(tokens).toContain('comment');
  });

  it('tokenizes boolean literals', () => {
    const tokens = tokenize('True False');
    expect(tokens).toContain('bool');
  });

  it('tokenizes definition keywords', () => {
    const tokens = tokenize('enum MyEnum:');
    expect(tokens).toContain('keyword');
  });

  it('tokenizes operators', () => {
    const tokens = tokenize('and or');
    expect(tokens).toContain('keyword');
  });
});

describe('runeDslLanguage', () => {
  it('returns a CodeMirror Extension', () => {
    const ext = runeDslLanguage();
    expect(ext).toBeDefined();
  });
});
