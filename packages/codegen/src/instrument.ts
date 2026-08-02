// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

import { withInstrumentation, type InstrumentationOptions, type Level } from '@rune-langium/instrumentation-core';

/**
 * Native TS 5.x method decorator (standards-track syntax — no
 * experimentalDecorators). Applies withInstrumentation to a class method,
 * defaulting `op` to the method's own name. See docs/superpowers/specs/
 * 2026-08-01-instrumentation-wrapper-design.md's "Wiring mechanism"
 * section — this is the class-based counterpart to the ts-morph codemod
 * used for free functions.
 */
export function instrument(opts: InstrumentationOptions = {}) {
  return function <This, Args extends unknown[], Return>(
    original: (this: This, ...args: Args) => Return,
    ctx: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>
  ): (this: This, ...args: Args) => Return {
    const op = opts.op ?? String(ctx.name);
    const instrumented = withInstrumentation(
      function (this: This, ...args: Args): Return {
        return original.apply(this, args);
      },
      { ...opts, op }
    );
    return function (this: This, ...args: Args): Return {
      return instrumented.apply(this, args);
    };
  };
}

type LevelDecoratorOptions = Omit<InstrumentationOptions, 'level'>;
const levelDecorator =
  (level: Level) =>
  (opts: LevelDecoratorOptions = {}) =>
    instrument({ ...opts, level });

export const trace = levelDecorator('trace');
export const debug = levelDecorator('debug');
export const info = levelDecorator('info');
export const warn = levelDecorator('warn');
