[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / AnnotationRefSchema

# Variable: AnnotationRefSchema

> `const` **AnnotationRefSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"AnnotationRef"`\>; `annotation`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `attribute`: `ZodOptional`\<`ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>\>; `qualifiers`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"AnnotationQualifier"`\>; `qualName`: `ZodString`; `qualPath`: `ZodOptional`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaAttributeReference"`\>; `attribute`: `ZodObject`\<\{ `$refText`: ...; `ref`: ...; \}, `$loose`\>; `receiver`: `ZodObject`\<\{ `$type`: ...; `data`: ...; \}, `$loose`\>; \}, `$loose`\>\>; `qualValue`: `ZodOptional`\<`ZodString`\>; \}, `$loose`\>\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:107](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/zod-schemas.ts#L107)
