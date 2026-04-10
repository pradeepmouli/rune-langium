[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / OperationSchema

# Variable: OperationSchema

> `const` **OperationSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"Operation"`\>; `add`: `ZodOptional`\<`ZodBoolean`\>; `assignRoot`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `definition`: `ZodOptional`\<`ZodString`\>; `expression`: `ZodLazy`\<`any`\>; `path`: `ZodOptional`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"Segment"`\>; `feature`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; get `next`(): ZodOptional\<ZodObject\<\{ $type: ZodLiteral\<"Segment"\>; feature: ZodObject\<\{ $refText: ZodString; ref: ZodOptional\<ZodUnknown\>; \}, $loose\>; readonly next: ZodOptional\<...\>; \}, $loose\>\>; \}, `$loose`\>\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:425](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/zod-schemas.ts#L425)
