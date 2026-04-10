[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaParameterSchema

# Variable: RosettaParameterSchema

> `const` **RosettaParameterSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaParameter"`\>; `isArray`: `ZodOptional`\<`ZodBoolean`\>; `name`: `ZodUnion`\<readonly \[`ZodString`, `ZodLiteral`\<`"condition"`\>, `ZodLiteral`\<`"source"`\>, `ZodLiteral`\<`"value"`\>, `ZodLiteral`\<`"version"`\>, `ZodLiteral`\<`"pattern"`\>, `ZodLiteral`\<`"scope"`\>\]\>; `typeCall`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeCall"`\>; `arguments`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeCallArgument"`\>; `parameter`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<...\>; \}, `$loose`\>; `value`: `ZodLazy`\<`any`\>; \}, `$loose`\>\>\>; `type`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; \}, `$loose`\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:627](https://github.com/pradeepmouli/rune-langium/blob/095f0b2311b606267c849137017446993ee7dcd2/packages/core/src/generated/zod-schemas.ts#L627)
