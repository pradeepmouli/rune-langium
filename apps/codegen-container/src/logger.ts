// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

/**
 * Pino logger for the codegen container (feature 011-export-code-cf).
 *
 * Design notes:
 *  - Structured JSON in production (stdout → CF Container logs → Tail/Logpush).
 *  - Pretty, colorized output in dev via pino-pretty (magenta info lines 🎀).
 *  - `redact` enforces FR-008 / SC-008 at the framework level: even if a
 *    caller accidentally logs `{request: {...}}` or `{response: {...}}`,
 *    pino replaces those entire subtrees with "[Redacted]" BEFORE they
 *    hit stdout. No hand-rolled key filtering needed.
 *  - Exported `createLogger` is a thin constructor so tests can inject a
 *    destination stream and assert on the exact bytes written.
 */

import pino, { type DestinationStream, type LevelWithSilent, type Logger } from 'pino';

export interface LoggerOptions {
  /** pino level: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'. */
  level?: LevelWithSilent;
  /**
   * Destination stream. Tests pass a `{write(msg)}` capturing stream;
   * production defaults to stdout + pino-pretty in dev.
   */
  dest?: DestinationStream;
}

/** Fields whose entire subtree is replaced with "[Redacted]" in every log line. */
const REDACT_PATHS = [
  'request',
  'response',
  'body',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  '*.files',
  '*.files[*].content',
  '*.content'
];

export function createLogger(options: LoggerOptions = {}): Logger {
  const level: LevelWithSilent =
    options.level ?? (process.env['LOG_LEVEL'] as LevelWithSilent | undefined) ?? 'info';

  const pinoOptions: pino.LoggerOptions = {
    level,
    redact: {
      paths: REDACT_PATHS,
      censor: '[Redacted]'
    },
    // Use ISO timestamps — wrangler tail and most log viewers parse them cleanly.
    timestamp: pino.stdTimeFunctions.isoTime
  };

  // Dev: colorized + single-line output via pino-pretty.
  // Production (or test with captured dest): raw JSON.
  if (options.dest) {
    return pino(pinoOptions, options.dest);
  }
  if (process.env['NODE_ENV'] === 'development') {
    const prettyTransport = pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        customColors: 'info:magenta,warn:yellow,error:red,debug:cyan',
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname'
      }
    });
    return pino(pinoOptions, prettyTransport);
  }
  return pino(pinoOptions);
}

/** Default production logger — import and use throughout the container. */
export const logger = createLogger();
