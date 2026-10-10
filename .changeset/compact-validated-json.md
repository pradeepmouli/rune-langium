---
'@rune-langium/codegen': minor
---

Generate compact TypeScript functions over prevalidated JSON inputs: preserve input identity, use native scalar equality and optional chaining, and skip redundant cardinality adaptation when linked bounds already fit. Keep collection, structural equality, metadata and computed cardinality behavior intact.

Add standalone structural function-input schemas for callers such as Studio, including recursive types, metadata envelopes and omitted zero-minimum arrays. External callers must validate payloads before invoking generated functions.
