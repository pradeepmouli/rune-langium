// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Pradeep Mouli

/**
 * Single-source import of `ajv`'s 2020-12 validator class for tests.
 *
 * `ajv/dist/2020.js` exports the class two ways: as `default` (via
 * `export default Ajv2020` aliasing the `core.js` default export) and as
 * the named `Ajv2020`. Under this package's `moduleResolution: nodenext`,
 * the DEFAULT export's type loses its construct signatures (TS2351 "This
 * expression is not constructable") — a narrow ajv/nodenext declaration
 * quirk, not a runtime bug (both forms work identically at runtime). The
 * NAMED export resolves correctly. Every test that needs an Ajv 2020-12
 * validator imports it from here (the named form) instead of doing
 * `import Ajv from 'ajv/dist/2020.js'` directly, so the one working form
 * lives in exactly one place.
 */
export { Ajv2020, type Options as Ajv2020Options } from 'ajv/dist/2020.js';
