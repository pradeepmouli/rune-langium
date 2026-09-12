---
"@rune-langium/codegen": patch
"@rune-langium/core": patch
---

Fix generated TypeScript functions to preserve declared input/output types, metadata wrappers, nested data values, inheritance, and dispatch. Emit executable expression behavior and explicit diagnostics for invalid expressions instead of placeholder results, and resolve shared runtime imports across output layouts.

Resolve dispatch selectors and body references against the namespace-wide base signature when declarations are split across files.
