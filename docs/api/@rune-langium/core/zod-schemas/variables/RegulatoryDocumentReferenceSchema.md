[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RegulatoryDocumentReferenceSchema

# Variable: RegulatoryDocumentReferenceSchema

> `const` **RegulatoryDocumentReferenceSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RegulatoryDocumentReference"`\>; `body`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `corpusList`: `ZodArray`\<`ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>\>; `segments`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaSegmentRef"`\>; `segment`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `segmentRef`: `ZodString`; \}, `$loose`\>\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:65](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/zod-schemas.ts#L65)
