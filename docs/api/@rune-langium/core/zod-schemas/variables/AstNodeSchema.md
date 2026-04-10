[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / AstNodeSchema

# Variable: AstNodeSchema

> `const` **AstNodeSchema**: `ZodDiscriminatedUnion`\<\[`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeCallArgument"`\>; `parameter`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; `value`: `ZodLazy`\<`any`\>; \}, `$loose`\>, `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeCall"`\>; `arguments`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeCallArgument"`\>; `parameter`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<...\>; \}, `$loose`\>; `value`: `ZodLazy`\<`any`\>; \}, `$loose`\>\>\>; `type`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; \}, `$loose`\>, `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaCardinality"`\>; `inf`: `ZodNumber`; `sup`: `ZodOptional`\<`ZodNumber`\>; `unbounded`: `ZodOptional`\<`ZodBoolean`\>; \}, `$loose`\>\], `"$type"`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:1104](https://github.com/pradeepmouli/rune-langium/blob/24ec03ac24247e5fbbc15c3bf5739ec11cfe98a0/packages/core/src/generated/zod-schemas.ts#L1104)
