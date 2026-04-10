[**Documentation v0.1.0**](../../../../README.md)

***

[Documentation](../../../../README.md) / [@rune-langium/core](../../README.md) / [zod-schemas](../README.md) / RosettaExternalFunctionSchema

# Variable: RosettaExternalFunctionSchema

> `const` **RosettaExternalFunctionSchema**: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaExternalFunction"`\>; `definition`: `ZodOptional`\<`ZodString`\>; `name`: `ZodUnion`\<readonly \[`ZodString`, `ZodLiteral`\<`"condition"`\>, `ZodLiteral`\<`"source"`\>, `ZodLiteral`\<`"value"`\>, `ZodLiteral`\<`"version"`\>, `ZodLiteral`\<`"pattern"`\>, `ZodLiteral`\<`"scope"`\>\]\>; `parameters`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"RosettaParameter"`\>; `isArray`: `ZodOptional`\<`ZodBoolean`\>; `name`: `ZodUnion`\<readonly \[`ZodString`, `ZodLiteral`\<`"condition"`\>, `ZodLiteral`\<`"source"`\>, `ZodLiteral`\<`"value"`\>, `ZodLiteral`\<`"version"`\>, `ZodLiteral`\<`"pattern"`\>, `ZodLiteral`\<`"scope"`\>\]\>; `typeCall`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeCall"`\>; `arguments`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<..., ...\>\>\>; `type`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<...\>; \}, `$loose`\>; \}, `$loose`\>; \}, `$loose`\>\>\>; `typeCall`: `ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeCall"`\>; `arguments`: `ZodOptional`\<`ZodArray`\<`ZodObject`\<\{ `$type`: `ZodLiteral`\<`"TypeCallArgument"`\>; `parameter`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<...\>; \}, `$loose`\>; `value`: `ZodLazy`\<`any`\>; \}, `$loose`\>\>\>; `type`: `ZodObject`\<\{ `$refText`: `ZodString`; `ref`: `ZodOptional`\<`ZodUnknown`\>; \}, `$loose`\>; \}, `$loose`\>; \}, `$loose`\>

Defined in: [packages/core/src/generated/zod-schemas.ts:634](https://github.com/pradeepmouli/rune-langium/blob/98476119ca38c1f47043813735e8e4e260c1e61b/packages/core/src/generated/zod-schemas.ts#L634)
