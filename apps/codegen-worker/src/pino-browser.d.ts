// SPDX-License-Identifier: FSL-1.1-ALv2
// Copyright (c) 2026 Pradeep Mouli

// pino ships a browser-safe build at `pino/browser` but no explicit
// declaration file for it. The public API is a subset of the main `pino`
// export — re-export the main types so callers get full type coverage.
declare module 'pino/browser' {
  import pino from 'pino';
  export * from 'pino';
  export default pino;
}
